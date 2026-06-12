import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { customerLabel } from "@/lib/booking-domain";
import { parseBooksSettings } from "@/lib/books-settings";
import { parseDashboardWidgets } from "@/lib/dashboard-settings";
import { isDateKeyBefore, todayInTimeZone } from "@/lib/date-utils";
import type {
  MobileHome,
  MobileHomeBooking,
  MobileGuestSpot,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

type HomeBookingRow = {
  id: string;
  customer_handle: string | null;
  customer_email: string | null;
  preferred_date: string | null;
  created_at: string | null;
  form_data: Record<string, string> | null;
};

type RawTripLeg = {
  id: string;
  starts_on: string;
  ends_on: string;
  studios: { name: string } | null;
};

function mapRow(b: HomeBookingRow): MobileHomeBooking {
  const fd = b.form_data ?? {};
  return {
    id: b.id,
    client: customerLabel(b.customer_handle, b.customer_email),
    placement: fd.placement ?? null,
    preferredDate: b.preferred_date,
    createdAt: b.created_at,
  };
}

// GET /api/mobile/home — the dashboard aggregate backing the Home widget grid.
// Mirrors the web dashboard reads (apps/web/src/app/(artist)/dashboard/page.tsx):
// each query is gated by the artist's per-widget visibility toggle, plus the
// total-received count (for the zero-request links convenience) and bio (for the
// add-a-bio nudge). RLS scopes everything to the artist.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, display_name, timezone, bio, settings")
    .eq("id", userId)
    .single();
  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  const booksSettings = parseBooksSettings(settings.books_settings);
  const widgets = parseDashboardWidgets(settings.dashboard_widgets);
  const onboardingCompleted = settings.onboarding_completed === true;
  const today = todayInTimeZone(profile?.timezone ?? "Europe/Berlin");
  // Match the web: an expired booking window closes the books even if the
  // books_open flag is still true (else mobile shows Open while the public
  // page is Closed).
  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    isDateKeyBefore(booksSettings.booking_window_ends_at, today);

  const [pending, upcoming, waitlist, totalReceived, guestSpotsRes] =
    await Promise.all([
      widgets.pending_requests
        ? supabase
            .from("booking_requests")
            .select(
              "id, customer_handle, customer_email, created_at, form_data",
              { count: "exact" },
            )
            .eq("artist_id", userId)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(3)
        : Promise.resolve({ data: null, count: null }),
      widgets.upcoming_appointments
        ? supabase
            .from("booking_requests")
            .select(
              "id, customer_handle, customer_email, preferred_date, form_data",
              { count: "exact" },
            )
            .eq("artist_id", userId)
            .eq("status", "approved")
            .not("preferred_date", "is", null)
            .gte("preferred_date", today)
            .order("preferred_date", { ascending: true })
            .limit(3)
        : Promise.resolve({ data: null, count: null }),
      widgets.waitlist
        ? supabase
            .from("waitlist_entries")
            .select("*", { count: "exact", head: true })
            .eq("artist_id", userId)
            .eq("status", "waiting")
        : Promise.resolve({ count: null }),
      onboardingCompleted
        ? supabase
            .from("booking_requests")
            .select("*", { count: "exact", head: true })
            .eq("artist_id", userId)
        : Promise.resolve({ count: null }),
      widgets.guest_spots
        ? supabase
            .from("trips")
            .select(
              "id, title, icon, trip_legs(id, starts_on, ends_on, studios(name))",
            )
            .eq("artist_id", userId)
        : Promise.resolve({ data: null }),
    ]);

  // Flatten trips × legs into upcoming guest spots, tz-aware, sorted, top 3.
  const guestSpots: MobileGuestSpot[] = (guestSpotsRes.data ?? [])
    .flatMap((t) =>
      ((t.trip_legs as unknown as RawTripLeg[]) ?? []).map((l) => ({
        id: l.id,
        tripId: t.id,
        tripTitle: t.title,
        studioName: l.studios?.name ?? null,
        startsOn: l.starts_on,
        endsOn: l.ends_on,
        icon: ((t as { icon?: string | null }).icon ?? null) as string | null,
      })),
    )
    .filter((l) => l.endsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .slice(0, 3);

  const body: MobileHome = {
    displayName: profile?.display_name ?? null,
    slug: profile?.slug ?? null,
    bio: (profile?.bio as string | null) ?? null,
    booksOpen: booksSettings.books_open && !windowExpired,
    onboardingCompleted,
    dashboardWidgets: widgets,
    pendingCount: pending.count ?? 0,
    pending: ((pending.data ?? []) as HomeBookingRow[]).map(mapRow),
    upcoming: ((upcoming.data ?? []) as HomeBookingRow[]).map(mapRow),
    upcomingCount: upcoming.count ?? 0,
    guestSpots,
    waitlistCount: waitlist.count ?? 0,
    totalReceivedCount: totalReceived.count ?? 0,
  };
  return mobileOk(body);
}
