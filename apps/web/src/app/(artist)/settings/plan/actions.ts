"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { createSubscriptionCheckout } from "@/lib/server/billing/subscription";
import { requireStripe } from "@/lib/server/billing/client";
import { BillingActivationError } from "@/lib/billing";

// The Plus price is resolved by a stable lookup key. In dev/test the test-mode
// Price exists, so checkout works end to end; in prod (live key) no live Price
// with this key exists yet, so the action returns "coming soon" gracefully. The
// activation gate is the other guard: createSubscriptionCheckout asserts it
// before creating any Stripe object, and a BillingActivationError also degrades
// to "coming soon".
const PRICE_LOOKUP = "inklee_plus_monthly_eur_test";

export type CheckoutResult = { url: string } | { message: string };

/** Start a Plus (B2B) subscription checkout. Returns the Stripe Checkout URL for
 *  the client to redirect to, or a user-facing message when Plus is not yet
 *  purchasable (dark-launch: gate closed or no live Price). */
export async function startPlusCheckoutAction(): Promise<CheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { message: "Please sign in again." };

  try {
    const stripe = requireStripe();
    const prices = await stripe.prices.list({
      lookup_keys: [PRICE_LOOKUP],
      active: true,
      limit: 1,
    });
    const price = prices.data[0];
    if (!price) return { message: "Plus isn't available yet." };

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
  const { data } = await serviceClient
    .from("account_overrides")
    .select("stripe_customer_id")
    .eq("artist_id", user.id)
    .maybeSingle();
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
