import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";

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

  return NextResponse.json({ deleted: ids.length });
}
