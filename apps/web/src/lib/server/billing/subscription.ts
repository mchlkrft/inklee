import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import type { ContractCustomerType } from "@/lib/billing";
import { requireStripe } from "./client";
import {
  assertLiveBillingAllowedFor,
  assertSalesLaunchApproved,
} from "./activation";
import {
  resolveFounderOffer,
  recordFounderOfferRedemption,
} from "./founder-offer";

// Subscription checkout create path. Isolated from deposits: distinct metadata
// namespace (billing_flow / artist_id, never booking_id), subscription mode,
// and a mandatory activation-gate check before any live charge can occur.

// The Plus Price is resolved by this stable lookup key (single source; the
// checkout action and the price display both read it). Both modes carry a Price
// with this key since 2026-07-25: LIVE price_1Tx0UvHkG0exykzFmmDjfZA5 + test
// price_1Tx0WVQi3Lu5kKnKtxMW6Vsk (3.00 EUR/month, tax_behavior=inclusive, the
// founder-approved display decision). The old test-only key
// inklee_plus_monthly_eur_test is superseded.
export const PLUS_PRICE_LOOKUP = "inklee_plus_monthly_eur";

// The yearly Plus plan (docs/product/pricing-model.md row 3: 24 EUR first
// year, then 30 EUR per year; counsel approved 2026-07-25) resolves by its own
// lookup key. Both modes carry a Price with this key since 2026-07-25: LIVE
// price_1Tx1zSHkG0exykzF6eSxVQIj + test price_1Tx1zQQi3Lu5kKnKH1fiXuvF
// (30.00 EUR/year, tax_behavior=inclusive). The list price is 30; the
// first-year 24.00 is the FOUNDER OFFER, not a property of the yearly plan.
export const PLUS_YEARLY_PRICE_LOOKUP = "inklee_plus_yearly_eur";

// The founder-offer discount: a duration=once coupon created under this fixed
// id in BOTH modes from the same constant, so display math (base minus off)
// and the applied discount cannot drift. 600 minor units = 6.00 EUR off the
// first yearly invoice (30.00 -> 24.00).
//
// CORRECTED 2026-07-28: this coupon is NOT applied to every yearly checkout.
// It belongs to the first 100 eligible subscribers inside the enrollment
// window (see founder-offer.ts). Any display of the discounted first-year
// total must therefore be conditioned on eligibility, never assumed.
export const PLUS_YEARLY_FIRST_YEAR_COUPON = "inklee-plus-yearly-first-year";
export const PLUS_YEARLY_FIRST_YEAR_OFF_MINOR = 600;

export type PlusBillingInterval = "monthly" | "yearly";

export const lookupKeyForInterval = (interval: PlusBillingInterval): string =>
  interval === "yearly" ? PLUS_YEARLY_PRICE_LOOKUP : PLUS_PRICE_LOOKUP;

/** Resolve the Plus price for DISPLAY (counsel condition: the total price must
 *  appear on the same screen as the pay button, directly above it). Reads the
 *  same Stripe Price the checkout charges, so the shown price can never drift
 *  from the charged price. Founder-approved display convention (2026-07-25):
 *  final price, tax-inclusive. Fail-safe: any error resolves to null and the
 *  checkout panel falls back to its price-on-next-step sentence. */
export async function getPlusPriceDisplay(
  billingInterval: PlusBillingInterval = "monthly",
  /** Pass the viewer's artist id to show the founder-offer first-year total
   *  ONLY when they are actually eligible for it. Omitted = list price only. */
  viewerArtistId?: string,
): Promise<{
  label: string;
  interval: string;
  /** Yearly only, and ONLY for a founder-offer-eligible viewer: the discounted
   *  first-year total ("24.00 EUR"), derived from the same base Price and the
   *  same off-constant the checkout coupon uses. Undefined otherwise, because
   *  showing a price the checkout will not charge is exactly the drift the
   *  counsel price-display condition forbids. */
  firstYearLabel?: string;
} | null> {
  try {
    const stripe = requireStripe();
    const prices = await stripe.prices.list({
      lookup_keys: [lookupKeyForInterval(billingInterval)],
      active: true,
      limit: 1,
    });
    const price = prices.data[0];
    if (!price?.unit_amount || !price.currency) return null;
    const interval = price.recurring?.interval ?? "month";
    const currency = price.currency.toUpperCase();
    const amount = (price.unit_amount / 100).toFixed(2);
    if (billingInterval === "yearly") {
      // Only an eligible viewer is shown the founder first-year total: the
      // displayed price and the charged price must come from the same
      // decision, and checkout applies the coupon only on eligibility.
      const eligible = viewerArtistId
        ? (
            await resolveFounderOffer({
              artistId: viewerArtistId,
              billingInterval: "yearly",
            })
          ).eligible
        : false;
      if (!eligible) {
        return { label: `${amount} ${currency} per ${interval}`, interval };
      }
      const firstYearMinor = Math.max(
        0,
        price.unit_amount - PLUS_YEARLY_FIRST_YEAR_OFF_MINOR,
      );
      return {
        label: `${amount} ${currency} per ${interval}`,
        interval,
        firstYearLabel: `${(firstYearMinor / 100).toFixed(2)} ${currency}`,
      };
    }
    return {
      label: `${amount} ${currency} per ${interval}`,
      interval,
    };
  } catch {
    return null;
  }
}

