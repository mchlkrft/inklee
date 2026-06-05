import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { customerLabel } from "@/lib/booking-domain";
import { parseBooksSettings } from "@/lib/books-settings";
import { todayInTimeZone } from "@/lib/date-utils";

export const runtime = "nodejs";

type HomeBookingRow = {
  id: string;
  customer_handle: string | null;
  customer_email: string | null;
  preferred_date: string | null;
  created_at: string | null;
  form_data: Record<string, string> | null;
};

function mapRow(b: HomeBookingRow) {
  const fd = b.form_data ?? {};
  return {
    id: b.id,
    client: customerLabel(b.customer_handle, b.customer_email),
    placement: fd.placement ?? null,
    preferredDate: b.preferred_date,
    createdAt: b.created_at,
  };
}

// GET /api/mobile/home — the "what needs action right now" aggregate that backs
// the Home tab: pending requests, upcoming approved bookings, waitlist count,
// books open/closed. Mirrors the web dashboard reads; RLS scopes to the artist.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, display_name, timezone, settings")
    .eq("id", userId)
    .single();
  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  const booksSettings = parseBooksSettings(settings.books_settings);
  const today = todayInTimeZone(profile?.timezone ?? "Europe/Berlin");

  const [pending, upcoming, waitlist] = await Promise.all([
    supabase
      .from("booking_requests")
      .select("id, customer_handle, customer_email, created_at, form_data", {
        count: "exact",
      })
      .eq("artist_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("booking_requests")
      .select("id, customer_handle, customer_email, preferred_date, form_data")
      .eq("artist_id", userId)
      .eq("status", "approved")
      .not("preferred_date", "is", null)
      .gte("preferred_date", today)
      .order("preferred_date", { ascending: true })
      .limit(5),
    supabase
      .from("waitlist_entries")
      .select("*", { count: "exact", head: true })
      .eq("artist_id", userId)
      .eq("status", "waiting"),
  ]);

  return mobileOk({
    displayName: profile?.display_name ?? null,
    slug: profile?.slug ?? null,
    booksOpen: booksSettings.books_open,
    onboardingCompleted: settings.onboarding_completed === true,
    pendingCount: pending.count ?? 0,
    pending: ((pending.data ?? []) as HomeBookingRow[]).map(mapRow),
    upcoming: ((upcoming.data ?? []) as HomeBookingRow[]).map(mapRow),
    waitlistCount: waitlist.count ?? 0,
  });
}
