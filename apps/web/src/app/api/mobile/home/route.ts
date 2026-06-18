import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseBooksSettings } from "@/lib/books-settings";
import { parseDashboardWidgets } from "@/lib/dashboard-settings";
import { isDateKeyBefore, todayInTimeZone } from "@/lib/date-utils";
import { getDashboardData } from "@/lib/server/dashboard";
import type { MobileHome } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/home — the dashboard aggregate backing the Home grid. The data
// queries + the ranked "Action required" feed live in the shared getDashboardData
// (apps/web/src/lib/server/dashboard.ts), consumed by BOTH this route and the web
// dashboard page so the two surfaces can never disagree (one-source-of-truth).
// This route adds the profile-level fields (name, slug, bio, books status) and
// the per-widget toggles. RLS scopes everything to the artist.
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
  const timezone = profile?.timezone ?? "Europe/Berlin";
  const today = todayInTimeZone(timezone);
  // Match the web: an expired booking window closes the books even if the
  // books_open flag is still true.
  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    isDateKeyBefore(booksSettings.booking_window_ends_at, today);

  const data = await getDashboardData(supabase, userId, {
    timezone,
    widgets,
    onboardingCompleted,
  });

  const body: MobileHome = {
    displayName: profile?.display_name ?? null,
    slug: profile?.slug ?? null,
    bio: (profile?.bio as string | null) ?? null,
    booksOpen: booksSettings.books_open && !windowExpired,
    onboardingCompleted,
    // The artist-timezone "today" for the Home greeting date (the app has no
    // Intl to compute it itself). Reuses the same `today` already derived above.
    todayKey: today,
    dashboardWidgets: widgets,
    pendingCount: data.pendingCount,
    pending: data.pending,
    upcoming: data.upcoming,
    upcomingCount: data.upcomingCount,
    guestSpots: data.guestSpots,
    waitlistCount: data.waitlistCount,
    totalReceivedCount: data.totalReceivedCount,
    thisMonthCount: data.thisMonthCount,
    depositsOutstandingCount: data.depositsOutstandingCount,
    depositsOverdueCount: data.depositsOverdueCount,
    actionItems: data.actionItems,
  };
  return mobileOk(body);
}
