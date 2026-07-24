"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { createSubscriptionCheckout } from "@/lib/server/billing/subscription";
import { requireStripe } from "@/lib/server/billing/client";
import { getLegalDoc } from "@/lib/legal/documents";
import { BillingActivationError } from "@/lib/billing";
import {
  BUSINESS_DECLARATION_VERSION,
  IMMEDIATE_PERFORMANCE_VERSION,
} from "@/lib/billing-consent-copy";

// The Plus price is resolved by a stable lookup key. In dev/test the test-mode
// Price exists, so checkout works end to end; in prod (live key) no live Price
// with this key exists yet, so the action returns "coming soon" gracefully. The
// activation gate is the other guard: createSubscriptionCheckout asserts it
// before creating any Stripe object, and a BillingActivationError also degrades
// to "coming soon".
const PRICE_LOOKUP = "inklee_plus_monthly_eur_test";

export type CheckoutResult = { url: string } | { message: string };

type ConsentRow = Record<string, unknown>;

// Shared checkout core: resolve the live Price, record the consent rows, then
// create the subscription Checkout Session for the given contract type. Consent
// is written BEFORE any Stripe object. Degrades to a user-facing message when
// Plus is not yet purchasable (no live Price). Throws BillingActivationError when
// the gate is closed (the callers map that to a message).
async function startCheckout(input: {
  userId: string;
  email: string;
  contractType: "consumer" | "business";
  consentRows: (ctx: {
    now: string;
    termsVersion: string;
    termsHash: string | null;
  }) => ConsentRow[];
}): Promise<CheckoutResult> {
  const stripe = requireStripe();
  const prices = await stripe.prices.list({
    lookup_keys: [PRICE_LOOKUP],
    active: true,
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) return { message: "Plus isn't available yet." };

  // Read the current Terms version defensively (the activation gate relies on the
  // same read); a failure must not block a valid order, so it falls back to null.
  let termsVersion = "unknown";
  let termsHash: string | null = null;
  try {
    const terms = getLegalDoc("terms");
    termsVersion = terms.version;
    termsHash = terms.versionHash;
  } catch {
    // fall through with the unknown/null fallback
  }

  const now = new Date().toISOString();
  const { error: consentErr } = await serviceClient
    .from("billing_consent_records")
    .insert(input.consentRows({ now, termsVersion, termsHash }));
  if (consentErr) return { message: "Something went wrong. Please try again." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const { url } = await createSubscriptionCheckout({
    artistId: input.userId,
    email: input.email,
    priceId: price.id,
    contractCustomerType: input.contractType,
    successUrl: `${appUrl}/settings/plan?checkout=success`,
    cancelUrl: `${appUrl}/settings/plan?checkout=cancelled`,
  });
  if (!url) return { message: "Plus isn't available yet." };
  return { url };
}

function mapCheckoutError(e: unknown): CheckoutResult {
  if (e instanceof BillingActivationError) {
    return {
      message: "Plus isn't available yet. We're finishing the last checks.",
    };
  }
  return {
    message: "Something went wrong starting checkout. Please try again.",
  };
}

/** v1 consumer-first Plus checkout (strategy D1). Every buyer takes the CONSUMER
 *  path: no business-use declaration; Terms acceptance is recorded; the consumer
 *  (b2c) activation gate governs. When the buyer expressly requests immediate
 *  performance (P3, a separate optional control), that request is recorded too;
 *  without it, a mid-period withdrawal is a full refund (F4(b)). */
export async function startPlusConsumerCheckoutAction(input?: {
  immediatePerformanceRequested?: boolean;
}): Promise<CheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { message: "Please sign in again." };

  const immediate = input?.immediatePerformanceRequested === true;
  try {
    return await startCheckout({
      userId: user.id,
      email: user.email,
      contractType: "consumer",
      consentRows: ({ now, termsVersion, termsHash }) => {
        const rows: ConsentRow[] = [
          {
            artist_id: user.id,
            consent_type: "terms_acceptance",
            consent_version: termsVersion,
            consent_hash: termsHash,
            consented_at: now,
            context: { flow: "plus_subscription" },
          },
        ];
        if (immediate) {
          rows.push({
            artist_id: user.id,
            consent_type: "immediate_performance_request",
            consent_version: IMMEDIATE_PERFORMANCE_VERSION,
            consent_hash: null,
            consented_at: now,
            context: { flow: "plus_subscription" },
          });
        }
        return rows;
      },
    });
  } catch (e) {
    return mapCheckoutError(e);
  }
}

/** DEFERRED for v1 (PLUS_BUSINESS_TIER_ENABLED = false, strategy D1). The B2B
 *  path with the C3 business-use declaration, kept for a future explicit
 *  business/studio tier. The declaration is a hard server-authoritative
 *  precondition, recorded alongside Terms acceptance before any Stripe object. */
export async function confirmBusinessCheckoutAction(input: {
  businessUseDeclared: boolean;
}): Promise<CheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { message: "Please sign in again." };

  if (input.businessUseDeclared !== true) {
    return {
      message: "Please confirm you are purchasing as a business to continue.",
    };
  }

  try {
    return await startCheckout({
      userId: user.id,
      email: user.email,
      contractType: "business",
      consentRows: ({ now, termsVersion, termsHash }) => [
        {
          artist_id: user.id,
          consent_type: "business_use_declaration",
          consent_version: BUSINESS_DECLARATION_VERSION,
          consented_at: now,
          context: { flow: "plus_subscription" },
        },
        {
          artist_id: user.id,
          consent_type: "terms_acceptance",
          consent_version: termsVersion,
          consent_hash: termsHash,
          consented_at: now,
          context: { flow: "plus_subscription" },
        },
      ],
    });
  } catch (e) {
    return mapCheckoutError(e);
  }
}

/** Open the Stripe Customer Portal for self-service subscription management
 *  (update payment method, cancel, view invoices). Uses Stripe's hosted portal
 *  (amendment 5: no custom portal). Returns the portal URL for a client
 *  redirect, or a message when there's nothing to manage / the portal is not yet
 *  configured. */
export async function openBillingPortalAction(): Promise<CheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { message: "Please sign in again." };

  // The Stripe billing customer id is written by the reconcile webhook. Read it
  // directly (service-role); it is not part of the entitlement engine's view.
  const { data, error } = await serviceClient
    .from("account_overrides")
    .select("stripe_customer_id")
    .eq("artist_id", user.id)
    .maybeSingle();
  if (error) {
    // A read blip must not tell a real subscriber they have nothing to manage.
    return { message: "Couldn't load your subscription. Please try again." };
  }
  const customerId = data?.stripe_customer_id as string | null | undefined;
  if (!customerId) return { message: "No subscription to manage yet." };

  try {
    const stripe = requireStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/settings/plan`,
    });
    return { url: session.url };
  } catch {
    // e.g. the portal configuration hasn't been created in Stripe yet.
    return { message: "Subscription management isn't available yet." };
  }
}
