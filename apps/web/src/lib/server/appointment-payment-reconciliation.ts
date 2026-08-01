import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { settlePaymentRequestSuccess } from "./appointment-payment-settlement";
import { EXPIRABLE_STATUSES } from "./appointment-payments";
import { writeAudit } from "@/lib/audit";

// A8 RECONCILIATION BACKSTOP (Plus build P9, spec section 8).
//
// Catches payment requests stuck in `payment_processing` when the webhook was
// lost, delayed or dropped. Reads each one's PaymentIntent from Stripe and
// drives the row to its correct terminal state:
//
//   intent succeeded  → settle (same path the webhook takes)
//   intent canceled   → move request to `failed`
//   intent still live → leave it alone
//
// Called by the cleanup cron. Idempotent: settlement is already idempotent
// (conditional UPDATE on status + intent id), and the `failed` transition
// conditions on `payment_processing` status.

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export type ReconciliationResult = {
  checked: number;
  settled: number;
  failed: number;
  skipped: number;
  errors: number;
};

export async function reconcileStalePaymentRequests(
  options: { now?: Date; thresholdMs?: number } = {},
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    checked: 0,
    settled: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
  };

  if (!stripe) return result;

  const now = options.now ?? new Date();
  const threshold = options.thresholdMs ?? STALE_THRESHOLD_MS;
  const cutoff = new Date(now.getTime() - threshold).toISOString();

  const { data: stale, error } = await serviceClient
    .from("payment_requests")
    .select("id, payment_intent_id, artist_id, revision")
    .eq("status", "payment_processing")
    .not("payment_intent_id", "is", null)
    .lt("updated_at", cutoff);

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "payment_reconciliation_query" },
    });
    return result;
  }
  if (!stale || stale.length === 0) return result;

  for (const row of stale) {
    result.checked++;
    const intentId = row.payment_intent_id as string;

    let intent;
    try {
      intent = await stripe.paymentIntents.retrieve(intentId);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { action: "payment_reconciliation_retrieve" },
        extra: { requestId: row.id, intentId },
      });
      result.errors++;
      continue;
    }

    if (intent.status === "succeeded") {
      const settled = await settlePaymentRequestSuccess(intent);
      if (settled) {
        result.settled++;
        void writeAudit({
          action: "appointment_payment_reconciled",
          actor: "system",
          category: "booking",
          details: {
            payment_request_id: row.id,
            payment_intent_id: intentId,
            outcome: "settled",
            reason: "webhook_missed",
          },
        });
      } else {
        result.skipped++;
      }
    } else if (intent.status === "canceled") {
      const { data: moved } = await serviceClient
        .from("payment_requests")
        .update({ status: "failed", updated_at: now.toISOString() })
        .eq("id", row.id)
        .eq("status", "payment_processing")
        .eq("payment_intent_id", intentId)
        .select("id")
        .maybeSingle();

      if (moved) {
        result.failed++;
        void writeAudit({
          action: "appointment_payment_reconciled",
          actor: "system",
          category: "booking",
          details: {
            payment_request_id: row.id,
            payment_intent_id: intentId,
            outcome: "failed",
            reason: "intent_canceled",
          },
        });
      } else {
        result.skipped++;
      }
    } else {
      result.skipped++;
    }
  }

  return result;
}

/**
 * FLEET EXPIRY SWEEP (M9). Until this sweep NOTHING enforced `expires_at`
 * fleet-wide: an expired link stayed `sent` forever (holding the
 * one-payable-per-subject index) unless the client happened to open it. The
 * money half was never exposed — the quote and the pay page both refuse an
 * expired link on their own clocks — so the sweep's job is housekeeping the
 * ROWS, on a daily-cron lag that the payment path does not depend on.
 *
 * PRECISION (corrected 2026-08-01; the first version of this header claimed
 * the sweep gave the per-artist expiry cores "a caller"): it does NOT call
 * them. `expirePaymentRequestsCore` is per-artist on the RLS client and
 * still has no caller; this is a SECOND, service-role implementation that
 * shares only EXPIRABLE_STATUSES with it (imported, so the status lists
 * cannot drift). The rest of the WHERE (`expires_at` non-null and past) is
 * duplicated by hand in both places and CAN drift — if either side ever
 * changes, change both or fold the core into this.
 *
 * Expiry only moves sent / viewed / failed, so it can never resurrect or
 * overwrite a settled, cancelled or contested outcome. Idempotent: `expired`
 * is not in the list, so a second run matches nothing.
 */
export async function sweepExpiredPaymentRequests(
  options: { now?: Date } = {},
): Promise<{ expired: number }> {
  const nowIso = (options.now ?? new Date()).toISOString();
  const { data, error } = await serviceClient
    .from("payment_requests")
    .update({ status: "expired", updated_at: nowIso })
    .in("status", EXPIRABLE_STATUSES as string[])
    .not("expires_at", "is", null)
    .lte("expires_at", nowIso)
    .select("id");

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "payment_request_expiry_sweep" },
    });
    return { expired: 0 };
  }
  const expired = (data ?? []).length;
  if (expired > 0) {
    void writeAudit({
      action: "appointment_payment_requests_expired",
      actor: "system",
      category: "booking",
      details: { count: expired, via: "cron_sweep" },
    });
  }
  return { expired };
}
