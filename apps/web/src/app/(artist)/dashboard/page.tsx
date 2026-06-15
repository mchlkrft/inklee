import { createClient } from "@/lib/supabase/server";
import { parseDashboardWidgets } from "@/lib/dashboard-settings";
import { todayInTimeZone } from "@/lib/date-utils";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import StatusBadge from "@/components/status-badge";
import BookingLinkWidget from "./booking-link-widget";
import { publicArtistUrl } from "@/lib/public-url";
import { customerLabel } from "@/lib/booking-domain";
import { Card, CardHeader, IconChip } from "@/components/ui/card";
import { TravelIcon } from "@/components/travel-icon";
import {
  Inbox,
  CalendarDays,
  MapPin,
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
  const widgets = parseDashboardWidgets(profileSettings.dashboard_widgets);

  const today = todayInTimeZone(profile?.timezone ?? "Europe/Berlin");

  const [
    pendingResult,
    upcomingResult,
    waitlistResult,
    totalReceivedResult,
    guestSpotsResult,
  ] = await Promise.all([
    widgets.pending_requests
      ? supabase
          .from("booking_requests")
          .select(
            "id, customer_handle, customer_email, created_at, form_data",
            {
              count: "exact",
            },
          )
          .eq("artist_id", user!.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: null, count: null }),

    widgets.upcoming_appointments
      ? supabase
          .from("booking_requests")
          .select(
            "id, customer_handle, customer_email, preferred_date, form_data",
          )
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

    onboardingCompleted
      ? supabase
          .from("booking_requests")
          .select("*", { count: "exact", head: true })
          .eq("artist_id", user!.id)
      : Promise.resolve({ count: null }),

    // Upcoming guest spots — trip legs that haven't ended yet, with their
    // parent trip + studio for display. Filtered + sorted in JS so the
    // widget toggle controls whether we run the join at all.
    widgets.guest_spots
      ? supabase
          .from("trips")
          .select(
            "id, title, icon, trip_legs(id, starts_on, ends_on, studios(name))",
          )
          .eq("artist_id", user!.id)
      : Promise.resolve({ data: null }),
  ]);

  const pendingBookings = pendingResult.data ?? [];
  const pendingCount = pendingResult.count ?? 0;
  const upcomingBookings = upcomingResult.data ?? [];
  const waitlistCount = waitlistResult.count ?? 0;
  const totalReceivedCount = totalReceivedResult.count ?? 0;

  // Flatten the trips × trip_legs join into a list of upcoming legs, sorted
  // by start date, with the parent trip's title carried along for display.
  type RawTripLeg = {
    id: string;
    starts_on: string;
    ends_on: string;
    studios: { name: string } | null;
  };
  type UpcomingLeg = {
    id: string;
    tripId: string;
    tripTitle: string;
    startsOn: string;
    endsOn: string;
    studioName: string | null;
    icon: string | null;
  };
  const upcomingGuestSpots: UpcomingLeg[] = (guestSpotsResult.data ?? [])
    .flatMap((t) =>
      ((t.trip_legs as unknown as RawTripLeg[]) ?? []).map((l) => ({
        id: l.id,
        tripId: t.id,
        tripTitle: t.title,
        startsOn: l.starts_on,
        endsOn: l.ends_on,
        studioName: l.studios?.name ?? null,
        icon: ((t as { icon?: string | null }).icon ?? null) as string | null,
      })),
    )
    .filter((l) => l.endsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .slice(0, 3);

  const publicUrl = publicArtistUrl(profile?.slug);
  const waitlistUrl = publicArtistUrl(profile?.slug, { subpath: "/waitlist" });

  // Zero-request post-onboarding artists get a prominent share-your-link card
  // (D13) and an always-visible BookingLinkWidget regardless of the toggle (D12).
  const isZeroRequest =
    onboardingCompleted && !!profile?.slug && totalReceivedCount === 0;

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

      {/* isZeroRequest used to render a dedicated "Your booking link is live"
          card here. Removed 2026-05-24 because it duplicated the
          BookingLinkWidget below (sharing, preview, copy all live there).
          Books open/closed status is now surfaced as a compact pill in the
          mobile top bar — matches the desktop pattern. */}

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
                  {pendingBookings.map((b) => {
                    const fd = b.form_data as Record<string, string> | null;
                    return (
                      <Link
                        key={b.id}
                        href={`/bookings/requests/${b.id}`}
                        className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-[color:var(--color-workspace-hover)]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                            {customerLabel(b.customer_handle, b.customer_email)}
                          </p>
                          {fd?.placement && (
                            <p className="truncate text-xs text-muted-foreground">
                              {fd.placement}
                            </p>
                          )}
                        </div>
                        <StatusBadge status="pending" />
                      </Link>
                    );
                  })}
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

        {widgets.guest_spots && (
          // Used to be a Books-open/closed status card; that lives in the
          // top-bar `BooksStatusPill` now. Pivoted 2026-05-25 to upcoming
          // guest spots — most artists wanted a quick glance at their
          // travel pipeline from the dashboard, not a duplicate status.
          <Card className="space-y-4">
            <CardHeader>
              <IconChip icon={MapPin} tint="cobalt" />
              <p className="text-sm font-medium text-foreground">Guest Spots</p>
              <Link
                href="/travel"
                className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Plan
              </Link>
            </CardHeader>
            {upcomingGuestSpots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming guest spots.
              </p>
            ) : (
              <div className="space-y-1">
                {upcomingGuestSpots.map((leg) => (
                  // Row deep-links into /bookings/overview pre-filtered to this
                  // leg's parent trip — lets the artist see requests for the
                  // guest spot at a glance instead of bouncing through /travel.
                  // FilterRow keeps the active trip visible in its collapsed
                  // pill even when there are < 8 bookings.
                  <Link
                    key={leg.id}
                    href={`/bookings/overview?view=requests&trip=${leg.tripId}`}
                    className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-[color:var(--color-workspace-hover)]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {leg.icon ? (
                        <TravelIcon
                          icon={leg.icon}
                          fallback={MapPin}
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {leg.studioName ?? leg.tripTitle}
                        </p>
                        {leg.studioName && (
                          <p className="truncate text-xs text-muted-foreground">
                            {leg.tripTitle}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {leg.startsOn === leg.endsOn
                        ? formatDate(leg.startsOn)
                        : `${formatDate(leg.startsOn)} – ${formatDate(leg.endsOn)}`}
                    </p>
                  </Link>
                ))}
              </div>
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
                          {customerLabel(b.customer_handle, b.customer_email)}
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
                href="/bookings/overview?view=waitlist"
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

        {(widgets.booking_link || isZeroRequest) && profile?.slug && (
          <BookingLinkWidget publicUrl={publicUrl} waitlistUrl={waitlistUrl} />
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
        !widgets.guest_spots &&
        !widgets.upcoming_appointments &&
        !widgets.waitlist &&
        !widgets.booking_link &&
        !isZeroRequest && (
          <Card className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              All widgets are hidden.{" "}
              <Link
                href="/settings/dashboard"
                className="underline hover:text-foreground"
              >
                Show some widgets again &rarr;
              </Link>
            </p>
          </Card>
        )}
    </div>
  );
}
