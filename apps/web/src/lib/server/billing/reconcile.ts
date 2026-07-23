import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { planTierForSubscription } from "@/lib/billing";
import { requireStripe } from "./client";

// Internal subscription reconciliation (execution item 5).
//
// A subscription's Stripe state is the source of truth for payment; this mirrors
// it into billing_subscriptions (a reconciled ACCESS-CONTROL record, not a
// competing ledger) and derives account_overrides.plan_tier so the entitlement
// engine resolves access with NO live Stripe call. It CONVERGES to a target
// (writes the absolute state the event carries, never a delta), so Stripe
// redelivery and out-of-order events are safe. It NEVER touches the deposit
// path and NEVER overwrites the grandfather anchor (policy_id).

// Founder rec: past_due keeps access for a short grace window before downgrade.
const GRACE_DAYS = 7;

export type ReconcileResult = {
  artistId: string | null;
  planTier: "free" | "plus";
  status: string;
  duplicate: boolean;
  orphaned: boolean;
};

function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

// current_period_end lives on the subscription in most versions and on the
// item in newer ones; read defensively so an SDK/apiVersion drift can't null it.
function periodEndOf(sub: Stripe.Subscription): Date | null {
  const top = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  const item = sub.items?.data?.[0] as unknown as {
    current_period_end?: number;
  };
  const secs = top ?? item?.current_period_end ?? null;
  return secs ? new Date(secs * 1000) : null;
}

async function resolveArtistId(
  sub: Stripe.Subscription,
): Promise<string | null> {
  const fromSub = sub.metadata?.artist_id;
  if (fromSub) return fromSub;
  // Fallback: the customer carries it too (stamped at checkout create). Fetch
  // only when the subscription did not carry it.
  const customerId = customerIdOf(sub);
  try {
    const customer = await requireStripe().customers.retrieve(customerId);
    if (!customer.deleted && customer.metadata?.artist_id) {
      return customer.metadata.artist_id;
    }
  } catch {
    /* fall through to orphan handling */
  }
  return null;
}

export async function reconcileFromStripeSubscription(
  sub: Stripe.Subscription,
): Promise<ReconcileResult> {
  const status = sub.status;
  const artistId = await resolveArtistId(sub);

  if (!artistId) {
    // A subscription we cannot attribute to an artist. Never guess; flag for a
    // human and stop. (The webhook still 200s so Stripe does not retry forever.)
    Sentry.captureMessage("Billing subscription without an artist_id", {
      level: "error",
      tags: { action: "billing_reconcile_orphan" },
      extra: { subscriptionId: sub.id, customerId: customerIdOf(sub) },
    });
    return {
      artistId: null,
      planTier: "free",
      status,
      duplicate: false,
      orphaned: true,
    };
  }

  const now = new Date();
  const customerId = customerIdOf(sub);
  const priceId = sub.items?.data?.[0]?.price?.id ?? "";
  const currentPeriodEnd = periodEndOf(sub);
  const cancelAtPeriodEnd = sub.cancel_at_period_end ?? false;
  const mode: "test" | "live" = sub.livemode ? "live" : "test";
  const contractType =
    (sub.metadata?.contract_customer_type as string | undefined) ?? "business";

  // 1. Mirror into billing_subscriptions (converge on the unique stripe id).
  const { error: subErr } = await serviceClient
    .from("billing_subscriptions")
    .upsert(
      {
        artist_id: artistId,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        status,
        current_period_end: currentPeriodEnd?.toISOString() ?? null,
        cancel_at_period_end: cancelAtPeriodEnd,
        contract_customer_type: contractType,
        mode,
        last_reconciled_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );
  if (subErr) {
    throw new Error(`billing_subscriptions upsert failed: ${subErr.message}`);
  }

  // 2. Derive the access tier and converge account_overrides. We READ first to
  //    preserve the grandfather anchor: policy_id and the grant package are
  //    NEVER written here, and plan_source is left intact for a grandfathered
  //    account on downgrade (grandfather restore is a deferred Stage-2 substage).
  const planTier = planTierForSubscription(status, {
    currentPeriodEnd,
    now,
    graceDays: GRACE_DAYS,
  });

  const { data: existing } = await serviceClient
    .from("account_overrides")
    .select("policy_id, plan_source")
    .eq("artist_id", artistId)
    .maybeSingle();
  const isGrandfathered = Boolean(existing?.policy_id);

  const planSource =
    planTier === "plus"
      ? "paid"
      : isGrandfathered
        ? (existing?.plan_source ?? null) // preserve; do not strip a grandfather
        : null;

  const { error: ovErr } = await serviceClient.from("account_overrides").upsert(
    {
      artist_id: artistId,
      plan_tier: planTier,
      plan_source: planSource,
      plan_expires_at: currentPeriodEnd?.toISOString() ?? null,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      subscription_status: status,
      current_period_end: currentPeriodEnd?.toISOString() ?? null,
      cancel_at_period_end: cancelAtPeriodEnd,
      updated_at: now.toISOString(),
      // NB: policy_id, grant_package, entitlement_overrides, limit_overrides are
      // intentionally NOT written; upsert-update leaves them untouched.
    },
    { onConflict: "artist_id" },
  );
  if (ovErr) {
    throw new Error(`account_overrides upsert failed: ${ovErr.message}`);
  }

  // 3. Duplicate-subscription guard: an artist should have exactly one active
  //    subscription. Flag (never auto-charge) if a second live one appears.
  const { count: activeDupes } = await serviceClient
    .from("billing_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("stripe_customer_id", customerId)
    .in("status", ["active", "trialing", "past_due"])
    .neq("stripe_subscription_id", sub.id);
  const duplicate = (activeDupes ?? 0) > 0;
  if (duplicate) {
    Sentry.captureMessage(
      "Duplicate active billing subscription for customer",
      {
        level: "error",
        tags: { action: "billing_reconcile_duplicate" },
        extra: { customerId, subscriptionId: sub.id, artistId },
      },
    );
  }

  return { artistId, planTier, status, duplicate, orphaned: false };
}

export async function reconcileSubscriptionById(
  stripeSubscriptionId: string,
): Promise<ReconcileResult> {
  const sub =
    await requireStripe().subscriptions.retrieve(stripeSubscriptionId);
  return reconcileFromStripeSubscription(sub);
}
