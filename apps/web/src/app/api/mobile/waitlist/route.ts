import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import type { MobileWaitlistResponse } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/waitlist?status= — waitlist entries for the artist. Defaults
// to the active ("waiting") entries; pass ?status=all for the full history.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const status = new URL(req.url).searchParams.get("status") ?? "waiting";

  // Explicit columns so the wire contract matches MobileWaitlistEntry (and
  // artist_id or future columns never leak to the device by accident).
  let query = supabase
    .from("waitlist_entries")
    .select(
      "id, customer_email, customer_handle, note, status, created_at, city_text",
    )
    .eq("artist_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return mobileError(500, error.message);

  const responseBody: MobileWaitlistResponse = {
    items: (data ?? []) as MobileWaitlistResponse["items"],
  };
  return mobileOk(responseBody);
}
