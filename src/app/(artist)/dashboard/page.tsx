import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { parseBooksSettings } from "@/lib/books-settings";
import { parseDashboardWidgets } from "@/lib/dashboard-settings";
import { isDateKeyBefore, todayInTimeZone } from "@/lib/date-utils";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import StatusBadge from "@/components/status-badge";
import BookingLinkWidget from "./booking-link-widget";
import {
  Inbox,
  BookOpen,
  CalendarDays,
  Users,
  BarChart3,
  Sparkles,
} from "lucide-react";
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, display_name, settings, timezone, bio")
    .eq("id", user!.id)
    .single();

  const profileSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const onboardingCompleted = profileSettings.onboarding_completed === true;
  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  const widgets = parseDashboardWidgets(profileSettings.dashboard_widgets);

  const today = todayInTimeZone(profile?.timezone ?? "Europe/Berlin");
  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    isDateKeyBefore(booksSettings.booking_window_ends_at, today);
  const booksOpen = booksSettings.books_open && !windowExpired;

  const [pendingResult, upcomingResult, waitlistResult, capResult] =
    await Promise.all([
      widgets.pending_requests
        ? supabase
            .from("booking_requests")
            .select("id, customer_handle, created_at", { count: "exact" })
            .eq("artist_id", user!.id)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(3)
        : Promise.resolve({ data: null, count: null }),

      widgets.upcoming_appointments
        ? supabase
            .from("booking_requests")
            .select("id, customer_handle, preferred_date, form_data")
            .eq("artist_id", user!.id)
            .eq("status", "approved")
            .not("preferred_date", "is", null)
            .gte("preferred_date", today)
            .order("preferred_date", { ascending: true })
            .limit(3)
        : Promise.resolve({ data: null }),

      widgets.waitlist
        ? supabase
            .from("waitlist_entries")
            .select("*", { count: "exact", head: true })
            .eq("artist_id", user!.id)
            .eq("status", "waiting")
        : Promise.resolve({ count: null }),

      widgets.books_status && booksSettings.booking_cap !== null
        ? serviceClient
            .from("booking_requests")
            .select("*", { count: "exact", head: true })
            .eq("artist_id", user!.id)
            .in("status", ["pending", "approved", "deposit_pending"])
        : Promise.resolve({ count: null }),
    ]);

  const pendingBookings = pendingResult.data ?? [];
  const pendingCount = pendingResult.count ?? 0;
  const upcomingBookings = upcomingResult.data ?? [];
  const waitlistCount = waitlistResult.count ?? 0;
  const activeCount = capResult.count ?? 0;
  const capRemaining =
    booksSettings.booking_cap !== null
      ? Math.max(0, booksSettings.booking_cap - activeCount)
      : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const publicUrl = `${appUrl}/${profile?.slug ?? ""}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {profile?.display_name ?? "Dashboard"}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Overview</p>
      </div>

      {!onboardingCompleted && (
        <Link
          href="/onboarding/booking"
          className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Finish setting up your account
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A couple more steps before your booking page is fully ready.
              </p>
            </div>
          </div>
          <span className="text-sm text-muted-foreground">&rarr;</span>
        </Link>
      )}

      {onboardingCompleted && !profile?.bio && (
        <Link
          href="/settings/profile"
          className="flex items-center justify-between rounded-md border border-dashed border-border px-4 py-3 transition-colors hover:bg-muted/20"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm text-foreground">Add a short bio</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Help clients understand your style before they book.
              </p>
            </div>
          </div>
          <span className="text-sm text-muted-foreground">&rarr;</span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {widgets.pending_requests && (
          <div className="space-y-3 rounded-md border border-border p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Pending requests
                </p>
              </div>
              <Link
                href="/bookings/overview?view=requests"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                View all
              </Link>
            </div>
            {pendingCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending requests.
              </p>
            ) : (
              <>
                <p className="text-3xl font-semibold text-foreground">
                  {pendingCount}
                </p>
                <div className="space-y-1">
                  {pendingBookings.map((b) => (
                    <Link
                      key={b.id}
                      href={`/bookings/requests/${b.id}`}
                      className="group flex items-center justify-between py-1 hover:text-foreground"
                    >
                      <span className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                        @{b.customer_handle}
                      </span>
                      <StatusBadge status="pending" />
                    </Link>
                  ))}
                  {pendingCount > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{pendingCount - 3} more
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {widgets.books_status && (
          <div className="space-y-3 rounded-md border border-border p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Books</p>
              </div>
              <Link
                href="/bookings/settings"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Manage
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${booksOpen ? "bg-green-500" : "bg-muted-foreground"}`}
              />
              <p className="text-sm text-foreground">
                {booksOpen ? "Open" : "Closed"}
              </p>
            </div>
            {capRemaining !== null && booksOpen && (
              <p className="text-xs text-muted-foreground">
                {capRemaining} spots remaining
              </p>
            )}
            {booksSettings.books_closed_message && !booksOpen && (
              <p className="text-xs italic text-muted-foreground">
                &ldquo;{booksSettings.books_closed_message}&rdquo;
              </p>
            )}
          </div>
        )}

        {widgets.upcoming_appointments && (
          <div className="space-y-3 rounded-md border border-border p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Upcoming</p>
              </div>
              <Link
                href="/bookings/calendar"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Calendar
              </Link>
            </div>
            {upcomingBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming appointments.
              </p>
            ) : (
              <div className="space-y-2">
                {upcomingBookings.map((b) => {
                  const fd = b.form_data as Record<string, string> | null;
                  return (
                    <Link
                      key={b.id}
                      href={`/bookings/requests/${b.id}`}
                      className="group flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm text-foreground group-hover:underline">
                          @{b.customer_handle}
                        </p>
                        {fd?.placement && (
                          <p className="text-xs text-muted-foreground">
                            {fd.placement}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {b.preferred_date ? formatDate(b.preferred_date) : "-"}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {widgets.waitlist && waitlistCount > 0 && (
          <div className="space-y-3 rounded-md border border-border p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Waitlist</p>
              </div>
              <Link
                href="/bookings/waitlist"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                View
              </Link>
            </div>
            <p className="text-3xl font-semibold text-foreground">
              {waitlistCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {waitlistCount === 1 ? "Person" : "People"} waiting
            </p>
          </div>
        )}

        {widgets.booking_link && profile?.slug && (
          <BookingLinkWidget publicUrl={publicUrl} slug={profile.slug} />
        )}
      </div>

      <Link
        href="/analytics"
        className="flex items-center justify-between rounded-md border border-border px-4 py-3 transition-colors hover:bg-muted/20"
      >
        <div className="flex items-center gap-3">
          <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm text-foreground">Analytics</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Conversion, volume, and client return rate
            </p>
          </div>
        </div>
        <span className="text-sm text-muted-foreground">&rarr;</span>
      </Link>

      {!widgets.pending_requests &&
        !widgets.books_status &&
        !widgets.upcoming_appointments &&
        !widgets.waitlist &&
        !widgets.booking_link && (
          <div className="rounded-md border border-border px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              All widgets are hidden.{" "}
              <Link
                href="/settings/dashboard"
                className="underline hover:text-foreground"
              >
                Configure dashboard
              </Link>
            </p>
          </div>
        )}
    </div>
  );
}
