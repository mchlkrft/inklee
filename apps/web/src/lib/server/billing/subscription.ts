import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import type { ContractCustomerType } from "@/lib/billing";
import { requireStripe } from "./client";
import { assertLiveBillingAllowedFor } from "./activation";

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

/** Resolve the Plus price for DISPLAY (counsel condition: the total price must
 *  appear on the same screen as the pay button, directly above it). Reads the
 *  same Stripe Price the checkout charges, so the shown price can never drift
 *  from the charged price. Founder-approved display convention (2026-07-25):
 *  final price, tax-inclusive. Fail-safe: any error resolves to null and the
 *  checkout panel falls back to its price-on-next-step sentence. */
export async function getPlusPriceDisplay(): Promise<{
  label: string;
  interval: string;
} | null> {
  try {
    const stripe = requireStripe();
    const prices = await stripe.prices.list({
      lookup_keys: [PLUS_PRICE_LOOKUP],
      active: true,
      limit: 1,
    });
    const price = prices.data[0];
    if (!price?.unit_amount || !price.currency) return null;
    const interval = price.recurring?.interval ?? "month";
    const amount = (price.unit_amount / 100).toFixed(2);
    return {
      label: `${amount} ${price.currency.toUpperCase()} per ${interval}`,
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
  /** The express immediate-performance request (P3), stamped onto the
   *  subscription so the withdrawal proration reads it SCOPED to this contract,
   *  not from an unscoped latest-consent lookup. */
  immediatePerformanceRequested?: boolean;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string | null }> {
  const group = input.contractCustomerType === "consumer" ? "b2c" : "b2b";
  await assertLiveBillingAllowedFor(group);

  const stripe = requireStripe();
  const customerId = await ensureBillingCustomer({
    artistId: input.artistId,
    email: input.email,
    name: input.name,
  });

  const immediatePerformance = input.immediatePerformanceRequested === true;
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
        immediate_performance: immediatePerformance ? "true" : "false",
      },
    },
    // Disjoint from the deposit metadata namespace (never booking_id/artist money).
    metadata: {
      artist_id: input.artistId,
      billing_flow: "plus_subscription",
      contract_customer_type: input.contractCustomerType,
    },
    client_reference_id: input.artistId,
    // Pre-contract reinforcement shown next to the pay button (Art. 8(2) CRD
    // obligation-to-pay + auto-renewal + how to cancel). Stripe's subscription
    // button label itself is fixed; the dedicated "Order with obligation to pay"
    // confirmation control lives in the pre-checkout step. No Stripe-dashboard
    // dependency, so this is safe in test mode.
    custom_text: {
      submit: {
        message:
          "By subscribing you place an order with an obligation to pay. Inklee Plus renews automatically each month at the price shown above until you cancel, which you can do at any time from your plan settings.",
      },
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  return { id: session.id, url: session.url };
}
