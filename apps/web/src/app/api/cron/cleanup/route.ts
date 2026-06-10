import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";
import { ORDER_MONEY_STATES } from "@/lib/server/account-deletion-logic";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: stale, error: fetchError } = await serviceClient
    .from("booking_requests")
    .select("id, artist_id, deposit_paid_at")
    .in("status", ["rejected", "cancelled"])
    .lt("updated_at", cutoff);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const staleIds = stale.map((r) => r.id);

  // Counsel §4: a booking that captured money — a paid deposit, or a paid/
  // refunded goods order — carries a financial record Inklee must retain for 7
  // years. Hard-deleting it here would cascade away the order + deposit audit
  // rows (orders.booking_id and audit_log.booking_id are ON DELETE CASCADE), so
  // those rows are KEPT (pseudonymised at account deletion or by the retention
  // purge). Their reference IMAGES are still purged at 30 days per counsel §6,
  // exactly like non-money bookings. Only non-money booking rows are deleted.
  const { data: moneyOrders } = await serviceClient
    .from("orders")
    .select("booking_id")
    .in("booking_id", staleIds)
    .in("status", ORDER_MONEY_STATES);
  const moneyBookingIds = new Set<string>(
    (moneyOrders ?? []).map((o) => o.booking_id as string),
  );
  for (const r of stale) {
    if (r.deposit_paid_at) moneyBookingIds.add(r.id);
  }
  const deletableIds = staleIds.filter((id) => !moneyBookingIds.has(id));

  // Delete reference images for ALL stale bookings (PII; counsel §6 30-day rule),
  // including money-state ones whose rows we retain.
  for (const booking of stale) {
    const folder = `${booking.artist_id}/${booking.id}`;
    const { data: files } = await serviceClient.storage
      .from("bookings")
      .list(folder);
    if (files && files.length > 0) {
      await serviceClient.storage
        .from("bookings")
        .remove(files.map((f) => `${folder}/${f.name}`));
    }
  }

  if (deletableIds.length > 0) {
    const { error: deleteError } = await serviceClient
      .from("booking_requests")
      .delete()
      .in("id", deletableIds);

    if (deleteError) {
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
    flagged_unreconciled: flagged,
  });
}
