import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: stale, error: fetchError } = await serviceClient
    .from("booking_requests")
    .select("id")
    .in("status", ["rejected", "cancelled"])
    .lt("updated_at", cutoff);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const ids = stale.map((r) => r.id);

  // Delete storage files for each booking
  for (const id of ids) {
    const { data: files } = await serviceClient.storage
      .from("bookings")
      .list(id);
    if (files && files.length > 0) {
      await serviceClient.storage
        .from("bookings")
        .remove(files.map((f) => `${id}/${f.name}`));
    }
  }

  const { error: deleteError } = await serviceClient
    .from("booking_requests")
    .delete()
    .in("id", ids);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
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
    deleted: ids.length,
    flagged_unreconciled: flagged,
  });
}
