import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { todayInTimeZone } from "@/lib/date-utils";
import { localToUTC } from "@/lib/timezone";
import type { MobileBookingStats } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/bookings/stats — the Requests-tab big-number strip. Three
// cheap head-count queries, deliberately NOT sourced from /home (whose counts
// are zeroed when the artist hides dashboard widgets). "Upcoming" mirrors the
// web dashboard's definition: approved with a preferred date today or later in
// the artist's timezone. Static segment wins over the sibling [id] route.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .single();
  const timezone = profile?.timezone ?? "Europe/Berlin";
  const today = todayInTimeZone(timezone);
  // created_at is timestamptz, so the month boundary must be the UTC instant
  // of the artist's local midnight on the 1st (a bare date key would be read
  // as UTC midnight and miscount the first hours of each month).
  const monthStart = localToUTC(`${today.slice(0, 7)}-01`, "00:00", timezone);

  const [pending, upcoming, thisMonth] = await Promise.all([
    supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", userId)
      .eq("status", "pending"),
    supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", userId)
      .eq("status", "approved")
      .not("preferred_date", "is", null)
      .gte("preferred_date", today),
    supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", userId)
      .gte("created_at", monthStart),
  ]);

  const body: MobileBookingStats = {
    pendingCount: pending.count ?? 0,
    upcomingCount: upcoming.count ?? 0,
    thisMonthCount: thisMonth.count ?? 0,
  };
  return mobileOk(body);
}
