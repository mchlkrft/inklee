import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import type { ContractCustomerType } from "@/lib/billing";
import { requireStripe } from "./client";
import { assertLiveBillingAllowedFor } from "./activation";

// Subscription checkout create path. Isolated from deposits: distinct metadata
// namespace (billing_flow / artist_id, never booking_id), subscription mode,
// and a mandatory activation-gate check before any live charge can occur.

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
      },
    },
    // Disjoint from the deposit metadata namespace (never booking_id/artist money).
    metadata: {
      artist_id: input.artistId,
      billing_flow: "plus_subscription",
      contract_customer_type: input.contractCustomerType,
    },
    client_reference_id: input.artistId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  return { id: session.id, url: session.url };
}
