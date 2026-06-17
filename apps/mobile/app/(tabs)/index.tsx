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
  Banknote,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Inbox,
  Link2,
  MapPin,
  Sparkles,
} from "lucide-react-native";
import type { LucideIcon } from "@/lib/icon-types";
import { Screen } from "@/components/Screen";
import { TopBar, useTopBarHeight } from "@/components/TopBar";
import { TravelIcon } from "@/components/TravelIcon";
import { Card } from "@/components/Card";
import { CardHeader } from "@/components/CardHeader";
import { IconButton } from "@/components/IconButton";
import { EmptyState } from "@/components/EmptyState";
import { ActionFeed } from "@/components/home/ActionFeed";
import { useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { useScrollHide } from "@/lib/scroll-hide";
import { TAB_BAR_CLEARANCE } from "@/components/BottomNav";
import { config, displayUrl } from "@/lib/config";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { formatShortDate } from "@/lib/date";
import { useScreenView } from "@/lib/analytics";
import { pickGreeting } from "@inklee/shared/greeting";
import type { MobileHome, MobileGuestSpot } from "@inklee/shared/mobile-api";
import { DEFAULT_DASHBOARD_WIDGETS } from "@inklee/shared/dashboard-settings";

// Greeting seed is fixed once per JS launch (≈ per login), so the rotating line
// is stable within a session and fresh next launch.
const GREETING_SEED = Math.floor(Math.random() * 100_000);

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

// The "glance" widgets (the hero Requests card + its stat satellites) are
// fixed-color brand chips in BOTH themes per the dashboard redesign: a solid
// mustard hero and cream stat chips that pop off the page in light or dark.
// Their content colors are therefore theme-INDEPENDENT (charcoal on the brand
// fill) — text-foreground would read bone and vanish on the cream chip in dark
// mode, so these are not the themed tokens.
const CHIP_CREAM = "#d9d4c7"; // stat-chip fill (the light-theme card cream)
const CHIP_BORDER = "rgba(30,30,30,0.18)"; // matches the app-standard card border so the cream chip reads on bone
const ON_CHIP_FG = "#1e1e1e"; // charcoal text / icon on mustard or cream
const ON_CHIP_DIM = "rgba(30,30,30,0.72)"; // muted label on the chips (clears AA at 12px on cream)
const ON_CHIP_DANGER = "#a61f1d"; // readable dark red on cream (overdue)

function HeaderLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} className="active:opacity-60">
      <Text className="text-label text-shell-dim">{label}</Text>
    </Pressable>
  );
}

// One tappable glance satellite (Upcoming / Deposits due / This month).
function StatBox({
  icon: Icon,
  value,
  label,
  onPress,
  danger = false,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: CHIP_CREAM, borderColor: CHIP_BORDER }}
      className="flex-1 rounded-card border-brand p-4 active:opacity-80"
    >
      <Icon size={18} color={danger ? ON_CHIP_DANGER : ON_CHIP_FG} />
      <Text
        className="mt-2 text-xl font-bold"
        style={{ color: danger ? ON_CHIP_DANGER : ON_CHIP_FG }}
      >
        {value}
      </Text>
      <Text className="text-caption" style={{ color: ON_CHIP_DIM }} numberOfLines={1}>
        {label}
      </Text>
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
        <TravelIcon icon={g.icon} fallback={MapPin} size={16} color={themed.cobalt} />
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

// One page row: label + URL on the left, compact outlined icon actions (copy +
// preview) pinned right. Mirrors the Action-required row structure but swaps the
// text verbs for symbols so the two cards stay visually distinct.
function LinkRow({
  label,
  url,
  last = false,
}: {
  label: string;
  url: string;
  last?: boolean;
}) {
  const themed = useColors();
  const [copied, markCopied] = useTimedFlag();
  const copy = async () => {
    await Clipboard.setStringAsync(url);
    markCopied();
  };
  return (
    <View
      className={`flex-row items-center gap-3 py-3 ${last ? "" : "border-b border-shell-border"}`}
    >
      <View className="flex-1">
        <Text className="text-body font-medium text-foreground" numberOfLines={1}>
          {label}
        </Text>
        <Text className="mt-0.5 text-caption text-shell-dim" numberOfLines={1}>
          {displayUrl(url)}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? "Copied" : `Copy ${label} link`}
          outlined
          iconSize={16}
          color={copied ? themed.successFg : themed.bone}
          onPress={copy}
        />
        <IconButton
          icon={ExternalLink}
          label={`Preview ${label}`}
          outlined
          iconSize={16}
          onPress={() => {
            void WebBrowser.openBrowserAsync(url);
          }}
        />
      </View>
    </View>
  );
}

