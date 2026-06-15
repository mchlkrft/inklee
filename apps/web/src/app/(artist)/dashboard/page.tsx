import Link from "next/link";
import {
  Inbox,
  CalendarDays,
  Banknote,
  BarChart3,
  MapPin,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { parseDashboardWidgets } from "@/lib/dashboard-settings";
import { getDashboardData } from "@/lib/server/dashboard";
import { todayInTimeZone } from "@/lib/date-utils";
import { formatDate, formatLongDate } from "@/lib/format";
import { publicArtistUrl, publicHubUrl } from "@/lib/public-url";
import { pickGreeting } from "@inklee/shared/greeting";
import { Card, CardHeader, IconChip } from "@/components/ui/card";
import { TravelIcon } from "@/components/travel-icon";
import BookingLinkWidget from "./booking-link-widget";
import ActionFeed from "./action-feed";

const STAT_BOX =
  "flex flex-col rounded-[20px] border border-border p-4 transition-colors hover:bg-[color:var(--color-workspace-hover)]";

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
  const timezone = profile?.timezone ?? "Europe/Berlin";

  const data = await getDashboardData(supabase, user!.id, {
    timezone,
    widgets,
    onboardingCompleted,
  });

  // Greeting rotates once per local day (web's equivalent of the app's per-login
  // pick). Derived from the timezone-aware date key so render stays pure (no
  // Date.now()/new Date() in the component body, per the React Compiler lint).
  const today = todayInTimeZone(timezone);
  const daySeed = Number(today.replaceAll("-", ""));
  const greeting = pickGreeting(profile?.display_name, daySeed);
  const dateStr = formatLongDate(today);

  const publicUrl = publicArtistUrl(profile?.slug);
  const waitlistUrl = publicArtistUrl(profile?.slug, { subpath: "/waitlist" });
  const hubUrl = publicHubUrl(profile?.slug);

  // Brand-new artist (onboarded, no requests yet): pivot the home to the
  // share-your-link activation instead of a wall of zeros.
  const isZeroRequest =
    onboardingCompleted && !!profile?.slug && data.totalReceivedCount === 0;
  const showDeposits = data.depositsOutstandingCount > 0;

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {greeting}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{dateStr}</p>
      </div>

      {/* Setup nudges */}
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

      {/* Glance grid: hero "Requests waiting" + tappable satellites */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link
          href="/bookings"
          className="col-span-2 flex flex-col justify-between rounded-[20px] border border-brand-mustard/30 bg-brand-mustard/10 p-5 transition-transform hover:-translate-y-0.5"
        >
          <IconChip icon={Inbox} tint="mustard" />
          <div className="mt-6">
            <p className="text-5xl font-semibold tracking-tight text-foreground">
              {data.pendingCount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Requests waiting
            </p>
          </div>
        </Link>

        <Link href="/bookings/calendar" className={STAT_BOX}>
          <IconChip icon={CalendarDays} tint="rosa" size="sm" />
          <p className="mt-3 text-2xl font-semibold text-foreground">
            {data.upcomingCount}
          </p>
          <p className="text-xs text-muted-foreground">Upcoming</p>
        </Link>

        {showDeposits && (
          <Link href="/bookings/deposits" className={STAT_BOX}>
            <IconChip
              icon={Banknote}
              tint={data.depositsOverdueCount > 0 ? "rosa" : "cobalt"}
              size="sm"
            />
            <p
              className={`mt-3 text-2xl font-semibold ${
                data.depositsOverdueCount > 0
                  ? "text-destructive"
                  : "text-foreground"
              }`}
            >
              {data.depositsOutstandingCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.depositsOverdueCount > 0
                ? `Deposits due (${data.depositsOverdueCount} overdue)`
                : "Deposits due"}
            </p>
          </Link>
        )}

        <Link href="/analytics" className={STAT_BOX}>
          <IconChip icon={BarChart3} tint="bone" size="sm" />
          <p className="mt-3 text-2xl font-semibold text-foreground">
            {data.thisMonthCount}
          </p>
          <p className="text-xs text-muted-foreground">This month</p>
        </Link>
      </div>

      {/* Action required feed (or the calm caught-up / zero-request state) */}
      {data.actionItems.length > 0 ? (
        <ActionFeed items={data.actionItems} />
      ) : isZeroRequest ? (
        <BookingLinkWidget
          publicUrl={publicUrl}
          waitlistUrl={waitlistUrl}
          hubUrl={hubUrl}
        />
      ) : (
        <Card className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            You&apos;re all caught up. Nice.
          </p>
        </Card>
      )}

      {/* Ambient: guest spots */}
      {widgets.guest_spots && data.guestSpots.length > 0 && (
        <Card className="space-y-4">
          <CardHeader>
            <IconChip icon={MapPin} tint="cobalt" />
            <p className="text-sm font-medium text-foreground">Guest spots</p>
            <Link
              href="/travel"
              className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Plan
            </Link>
          </CardHeader>
          <div className="space-y-1">
            {data.guestSpots.map((leg) => (
              <Link
                key={leg.id}
                href={`/bookings/overview?view=requests&trip=${leg.tripId}`}
                className="group flex items-center justify-between gap-3 -mx-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[color:var(--color-workspace-hover)]"
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
        </Card>
      )}

      {/* Ambient: your pages (kept off the zero-request branch where it's the hero) */}
      {widgets.booking_link && !isZeroRequest && profile?.slug && (
        <BookingLinkWidget
          publicUrl={publicUrl}
          waitlistUrl={waitlistUrl}
          hubUrl={hubUrl}
        />
      )}

      {/* Insights entry (always) */}
      <Link
        href="/analytics"
        className="flex items-center justify-between rounded-[20px] border border-border px-5 py-4 transition-colors hover:bg-[color:var(--color-workspace-hover)]"
      >
        <div className="flex items-center gap-3">
          <IconChip icon={BarChart3} tint="bone" size="sm" />
          <div>
            <p className="text-sm font-medium text-foreground">Insights</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Conversion, volume, and client return rate
            </p>
          </div>
        </div>
        <span className="text-sm text-muted-foreground">&rarr;</span>
      </Link>
    </div>
  );
}