/** Find-or-create the Stripe billing Customer for an artist and stamp the link
 *  both ways (account_overrides.stripe_customer_id + customer.metadata.artist_id
 *  so reconcile can always attribute a subscription back to the artist). */
export async function ensureBillingCustomer(input: {
  artistId: string;
  email: string;
  name?: string;
}): Promise<string> {
  const stripe = requireStripe();

  const { data: existing } = await serviceClient
    .from("account_overrides")
    .select("stripe_customer_id")
    .eq("artist_id", input.artistId)
    .maybeSingle();

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id as string;
  }

  const customer = await stripe.customers.create(
    {
      email: input.email,
      name: input.name,
      metadata: { artist_id: input.artistId, inklee_env: "billing" },
    },
    { idempotencyKey: `sub_customer_${input.artistId}` },
  );

  const { error } = await serviceClient.from("account_overrides").upsert(
    {
      artist_id: input.artistId,
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "artist_id" },
  );
  if (error) {
    Sentry.captureException(error, {
      tags: { action: "ensure_billing_customer" },
      extra: { artistId: input.artistId },
    });
    throw new Error(`Failed to store billing customer: ${error.message}`);
  }
  return customer.id;
}

/** Create a subscription Checkout Session for an artist. The gate is asserted
 *  BEFORE any Stripe object is created, so live checkout is impossible until the
 *  matching approval group is recorded (test mode is a no-op). */
export async function createSubscriptionCheckout(input: {
  artistId: string;
  email: string;
  name?: string;
  priceId: string;
  contractCustomerType: ContractCustomerType;
  /** The billing interval of the Price being charged. Drives the renewal
   *  wording in the pre-pay legal text and is stamped into the metadata so
   *  reconcile/webhooks can attribute the contract shape without a Price
   *  lookup. Defaults to monthly (all existing callers). */
  billingInterval?: PlusBillingInterval;
  /** The express immediate-performance request (P3), stamped onto the
   *  subscription so the withdrawal proration reads it SCOPED to this contract,
   *  not from an unscoped latest-consent lookup. */
  immediatePerformanceRequested?: boolean;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string | null }> {
  const salesType =
    input.contractCustomerType === "consumer" ? "consumer" : "business";
  const group = salesType === "consumer" ? "b2c" : "b2b";
  await assertSalesLaunchApproved(salesType);
  await assertLiveBillingAllowedFor(group);

  const stripe = requireStripe();
  const customerId = await ensureBillingCustomer({
    artistId: input.artistId,
    email: input.email,
    name: input.name,
  });

  const immediatePerformance = input.immediatePerformanceRequested === true;
  const billingInterval: PlusBillingInterval =
    input.billingInterval ?? "monthly";
  // Art. 8(2) CRD wording must state the actual renewal cadence, so the text
  // varies with the interval of the Price being charged.
  const renewalCadence = billingInterval === "yearly" ? "year" : "month";

  // Founder-offer eligibility, decided and RECORDED before any Stripe object
  // exists. Recording first is what makes the cohort cap hold under
  // concurrency: the unique cohort position rejects the loser of a race, and a
  // caller that loses simply gets no discount rather than an over-cap grant.
  let founderOffer: {
    eligible: boolean;
    cohortPosition: number | null;
  } | null = null;
  const decision = await resolveFounderOffer({
    artistId: input.artistId,
    billingInterval,
  });
  if (decision.eligible && decision.cohortPosition !== null) {
    const won = await recordFounderOfferRedemption({
      artistId: input.artistId,
      stripeCustomerId: customerId,
      cohortPosition: decision.cohortPosition,
      reason: decision.reason,
    });
    founderOffer = won ? decision : null;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    subscription_data: {
      metadata: {
        artist_id: input.artistId,
        billing_flow: "plus_subscription",
        contract_customer_type: input.contractCustomerType,
        billing_interval: billingInterval,
        immediate_performance: immediatePerformance ? "true" : "false",
      },
    },
    // Disjoint from the deposit metadata namespace (never booking_id/artist money).
    metadata: {
      artist_id: input.artistId,
      billing_flow: "plus_subscription",
      contract_customer_type: input.contractCustomerType,
      billing_interval: billingInterval,
    },
    client_reference_id: input.artistId,
    // FOUNDER OFFER (corrected 2026-07-28). The first-year discount is NOT
    // universal: it belongs to the first 100 eligible subscribers inside the
    // enrollment window, yearly only, one per account. Eligibility is decided
    // server-side by resolveFounderOffer and recorded before the Stripe object
    // is created, so a lost concurrency race applies no discount. With no
    // policy row the offer is closed and no checkout carries a coupon, which
    // is the current state.
    ...(founderOffer?.eligible
      ? { discounts: [{ coupon: PLUS_YEARLY_FIRST_YEAR_COUPON }] }
      : {}),
    // Pre-contract reinforcement shown next to the pay button (Art. 8(2) CRD
    // obligation-to-pay + auto-renewal + how to cancel). Stripe's subscription
    // button label itself is fixed; the dedicated "Order with obligation to pay"
    // confirmation control lives in the pre-checkout step. No Stripe-dashboard
    // dependency, so this is safe in test mode.
    custom_text: {
      submit: {
        message: `By subscribing you place an order with an obligation to pay. Inklee Plus renews automatically each ${renewalCadence} at the price shown above until you cancel, which you can do at any time from your account settings.`,
      },
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  return { id: session.id, url: session.url };
}
