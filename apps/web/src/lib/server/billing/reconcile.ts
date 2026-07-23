import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { planTierForSubscription } from "@/lib/billing";
import {
  restoreGrandfatherPackage,
  type GrantPackage,
} from "@/lib/entitlements";
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
  /** True when a newer event for this subscription already applied, so this
   *  (older/redelivered) event was skipped. */
  stale: boolean;
};

// Atomic, event-ordering-guarded write. With `eventCreated` set, the row is
// written ONLY if this event is not older than the stored last_event_created
// (a single conditional UPDATE; INSERT when absent), closing the residual
// concurrent-processing race the webhook re-fetch cannot. Returns stale=true when
// a newer event already applied. With eventCreated null (internal callers), it is
// a plain upsert with no ordering guard.
async function guardedUpsert(input: {
  table: "billing_subscriptions" | "account_overrides";
  matchCol: "stripe_subscription_id" | "artist_id";
  matchVal: string;
  payload: Record<string, unknown>;
  eventCreated: number | null;
}): Promise<{ stale: boolean }> {
  const { table, matchCol, matchVal, payload, eventCreated } = input;
  if (eventCreated == null) {
    const { error } = await serviceClient
      .from(table)
      .upsert(payload, { onConflict: matchCol });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    return { stale: false };
  }
  const ts = Math.floor(eventCreated); // integer seconds; safe in the filter string
  const withTs = { ...payload, last_event_created: ts };
  // Compare-and-retry loop. Staleness is NEVER inferred from mere row existence
  // or a 23505 (that would let an OLDER concurrent insert suppress a NEWER
  // event). We declare stale ONLY when a row exists whose stored event is
  // genuinely newer-or-equal. The atomic guarded UPDATE re-evaluates its
  // predicate under the row lock each iteration, so the loop converges: it
  // applies once the row exists with stored <= ts, or confirms stale.
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: updated, error: updErr } = await serviceClient
      .from(table)
      .update(withTs)
      .eq(matchCol, matchVal)
      .or(`last_event_created.is.null,last_event_created.lte.${ts}`)
      .select(matchCol);
    if (updErr) {
      throw new Error(`${table} guarded update failed: ${updErr.message}`);
    }
    if (updated && updated.length > 0) return { stale: false };

    // 0 rows: either no row yet, or an existing row to classify.
    const { data: existing, error: selErr } = await serviceClient
      .from(table)
      .select("last_event_created")
      .eq(matchCol, matchVal)
      .maybeSingle();
    if (selErr)
      throw new Error(`${table} guard read failed: ${selErr.message}`);

    if (existing) {
      const stored = (existing as { last_event_created: number | null })
        .last_event_created;
      // A strictly-newer (or equal, already-applied) event won: genuinely stale.
      if (stored != null && stored >= ts) return { stale: true };
      // Row exists but stored < ts (a concurrent OLDER event just inserted it);
      // retry so the guarded UPDATE applies this newer event.
      continue;
    }

    // No row yet: insert. A concurrent insert (23505) means a row now exists;
    // loop back to the guarded UPDATE to re-evaluate order, never assume stale.
    const { error: insErr } = await serviceClient.from(table).insert(withTs);
    if (!insErr) return { stale: false };
    if ((insErr as { code?: string }).code === "23505") continue;
    throw new Error(`${table} insert failed: ${insErr.message}`);
  }
  // Pathological churn: surface so the webhook 500s and Stripe redelivers.
  throw new Error(`${table} guardedUpsert did not converge`);
}

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
    // Customer exists but carries no artist_id: genuinely unattributable.
  } catch (err) {
    // A transient Stripe failure must NOT be misread as an orphan: that 200s the
    // webhook and permanently drops the event (e.g. a missed downgrade). Re-throw
    // so the webhook 500s and Stripe redelivers; converge-to-target makes the
    // retry safe. Only a permanent error (e.g. resource_missing) falls through.
    const e = err as { type?: string; statusCode?: number };
    const transient =
      e?.type === "StripeConnectionError" ||
      e?.type === "StripeAPIError" ||
      e?.statusCode === 429 ||
      (typeof e?.statusCode === "number" && e.statusCode >= 500);
    if (transient) throw err;
  }
  return null;
}

