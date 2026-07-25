import type Stripe from "stripe";
import { serviceClient } from "@/lib/supabase/service";
import { requireStripe } from "./client";
import { reconcileFromStripeSubscription } from "./reconcile";
import { recordDurableConfirmation } from "./withdrawal";

// Ordinary subscription cancellation (§ 312k BGB "Kündigung"), DISTINCT from the
// Art. 11a withdrawal (Widerruf). Cancelling ends the subscription at the end of
// the paid period (the subscriber keeps Plus until then) and issues NO refund;
// withdrawal ends it now and refunds. This core never shares the withdrawal path.
//
// § 312k requires a permanently, directly, and easily accessible cancellation
// function whose confirmation is delivered on a durable medium stating the
// receipt date/time and the point in time the termination takes effect. The
// German-market button/confirm wording ("Verträge hier kündigen" / "jetzt
// kündigen") is a UI localization concern; the app is currently English-only and
// uses an equally unambiguous formulation.

// current_period_end lives on the subscription in most versions and on the item
// in newer ones; read defensively so an SDK/apiVersion drift can't null it
// (mirrors reconcile.periodEndOf and withdrawal.readPeriod).
function periodEndOf(sub: Stripe.Subscription): Date | null {
  const top = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  const item = sub.items?.data?.[0] as unknown as {
    current_period_end?: number;
  };
  const secs = top ?? item?.current_period_end ?? null;
  return secs ? new Date(secs * 1000) : null;
}

export type CancellationResult =
  | { status: "no_subscription" }
  | { status: "not_active" }
  | { status: "already_scheduled"; effectiveAt: string | null }
  | { status: "scheduled"; effectiveAt: string | null };

export async function cancelSubscriptionCore(input: {
  artistId: string;
}): Promise<CancellationResult> {
  const stripe = requireStripe();

  const { data: subRow } = await serviceClient
    .from("billing_subscriptions")
    .select("id, stripe_subscription_id, status")
    .eq("artist_id", input.artistId)
    .order("last_reconciled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!subRow?.stripe_subscription_id) return { status: "no_subscription" };

  const billingSubscriptionId = subRow.id as string;
  const stripeSubId = subRow.stripe_subscription_id as string;

  const sub = await stripe.subscriptions.retrieve(stripeSubId);
  if (sub.status === "canceled") return { status: "not_active" };

  // Idempotent: if cancellation is already scheduled, report the effective date
  // without re-scheduling or re-sending the durable confirmation.
  if (sub.cancel_at_period_end === true) {
    return {
      status: "already_scheduled",
      effectiveAt: periodEndOf(sub)?.toISOString() ?? null,
    };
  }

  // Ordinary termination at period end (keeps paid access until then). A distinct
  // idempotency key from the withdrawal's immediate cancel keeps the two paths
  // isolated on Stripe.
  const updated = await stripe.subscriptions.update(
    stripeSubId,
    { cancel_at_period_end: true },
    { idempotencyKey: `sub_cancel_eop_${stripeSubId}` },
  );

  // Mirror the new state into access records (cancel_at_period_end + status).
  await reconcileFromStripeSubscription(updated);

  const effectiveAt = periodEndOf(updated) ?? periodEndOf(sub);
  await recordDurableConfirmation({
    artistId: input.artistId,
    billingSubscriptionId,
    kind: "cancellation",
    effectiveAt: effectiveAt?.toISOString(),
    receivedAt: new Date().toISOString(),
  });

  return {
    status: "scheduled",
    effectiveAt: effectiveAt?.toISOString() ?? null,
  };
}

/** Cheap display read (no Stripe call) for the settings cancellation section: the
 *  reconcile webhook mirrors status + period end + cancel_at_period_end into
 *  account_overrides, so the section renders from there. */
export async function getSubscriptionCancellationInfo(
  artistId: string,
): Promise<{
  hasActiveSubscription: boolean;
  effectiveAt: string | null;
  alreadyScheduled: boolean;
}> {
  const { data } = await serviceClient
    .from("account_overrides")
    .select("subscription_status, current_period_end, cancel_at_period_end")
    .eq("artist_id", artistId)
    .maybeSingle();
  const status = (data?.subscription_status as string | null) ?? null;
  const active =
    status === "active" || status === "trialing" || status === "past_due";
  return {
    hasActiveSubscription: active,
    effectiveAt: (data?.current_period_end as string | null) ?? null,
    alreadyScheduled: (data?.cancel_at_period_end as boolean | null) === true,
  };
}
