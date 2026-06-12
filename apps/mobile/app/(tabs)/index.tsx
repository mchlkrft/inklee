import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Inbox,
  Link2,
  MapPin,
  Sparkles,
  Users,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { TopBar, useTopBarHeight } from "@/components/TopBar";
import { TravelIcon } from "@/components/TravelIcon";
import { Card } from "@/components/Card";
import { CardHeader } from "@/components/CardHeader";
import { StatusPill } from "@/components/StatusPill";
import { PillButton } from "@/components/PillButton";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { useScrollHide } from "@/lib/scroll-hide";
import { TAB_BAR_CLEARANCE } from "@/components/BottomNav";
import { config, displayUrl } from "@/lib/config";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { formatShortDate } from "@/lib/date";
import { useScreenView } from "@/lib/analytics";
import type {
  MobileHome,
  MobileHomeBooking,
  MobileGuestSpot,
} from "@inklee/shared/mobile-api";
import { DEFAULT_DASHBOARD_WIDGETS } from "@inklee/shared/dashboard-settings";

// A small right-aligned header link (View all / Calendar / Plan / View / Edit).
function HeaderLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} className="active:opacity-60">
      <Text className="text-label text-shell-dim">{label}</Text>
    </Pressable>
  );
}

function RequestRow({
  b,
  pill = false,
}: {
  b: MobileHomeBooking;
  pill?: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/bookings/${b.id}`)}
      className="mt-3 flex-row items-center gap-3 active:opacity-70"
    >
      <View className="flex-1">
        <Text className="text-body font-medium text-foreground" numberOfLines={1}>
          {b.client}
        </Text>
        <Text className="mt-0.5 text-caption text-shell-dim" numberOfLines={1}>
          {[b.placement, b.preferredDate && formatShortDate(b.preferredDate)]
            .filter(Boolean)
            .join(" · ") || "No details yet"}
        </Text>
      </View>
      {pill ? <StatusPill status="pending" /> : null}
    </Pressable>
  );
}

function GuestSpotRow({ g }: { g: MobileGuestSpot }) {
  const router = useRouter();
  const themed = useColors();
  const range =
    !g.endsOn || g.endsOn === g.startsOn
      ? formatShortDate(g.startsOn)
      : `${formatShortDate(g.startsOn)} - ${formatShortDate(g.endsOn)}`;
  return (
    <Pressable
      onPress={() => router.push(`/travel/trips/${g.tripId}`)}
      className="mt-3 flex-row items-center gap-3 active:opacity-70"
    >
      {g.icon ? (
        <TravelIcon
          icon={g.icon}
          fallback={MapPin}
          size={16}
          color={themed.cobalt}
        />
      ) : null}
      <View className="flex-1">
        <Text className="text-body font-medium text-foreground" numberOfLines={1}>
          {g.studioName ?? g.tripTitle}
        </Text>
        <Text className="mt-0.5 text-caption text-shell-dim" numberOfLines={1}>
          {g.studioName ? `${g.tripTitle} · ${range}` : range}
        </Text>
      </View>
    </Pressable>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, markCopied] = useTimedFlag();
  const copy = async () => {
    await Clipboard.setStringAsync(url);
    markCopied();
  };
  return (
    <View className="mt-3 gap-1.5">
      <Text className="text-caption text-shell-dim">{label}</Text>
      <Text className="text-sm text-shell-dim" numberOfLines={1}>
        {displayUrl(url)}
      </Text>
      <View className="flex-row gap-2">
        <PillButton label={copied ? "Copied" : "Copy link"} onPress={copy} />
        <PillButton
          label="Preview"
          onPress={() => {
            void WebBrowser.openBrowserAsync(url);
          }}
        />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  useScreenView("home");
  const router = useRouter();
  const colors = useColors();
  const onScroll = useScrollHide();
  const topBarHeight = useTopBarHeight();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<MobileHome>("/home");

  // Default to ALL widgets visible when the flags are missing (e.g. a cached
  // payload from an older API) — never an unexplained empty dashboard.
  const widgets = data?.dashboardWidgets ?? DEFAULT_DASHBOARD_WIDGETS;
  const isZeroRequest =
    !!data &&
    data.onboardingCompleted &&
    !!data.slug &&
    data.totalReceivedCount === 0;
  const showPending = !!widgets?.pending_requests;
  const showGuestSpots = !!widgets?.guest_spots;
  const showUpcoming = !!widgets?.upcoming_appointments;
  const showWaitlist = !!widgets?.waitlist && (data?.waitlistCount ?? 0) > 0;
  const showLinks = (!!widgets?.booking_link || isZeroRequest) && !!data?.slug;
  const allHidden =
    !!data &&
    !showPending &&
    !showGuestSpots &&
    !showUpcoming &&
    !widgets?.waitlist &&
    !widgets?.booking_link &&
    !isZeroRequest;

  const publicUrl = data?.slug ? config.publicUrl(data.slug) : null;
  const waitlistUrl = data?.slug ? config.waitlistUrl(data.slug) : null;

  return (
    <Screen edges={["left", "right"]} topBar={<TopBar />}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: topBarHeight,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.accent}
            progressViewOffset={topBarHeight}
          />
        }
      >
        {!data ? (
          loading ? (
            <View className="items-center justify-center py-24">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <EmptyState
              title="Couldn't load your home"
              subtitle={error ?? undefined}
            />
          )
        ) : (
          <>
            <View className="pb-1 pt-2">
              <Text className="text-display font-bold text-foreground">
                {data.displayName ?? "Home"}
              </Text>
              <Text className="text-sm text-shell-dim">Overview</Text>
            </View>

            {/* Booking status moved to the top-bar pill (tap to toggle) in
                founder round 4 — no dashboard card anymore, like the web. */}

            {/* Setup nudges */}
            {!data.onboardingCompleted ? (
              <View className="mt-3">
                <Card onPress={() => router.push("/onboarding/booking")}>
                  <CardHeader
                    icon={Sparkles}
                    tint="rosa"
                    title="Finish setting up"
                    subtitle="A couple more steps before your page is ready."
                    trailing={
                      <ChevronRight size={18} color={colors.shell.mute} />
                    }
                  />
                </Card>
              </View>
            ) : !data.bio ? (
              <View className="mt-3">
                <Card onPress={() => router.push("/settings/profile")}>
                  <CardHeader
                    icon={Sparkles}
                    tint="bone"
                    title="Add a short bio"
                    subtitle="Help clients understand your style before they book."
                    trailing={
                      <ChevronRight size={18} color={colors.shell.mute} />
                    }
                  />
                </Card>
              </View>
            ) : null}

            {/* Pending requests */}
            {showPending ? (
              <View className="mt-3">
                <Card>
                  <CardHeader
                    icon={Inbox}
                    tint="mustard"
                    title="Pending requests"
                    trailing={
                      <HeaderLink
                        label="View all"
                        onPress={() => router.navigate("/bookings")}
                      />
                    }
                  />
                  <Text className="mt-3 text-display font-bold text-foreground">
                    {data.pendingCount}
                  </Text>
                  {data.pending.length ? (
                    <>
                      {data.pending.map((b) => (
                        <RequestRow key={b.id} b={b} pill />
                      ))}
                      {data.pendingCount > data.pending.length ? (
                        <Text className="mt-3 text-caption text-shell-dim">
                          +{data.pendingCount - data.pending.length} more
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text className="mt-2 text-sm text-shell-dim">
                      No pending requests.
                    </Text>
                  )}
                </Card>
              </View>
            ) : null}

            {/* Upcoming guest spots */}
            {showGuestSpots ? (
              <View className="mt-3">
                <Card>
                  <CardHeader
                    icon={MapPin}
                    tint="cobalt"
                    title="Guest spots"
                    trailing={
                      <HeaderLink
                        label="Plan"
                        onPress={() => router.navigate("/travel")}
                      />
                    }
                  />
                  {data.guestSpots.length ? (
                    data.guestSpots.map((g) => <GuestSpotRow key={g.id} g={g} />)
                  ) : (
                    <Text className="mt-2 text-sm text-shell-dim">
                      No upcoming guest spots.
                    </Text>
                  )}
                </Card>
              </View>
            ) : null}

            {/* Upcoming appointments */}
            {showUpcoming ? (
              <View className="mt-3">
                <Card>
                  <CardHeader
                    icon={CalendarDays}
                    tint="rosa"
                    title="Upcoming"
                    trailing={
                      <HeaderLink
                        label="Calendar"
                        onPress={() => router.navigate("/bookings/calendar")}
                      />
                    }
                  />
                  {/* Big count like the pending widget (founder round 10);
                      older servers omit upcomingCount — fall back to the
                      visible list length. */}
                  <Text className="mt-3 text-display font-bold text-foreground">
                    {data.upcomingCount ?? data.upcoming.length}
                  </Text>
                  {data.upcoming.length ? (
                    <>
                      {data.upcoming.map((b) => (
                        <RequestRow key={b.id} b={b} />
                      ))}
                      {(data.upcomingCount ?? 0) > data.upcoming.length ? (
                        <Text className="mt-3 text-caption text-shell-dim">
                          +{(data.upcomingCount ?? 0) - data.upcoming.length}{" "}
                          more
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text className="mt-2 text-sm text-shell-dim">
                      No upcoming appointments.
                    </Text>
                  )}
                </Card>
              </View>
            ) : null}

            {/* Waitlist (hidden at zero, like web) */}
            {showWaitlist ? (
              <View className="mt-3">
                <Card onPress={() => router.push("/waitlist")}>
                  <CardHeader
                    icon={Users}
                    tint="cobalt"
                    title="Waitlist"
                    trailing={
                      <HeaderLink
                        label="View"
                        onPress={() => router.push("/waitlist")}
                      />
                    }
                  />
                  <Text className="mt-3 text-display font-bold text-foreground">
                    {data.waitlistCount}
                  </Text>
                  <Text className="text-caption text-shell-dim">
                    {data.waitlistCount === 1 ? "Person" : "People"} waiting
                  </Text>
                </Card>
              </View>
            ) : null}

            {/* Your links */}
            {showLinks && publicUrl && waitlistUrl ? (
              <View className="mt-3">
                <Card>
                  <CardHeader
                    icon={Link2}
                    tint="bone"
                    title="Your links"
                    trailing={
                      <HeaderLink
                        label="Edit"
                        onPress={() => router.push("/settings/books")}
                      />
                    }
                  />
                  <LinkRow label="Booking link" url={publicUrl} />
                  <LinkRow label="Waitlist link" url={waitlistUrl} />
                </Card>
              </View>
            ) : null}

            {/* Analytics entry (always, like web) */}
            <View className="mt-3">
              <Card onPress={() => router.push("/insights")}>
                <CardHeader
                  icon={BarChart3}
                  tint="bone"
                  title="Insights"
                  subtitle="Conversion, volume, and client return rate"
                  trailing={<ChevronRight size={18} color={colors.shell.mute} />}
                />
              </Card>
            </View>

            {allHidden ? (
              <View className="mt-3">
                <Card onPress={() => router.push("/settings/dashboard")}>
                  <Text className="text-center text-sm text-shell-dim">
                    All widgets are hidden. Tap to choose what shows here.
                  </Text>
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