export async function reconcileFromStripeSubscription(
  sub: Stripe.Subscription,
  eventCreated: number | null = null,
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
      stale: false,
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

  // Derive the target access tier up front (needed for the grandfather restore
  // and the return value even on a stale skip).
  const planTier = planTierForSubscription(status, {
    currentPeriodEnd,
    now,
    graceDays: GRACE_DAYS,
  });

  // 1. Mirror into billing_subscriptions with the event-ordering guard. If a
  //    newer event for this subscription already applied, skip the derived
  //    account_overrides write too (the newer event set the correct state).
  const subGuard = await guardedUpsert({
    table: "billing_subscriptions",
    matchCol: "stripe_subscription_id",
    matchVal: sub.id,
    eventCreated,
    payload: {
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
  });
  if (subGuard.stale) {
    return {
      artistId,
      planTier,
      status,
      duplicate: false,
      orphaned: false,
      stale: true,
    };
  }

  // 2. Converge account_overrides. We READ first so a downgrade of a
  //    grandfathered account RESTORES its cohort package (plan_source
  //    'grandfathered' + the preserved entitlement/limit overrides) rather than
  //    dropping to bare Free. The durable anchor policy_id and the grant_package
  //    manifest themselves are NEVER written here.
  const { data: existing } = await serviceClient
    .from("account_overrides")
    .select(
      "policy_id, plan_source, grant_package, entitlement_overrides, limit_overrides",
    )
    .eq("artist_id", artistId)
    .maybeSingle();

  // Grandfather restore applies only on the downgrade (to Free). On upgrade the
  // package stays intact (Plus is a superset) and plan_source becomes 'paid'.
  // Passing the LIVE overrides makes the restore MERGE (admin decisions win)
  // instead of wiping the shared entitlement/limit columns.
  const restore =
    planTier === "free"
      ? restoreGrandfatherPackage({
          policyId: (existing?.policy_id as string | null) ?? null,
          grantPackage:
            (existing?.grant_package as GrantPackage | null) ?? null,
          entitlementOverrides:
            (existing?.entitlement_overrides as GrantPackage["features"]) ?? {},
          limitOverrides:
            (existing?.limit_overrides as GrantPackage["limits"]) ?? {},
        })
      : null;

  const planSource =
    planTier === "plus" ? "paid" : (restore?.planSource ?? null);

  const overridePayload: Record<string, unknown> = {
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
    // NB: policy_id, grant_package are NEVER written; upsert-update leaves them.
  };
  if (restore) {
    // Re-apply the grandfather cohort's preserved entitlements + limits.
    overridePayload.entitlement_overrides = restore.entitlementOverrides;
    overridePayload.limit_overrides = restore.limitOverrides;
  }

  const ovGuard = await guardedUpsert({
    table: "account_overrides",
    matchCol: "artist_id",
    matchVal: artistId,
    eventCreated,
    payload: overridePayload,
  });
  if (ovGuard.stale) {
    // billing_subscriptions accepted this event but account_overrides saw a newer
    // one (should not happen for a single subscription; do not overwrite newer
    // entitlement state).
    return {
      artistId,
      planTier,
      status,
      duplicate: false,
      orphaned: false,
      stale: true,
    };
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

  return {
    artistId,
    planTier,
    status,
    duplicate,
    orphaned: false,
    stale: false,
  };
}

export async function reconcileSubscriptionById(
  stripeSubscriptionId: string,
  eventCreated: number | null = null,
): Promise<ReconcileResult> {
  const sub =
    await requireStripe().subscriptions.retrieve(stripeSubscriptionId);
  return reconcileFromStripeSubscription(sub, eventCreated);
}
