import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";
import { ORDER_MONEY_STATES } from "@/lib/server/account-deletion-logic";
import { runStayLifecycleSweep } from "@/lib/server/guest-spots";
import {
  reconcileStalePaymentRequests,
  sweepExpiredPaymentRequests,
} from "@/lib/server/appointment-payment-reconciliation";
import { sweepStalePendingStandaloneOrders } from "@/lib/server/goods-checkout";
import { reconcileStaleSubscriptions } from "@/lib/server/billing/subscription-reconciliation";
import { runCompExpirySweep } from "@/lib/server/billing/comp-expiry-sweep";
import { runArtistAnalyticsRollup } from "@/lib/server/artist-analytics-rollup";

export const runtime = "nodejs";
// SHOP-ORD-003: the standalone-order sweep makes up to 2 serial Stripe calls
// per row (bounded at 200 rows/run); without an explicit ceiling the platform
// default can cut the cron mid-loop, losing the remaining sweeps AND their
// audit rows. 60s is the Hobby-plan maximum.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── Guest spot stay lifecycle (Inklee 2.0 Phase 4) ─────────────────────────
  // Runs FIRST: the stale-bookings early return below must never skip it.
  // Date-driven, idempotent: confirmed stays activate on their start date,
  // active stays complete after their end date, requests follow.
  const stayLifecycle = await runStayLifecycleSweep();

  // ── A8 payment-request reconciliation backstop ────────────────────────────
  // Catches requests stuck in payment_processing when the webhook was lost.
  const paymentReconciliation = await reconcileStalePaymentRequests();

  // ── M9 payment-request expiry sweep ───────────────────────────────────────
  // Enforces expires_at fleet-wide (sent/viewed/failed -> expired). Until this
  // sweep the expiry cores had no caller: links "expired" only if the client
  // happened to open them.
  const paymentExpiry = await sweepExpiredPaymentRequests();

  // ── SHOP-ORD-001 stale standalone-order sweep ─────────────────────────────
  // Cancels pending standalone goods orders older than 24h. Nothing else can:
  // the webhook only fires on payment events, and the booking cleanup below
  // matches orders through booking ids, which are NULL here.
  const staleStandaloneOrders = await sweepStalePendingStandaloneOrders();

  // ── C4 billing subscription reconciliation backstop ──────────────────────
  // Re-syncs billing_subscriptions rows that haven't been reconciled in 4h,
  // and discovers subscriptions where the webhook was permanently lost
  // (customer exists in account_overrides but no subscription row).
  const billingReconciliation = await reconcileStaleSubscriptions();

  // ── OQ-8 comp-expiry sweep ───────────────────────────────────────────────
  // Warns artists whose comp expires within 14 days, and notifies those
  // whose comp has lapsed. Idempotent via notification metadata keys.
  const compExpiry = await runCompExpirySweep();

  // ── P6 artist analytics daily rollup ────────────────────────────────────
  // Aggregates yesterday's pageviews (from wa events) and click events
  // (from artist_page_events) into artist_page_rollups. Also purges raw
  // click events older than 13 months.
  const analyticsRollup = await runArtistAnalyticsRollup();

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: stale, error: fetchError } = await serviceClient
    .from("booking_requests")
    .select("id, artist_id, deposit_paid_at")
    .in("status", ["rejected", "cancelled"])
    .lt("updated_at", cutoff);

  if (fetchError) {
    Sentry.captureException(fetchError, {
      tags: { route: "cron/cleanup", step: "stale-fetch" },
    });
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({
      deleted: 0,
      stays_activated: stayLifecycle.activated,
      stays_completed: stayLifecycle.completed,
      stay_requests_completed: stayLifecycle.requestsCompleted,
      payment_reconciliation: paymentReconciliation,
      payment_expiry: paymentExpiry,
      stale_standalone_orders: staleStandaloneOrders,
      billing_reconciliation: billingReconciliation,
      comp_expiry: compExpiry,
      analytics_rollup: analyticsRollup,
    });
  }

  const staleIds = stale.map((r) => r.id);

  // Counsel §4: a booking that captured money — a paid deposit, or a paid/
  // refunded goods order — carries a financial record Inklee must retain for 7
  // years. Hard-deleting it here would cascade away the order + deposit audit
  // rows (orders.booking_id and audit_log.booking_id are ON DELETE CASCADE), so
  // those rows are KEPT (pseudonymised at account deletion or by the retention
  // purge). Their reference IMAGES are still purged at 30 days per counsel §6,
  // exactly like non-money bookings. Only non-money booking rows are deleted.
  const { data: moneyOrders, error: moneyOrdersError } = await serviceClient
    .from("orders")
    .select("booking_id")
    .in("booking_id", staleIds)
    .in("status", ORDER_MONEY_STATES);

  if (moneyOrdersError) {
    console.error("[cron/cleanup][retention-guard]", moneyOrdersError, {
      staleCount: staleIds.length,
    });
    Sentry.captureException(moneyOrdersError, {
      tags: { route: "cron/cleanup", step: "retention-guard" },
      extra: { staleCount: staleIds.length },
    });
  }

  const moneyBookingIds = new Set<string>(
    (moneyOrders ?? []).map((o) => o.booking_id as string),
  );
  for (const r of stale) {
    if (r.deposit_paid_at) moneyBookingIds.add(r.id);
  }

  // Delete reference images for ALL stale bookings (PII; counsel §6 30-day rule),
  // including money-state ones whose rows we retain. A booking whose image
  // purge fails is excluded from the row delete below (imagePurgeFailedIds):
  // the row is the only remaining pointer to that storage folder, so deleting
  // it here would make an unpurged image permanently unreachable. Retrying
  // next run needs the row to still exist.
  const imagePurgeFailedIds = new Set<string>();
  for (const booking of stale) {
    const folder = `${booking.artist_id}/${booking.id}`;
    const { data: files, error: listError } = await serviceClient.storage
      .from("bookings")
      .list(folder);

    if (listError) {
      console.error("[cron/cleanup][image-purge-list]", listError, {
        bookingId: booking.id,
      });
      Sentry.captureException(listError, {
        tags: { route: "cron/cleanup", step: "image-purge-list" },
        extra: { bookingId: booking.id },
      });
      imagePurgeFailedIds.add(booking.id);
      continue;
    }

    if (files && files.length > 0) {
      const { error: removeError } = await serviceClient.storage
        .from("bookings")
        .remove(files.map((f) => `${folder}/${f.name}`));

      if (removeError) {
        console.error("[cron/cleanup][image-purge-remove]", removeError, {
          bookingId: booking.id,
        });
        Sentry.captureException(removeError, {
          tags: { route: "cron/cleanup", step: "image-purge-remove" },
          extra: { bookingId: booking.id },
        });
        imagePurgeFailedIds.add(booking.id);
      }
    }
  }

  // CRON-CLN-001: `moneyBookingIds` is the ONLY source of truth for which
  // stale bookings carry a 7-year financial record. If the retention query
  // above errored, the set built from it is incomplete rather than empty —
  // deleting anything on that basis risks cascading away a real financial
  // record (orders.booking_id is ON DELETE CASCADE). Fail closed: skip the
  // delete step entirely and retry on the next run once the guard succeeds.
  const deletableIds = moneyOrdersError
    ? []
    : staleIds.filter(
        (id) => !moneyBookingIds.has(id) && !imagePurgeFailedIds.has(id),
      );

  if (deletableIds.length > 0) {
    const { error: deleteError } = await serviceClient
      .from("booking_requests")
      .delete()
      .in("id", deletableIds);

    if (deleteError) {
      Sentry.captureException(deleteError, {
        tags: { route: "cron/cleanup", step: "delete" },
        extra: { deletableCount: deletableIds.length },
      });
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  // ── Unreconciled deposit check ────────────────────────────────────────────
  // Bookings in deposit_pending where due date is >7 days past and no
  // deposit_paid_at — flag for manual review, do not auto-cancel.
  const overdueWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const { data: unreconciled } = await serviceClient
    .from("booking_requests")
    .select("id, artist_id, customer_handle, deposit_due_at")
    .eq("status", "deposit_pending")
    .lt("deposit_due_at", overdueWindow)
    .is("deposit_paid_at", null);

  let flagged = 0;
  for (const booking of unreconciled ?? []) {
    // Only flag once — skip if already logged as unreconciled today
    const today = new Date().toISOString().split("T")[0];
    const { count } = await serviceClient
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking.id)
      .eq("action", "deposit_unreconciled")
      .gte("timestamp", `${today}T00:00:00Z`);

    if ((count ?? 0) > 0) continue;

    void writeAudit({
      bookingId: booking.id,
      action: "deposit_unreconciled",
      category: "system",
      details: {
        artist_id: booking.artist_id,
        customer_handle: booking.customer_handle,
        deposit_due_at: booking.deposit_due_at,
      },
    });
    flagged++;
  }

  return NextResponse.json({
    deleted: deletableIds.length,
    retained_with_financial_record: moneyBookingIds.size,
    retention_guard_failed: Boolean(moneyOrdersError),
    image_purge_failed: imagePurgeFailedIds.size,
    flagged_unreconciled: flagged,
    stays_activated: stayLifecycle.activated,
    stays_completed: stayLifecycle.completed,
    stay_requests_completed: stayLifecycle.requestsCompleted,
    payment_reconciliation: paymentReconciliation,
    payment_expiry: paymentExpiry,
    stale_standalone_orders: staleStandaloneOrders,
    billing_reconciliation: billingReconciliation,
    comp_expiry: compExpiry,
    analytics_rollup: analyticsRollup,
  });
}