function PagesCard({
  publicUrl,
  waitlistUrl,
  hubUrl,
}: {
  publicUrl: string;
  waitlistUrl: string;
  hubUrl: string;
}) {
  return (
    <Card>
      <CardHeader icon={Link2} tint="bone" title="Your pages" />
      <View className="mt-1">
        <LinkRow label="Booking" url={publicUrl} />
        <LinkRow label="Waitlist" url={waitlistUrl} />
        <LinkRow label="Link Hub" url={hubUrl} last />
      </View>
    </Card>
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

  const widgets = data?.dashboardWidgets ?? DEFAULT_DASHBOARD_WIDGETS;
  const isZeroRequest =
    !!data &&
    data.onboardingCompleted &&
    !!data.slug &&
    data.totalReceivedCount === 0;
  const actionItems = data?.actionItems ?? [];
  const overdueDeposits = data?.depositsOverdueCount ?? 0;
  const showDeposits = (data?.depositsOutstandingCount ?? 0) > 0;
  const showGuestSpots = !!widgets?.guest_spots && (data?.guestSpots.length ?? 0) > 0;
  const showPages = (!!widgets?.booking_link || isZeroRequest) && !!data?.slug;

  const publicUrl = data?.slug ? config.publicUrl(data.slug) : null;
  const waitlistUrl = data?.slug ? config.waitlistUrl(data.slug) : null;
  const hubUrl = data?.slug ? config.hubUrl(data.slug) : null;
  const hasPages = !!publicUrl && !!waitlistUrl && !!hubUrl;

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
            {/* Greeting */}
            <View className="pb-1 pt-2">
              <Text className="text-display font-bold text-foreground">
                {pickGreeting(data.displayName, GREETING_SEED)}
              </Text>
              <Text className="text-sm text-shell-dim">
                {DATE_FMT.format(new Date())}
              </Text>
            </View>

            {/* Setup nudges */}
            {!data.onboardingCompleted ? (
              <View className="mt-3">
                <Card onPress={() => router.push("/onboarding/booking")}>
                  <CardHeader
                    icon={Sparkles}
                    tint="rosa"
                    title="Finish setting up"
                    subtitle="A couple more steps before your page is ready."
                    trailing={<ChevronRight size={18} color={colors.shell.mute} />}
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
                    trailing={<ChevronRight size={18} color={colors.shell.mute} />}
                  />
                </Card>
              </View>
            ) : null}

            {/* Glance grid: hero Requests waiting + tappable satellites */}
            <View className="mt-3">
              <Pressable
                onPress={() => router.navigate("/bookings")}
                className="rounded-card bg-mustard p-5 active:opacity-90"
              >
                <Inbox size={22} color={ON_CHIP_FG} />
                <Text
                  className="mt-6 text-display font-bold"
                  style={{ color: ON_CHIP_FG }}
                >
                  {data.pendingCount}
                </Text>
                <Text className="text-sm" style={{ color: ON_CHIP_DIM }}>
                  Requests waiting
                </Text>
              </Pressable>
              <View className="mt-3 flex-row gap-3">
                <StatBox
                  icon={CalendarDays}
                  value={data.upcomingCount ?? 0}
                  label="Upcoming"
                  onPress={() => router.navigate("/bookings/calendar")}
                />
                {showDeposits ? (
                  <StatBox
                    icon={Banknote}
                    value={data.depositsOutstandingCount ?? 0}
                    label={
                      overdueDeposits > 0
                        ? `Deposits (${overdueDeposits} overdue)`
                        : "Deposits due"
                    }
                    danger={overdueDeposits > 0}
                    onPress={() => router.push("/bookings/deposits")}
                  />
                ) : null}
                <StatBox
                  icon={BarChart3}
                  value={data.thisMonthCount ?? 0}
                  label="This month"
                  onPress={() => router.push("/insights")}
                />
              </View>
            </View>

            {/* Action required feed (or caught-up / zero-request pivot) */}
            <View className="mt-3">
              {actionItems.length > 0 ? (
                <ActionFeed items={actionItems} />
              ) : isZeroRequest && hasPages ? (
                <PagesCard
                  publicUrl={publicUrl!}
                  waitlistUrl={waitlistUrl!}
                  hubUrl={hubUrl!}
                />
              ) : (
                <Card>
                  <Text className="py-2 text-center text-sm text-shell-dim">
                    You&apos;re all caught up. Nice.
                  </Text>
                </Card>
              )}
            </View>

            {/* Ambient: guest spots */}
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
                  {data.guestSpots.map((g) => (
                    <GuestSpotRow key={g.id} g={g} />
                  ))}
                </Card>
              </View>
            ) : null}

            {/* Ambient: your pages (the zero-request branch already shows it above) */}
            {showPages && !isZeroRequest && hasPages ? (
              <View className="mt-3">
                <PagesCard
                  publicUrl={publicUrl!}
                  waitlistUrl={waitlistUrl!}
                  hubUrl={hubUrl!}
                />
              </View>
            ) : null}

            {/* Insights entry (always) */}
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
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
