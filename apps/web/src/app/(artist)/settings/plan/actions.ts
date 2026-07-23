"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { createSubscriptionCheckout } from "@/lib/server/billing/subscription";
import { requireStripe } from "@/lib/server/billing/client";
import { getLegalDoc } from "@/lib/legal/documents";
import { BillingActivationError } from "@/lib/billing";
import { BUSINESS_DECLARATION_VERSION } from "@/lib/billing-consent-copy";

// The Plus price is resolved by a stable lookup key. In dev/test the test-mode
// Price exists, so checkout works end to end; in prod (live key) no live Price
// with this key exists yet, so the action returns "coming soon" gracefully. The
// activation gate is the other guard: createSubscriptionCheckout asserts it
// before creating any Stripe object, and a BillingActivationError also degrades
// to "coming soon".
const PRICE_LOOKUP = "inklee_plus_monthly_eur_test";

export type CheckoutResult = { url: string } | { message: string };

/** Confirm a B2B Plus subscription order and start checkout. The buyer must have
 *  affirmatively declared business use (counsel C3: a separate, unchecked,
 *  required control), which we record as evidence alongside Terms acceptance
 *  BEFORE creating any Stripe object. Returns the Stripe Checkout URL to redirect
 *  to, or a user-facing message when the declaration is missing or Plus is not
 *  yet purchasable (dark-launch: gate closed or no live Price). */
export async function confirmBusinessCheckoutAction(input: {
  businessUseDeclared: boolean;
}): Promise<CheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { message: "Please sign in again." };

  // The business-use declaration is a hard precondition (Art. 8 CRD / counsel
  // C3). Without it we neither record nor charge; the button is also disabled
  // client-side, so this is the server-authoritative backstop.
  if (input.businessUseDeclared !== true) {
    return {
      message: "Please confirm you are purchasing as a business to continue.",
    };
  }

  try {
    const stripe = requireStripe();
    const prices = await stripe.prices.list({
      lookup_keys: [PRICE_LOOKUP],
      active: true,
      limit: 1,
    });
    const price = prices.data[0];
    if (!price) return { message: "Plus isn't available yet." };

    // Read the current Terms version defensively. getLegalDoc reads bundled
    // content at runtime (the activation gate relies on the same read); a failure
    // must not block a valid order, so the Terms binding falls back to null.
    let termsVersion = "unknown";
    let termsHash: string | null = null;
    try {
      const terms = getLegalDoc("terms");
      termsVersion = terms.version;
      termsHash = terms.versionHash;
    } catch {
      // fall through with the unknown/null fallback
    }

    // Record the declaration + Terms acceptance as the legal evidence for this
    // order. Consent is the record that makes the order accountable; if we cannot
    // store it, do not proceed to charge setup.
    const now = new Date().toISOString();
    const { error: consentErr } = await serviceClient
      .from("billing_consent_records")
      .insert([
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
      ]);
    if (consentErr) {
      return { message: "Something went wrong. Please try again." };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
    const { url } = await createSubscriptionCheckout({
      artistId: user.id,
      email: user.email,
      priceId: price.id,
      contractCustomerType: "business",
      successUrl: `${appUrl}/settings/plan?checkout=success`,
      cancelUrl: `${appUrl}/settings/plan?checkout=cancelled`,
    });
    if (!url) return { message: "Plus isn't available yet." };
    return { url };
  } catch (e) {
    if (e instanceof BillingActivationError) {
      return {
        message: "Plus isn't available yet. We're finishing the last checks.",
      };
    }
    return {
      message: "Something went wrong starting checkout. Please try again.",
    };
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
