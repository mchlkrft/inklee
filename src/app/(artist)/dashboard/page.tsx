import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { parseBooksSettings } from "@/lib/books-settings";
import { parseDashboardWidgets } from "@/lib/dashboard-settings";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import StatusBadge from "@/components/status-badge";
import BookingLinkWidget from "./booking-link-widget";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, display_name, settings")
    .eq("id", user!.id)
    .single();

  const profileSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const onboardingCompleted = profileSettings.onboarding_completed === true;
  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  const widgets = parseDashboardWidgets(profileSettings.dashboard_widgets);

  const now = new Date();
  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    new Date(booksSettings.booking_window_ends_at) < now;
  const booksOpen = booksSettings.books_open && !windowExpired;

  // Fetch data for visible widgets in parallel
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
            .gte("preferred_date", now.toISOString().split("T")[0])
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
          {profile?.display_name ?? "dashboard"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">overview</p>
      </div>

      {/* Onboarding prompt for artists who skipped the wizard */}
      {!onboardingCompleted && (
        <Link
          href="/onboarding/profile"
          className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-4 py-3 hover:bg-muted/40 transition-colors"
        >
          <div>
            <p className="text-sm text-foreground">
              finish setting up your profile
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              add your bio, location, and booking preferences
            </p>
          </div>
          <span className="text-muted-foreground text-sm">→</span>
        </Link>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pending requests widget */}
        {widgets.pending_requests && (
          <div className="rounded-md border border-border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                pending requests
              </p>
              <Link
                href="/bookings/requests?status=pending"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                view all →
              </Link>
            </div>
            {pendingCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                no pending requests.
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
                      className="flex items-center justify-between py-1 hover:text-foreground group"
                    >
                      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
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

        {/* Books status widget */}
        {widgets.books_status && (
          <div className="rounded-md border border-border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">books</p>
              <Link
                href="/bookings/books"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                manage →
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${booksOpen ? "bg-green-500" : "bg-muted-foreground"}`}
              />
              <p className="text-sm text-foreground">
                {booksOpen ? "open" : "closed"}
              </p>
            </div>
            {capRemaining !== null && booksOpen && (
              <p className="text-xs text-muted-foreground">
                {capRemaining} spots remaining
              </p>
            )}
            {booksSettings.books_closed_message && !booksOpen && (
              <p className="text-xs text-muted-foreground italic">
                &ldquo;{booksSettings.books_closed_message}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Upcoming appointments widget */}
        {widgets.upcoming_appointments && (
          <div className="rounded-md border border-border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">upcoming</p>
              <Link
                href="/bookings/calendar"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                calendar →
              </Link>
            </div>
            {upcomingBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                no upcoming appointments.
              </p>
            ) : (
              <div className="space-y-2">
                {upcomingBookings.map((b) => {
                  const fd = b.form_data as Record<string, string> | null;
                  return (
                    <Link
                      key={b.id}
                      href={`/bookings/requests/${b.id}`}
                      className="flex items-center justify-between group"
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
                      <p className="text-xs text-muted-foreground shrink-0">
                        {b.preferred_date ? formatDate(b.preferred_date) : "—"}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Waitlist widget — shown when books are closed or cap reached */}
        {widgets.waitlist && waitlistCount > 0 && (
          <div className="rounded-md border border-border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">waitlist</p>
              <Link
                href="/bookings/waitlist"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                view →
              </Link>
            </div>
            <p className="text-3xl font-semibold text-foreground">
              {waitlistCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {waitlistCount === 1 ? "person" : "people"} waiting
            </p>
          </div>
        )}

        {/* Booking link widget */}
        {widgets.booking_link && profile?.slug && (
          <BookingLinkWidget publicUrl={publicUrl} slug={profile.slug} />
        )}
      </div>

      {/* Empty state when all widgets disabled */}
      {!widgets.pending_requests &&
        !widgets.books_status &&
        !widgets.upcoming_appointments &&
        !widgets.waitlist &&
        !widgets.booking_link && (
          <div className="rounded-md border border-border px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              all widgets are hidden.{" "}
              <Link
                href="/settings/dashboard"
                className="underline hover:text-foreground"
              >
                configure dashboard
              </Link>
            </p>
          </div>
        )}
    </div>
  );
}
