import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { parseBooksSettings } from "@/lib/books-settings";
import { parseDashboardWidgets } from "@/lib/dashboard-settings";
import { isDateKeyBefore, todayInTimeZone } from "@/lib/date-utils";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import StatusBadge from "@/components/status-badge";
import BookingLinkWidget from "./booking-link-widget";
import { Card, CardHeader, IconChip } from "@/components/ui/card";
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {profile?.display_name ?? "Dashboard"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Overview</p>
      </div>

      {!onboardingCompleted && (
        <Link
          href="/onboarding/booking"
          className="flex items-center justify-between rounded-[20px] border border-border px-5 py-4 transition-colors hover:bg-[color:var(--color-workspace-hover)]"
        >
          <div className="flex items-center gap-3">
            <IconChip icon={Sparkles} tint="rosa" size="sm" />
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
          className="flex items-center justify-between rounded-[20px] border-2 border-dashed border-border px-5 py-4 transition-colors hover:bg-[color:var(--color-workspace-hover)]"
        >
          <div className="flex items-center gap-3">
            <IconChip icon={Sparkles} tint="bone" size="sm" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Add a short bio
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Help clients understand your style before they book.
              </p>
            </div>
          </div>
          <span className="text-sm text-muted-foreground">&rarr;</span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {widgets.pending_requests && (
          <Card className="space-y-4">
            <CardHeader>
              <IconChip icon={Inbox} tint="mustard" />
              <p className="text-sm font-medium text-foreground">
                Pending requests
              </p>
              <Link
                href="/bookings/overview?view=requests"
                className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                View all
              </Link>
            </CardHeader>
            {pendingCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending requests.
              </p>
            ) : (
              <>
                <p className="text-4xl font-semibold tracking-tight text-foreground">
                  {pendingCount}
                </p>
                <div className="space-y-1">
                  {pendingBookings.map((b) => (
                    <Link
                      key={b.id}
                      href={`/bookings/requests/${b.id}`}
                      className="group flex items-center justify-between rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-[color:var(--color-workspace-hover)]"
                    >
                      <span className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                        @{b.customer_handle}
                      </span>
                      <StatusBadge status="pending" />
                    </Link>
                  ))}
                  {pendingCount > 3 && (
                    <p className="px-2 text-xs text-muted-foreground">
                      +{pendingCount - 3} more
                    </p>
                  )}
                </div>
              </>
            )}
          </Card>
        )}

        {widgets.books_status && (
          <Card className="space-y-4">
            <CardHeader>
              <IconChip icon={BookOpen} tint={booksOpen ? "green" : "bone"} />
              <p className="text-sm font-medium text-foreground">Books</p>
              <Link
                href="/bookings/settings"
                className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Manage
              </Link>
            </CardHeader>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={`inline-block h-2 w-2 rounded-full ${booksOpen ? "bg-brand-green" : "bg-muted-foreground"}`}
              />
              <p className="text-sm font-medium text-foreground">
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
          </Card>
        )}

        {widgets.upcoming_appointments && (
          <Card className="space-y-4">
            <CardHeader>
              <IconChip icon={CalendarDays} tint="rosa" />
              <p className="text-sm font-medium text-foreground">Upcoming</p>
              <Link
                href="/bookings/calendar"
                className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Calendar
              </Link>
            </CardHeader>
            {upcomingBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming appointments.
              </p>
            ) : (
              <div className="space-y-1">
                {upcomingBookings.map((b) => {
                  const fd = b.form_data as Record<string, string> | null;
                  return (
                    <Link
                      key={b.id}
                      href={`/bookings/requests/${b.id}`}
                      className="group flex items-center justify-between rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-[color:var(--color-workspace-hover)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          @{b.customer_handle}
                        </p>
                        {fd?.placement && (
                          <p className="truncate text-xs text-muted-foreground">
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
          </Card>
        )}

        {widgets.waitlist && waitlistCount > 0 && (
          <Card className="space-y-4">
            <CardHeader>
              <IconChip icon={Users} tint="cobalt" />
              <p className="text-sm font-medium text-foreground">Waitlist</p>
              <Link
                href="/bookings/waitlist"
                className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                View
              </Link>
            </CardHeader>
            <p className="text-4xl font-semibold tracking-tight text-foreground">
              {waitlistCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {waitlistCount === 1 ? "Person" : "People"} waiting
            </p>
          </Card>
        )}

        {widgets.booking_link && profile?.slug && (
          <BookingLinkWidget publicUrl={publicUrl} slug={profile.slug} />
        )}
      </div>

      <Link
        href="/analytics"
        className="flex items-center justify-between rounded-[20px] border border-border px-5 py-4 transition-colors hover:bg-[color:var(--color-workspace-hover)]"
      >
        <div className="flex items-center gap-3">
          <IconChip icon={BarChart3} tint="bone" size="sm" />
          <div>
            <p className="text-sm font-medium text-foreground">Analytics</p>
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
          <Card className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              All widgets are hidden.{" "}
              <Link
                href="/settings/dashboard"
                className="underline hover:text-foreground"
              >
                Configure dashboard
              </Link>
            </p>
          </Card>
        )}
    </div>
  );
}
