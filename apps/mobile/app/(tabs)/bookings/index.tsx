import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { MapPin, X } from "lucide-react-native";
import { humanStatusLabel } from "@inklee/shared/status-labels";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { StatTile } from "@/components/StatTile";
import { FilterChip } from "@/components/Chip";
import { FilterToggle } from "@/components/FilterToggle";
import { PillButton } from "@/components/PillButton";
import { EmptyState } from "@/components/EmptyState";
import { BookingDetailContent } from "@/components/booking/BookingDetailContent";
import { ListDetailHost } from "@/components/layout/ListDetailHost";
import { useApiQuery, useInfiniteApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { useScrollHide } from "@/lib/scroll-hide";
import { useBookingsHeaderInset } from "@/lib/bookings-header";
import {
  useIsExpanded,
  useTabBarClearance,
  useWindowClassTransition,
} from "@/lib/layout";
import { config, displayUrl } from "@/lib/config";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { formatShortDate, relativeTime } from "@/lib/date";
import { useScreenView } from "@/lib/analytics";
import type {
  MobileBookingListItem,
  MobileBookingStats,
  MobileMe,
} from "@inklee/shared/mobile-api";

// Mirrors the web status filter set (ALLOWED_STATUS on the server). `null` = All.
const FILTERS: (string | null)[] = [
  null,
  "pending",
  "approved",
  "deposit_pending",
  "rejected",
  "cancelled",
];

function RequestCard({
  b,
  onPress,
  selected = false,
}: {
  b: MobileBookingListItem;
  onPress: () => void;
  /** Pane-selection highlight (expanded window class only). */
  selected?: boolean;
}) {
  const detail = [
    b.placement,
    b.size,
    b.preferredDate && formatShortDate(b.preferredDate),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View
      className={
        selected ? "mb-2 rounded-[22px] border-2 border-accent" : "mb-2"
      }
    >
      <Card onPress={onPress}>
        <View className="mb-1.5 flex-row items-center justify-between">
          <Text className="flex-1 pr-2 text-base font-semibold text-foreground">
            {b.client}
          </Text>
          <StatusPill status={b.status} />
        </View>
        <Text className="text-sm text-shell-dim">
          {detail || "No details provided"}
        </Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          <Text className="text-xs text-shell-mute">
            {relativeTime(b.createdAt)}
          </Text>
          {b.depositPaid ? (
            <Text className="text-xs font-semibold text-success-fg">
              · Deposit paid
            </Text>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

// Empty inbox: nudge the artist to share their booking link (the way requests
// actually start). Copy via expo-clipboard, Preview via the in-app browser.
function ShareZeroState({ bookingUrl }: { bookingUrl: string | null }) {
  const [copied, markCopied] = useTimedFlag();
  const copy = async () => {
    if (!bookingUrl) return;
    await Clipboard.setStringAsync(bookingUrl);
    markCopied();
  };
  return (
    <View className="items-center px-2 py-16">
      <Text className="text-center text-base font-semibold text-foreground">
        No requests yet
      </Text>
      <Text className="mt-1 text-center text-sm text-shell-dim">
        Share your booking link to start getting requests.
      </Text>
      {bookingUrl ? (
        <>
          <Text className="mt-4 text-center text-sm text-shell-dim">
            {displayUrl(bookingUrl)}
          </Text>
          <View className="mt-2 flex-row gap-2">
            <PillButton label={copied ? "Copied" : "Copy link"} onPress={copy} />
            <PillButton
              label="Preview"
              onPress={() => {
                void WebBrowser.openBrowserAsync(bookingUrl);
              }}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

export default function RequestsScreen() {
  useScreenView("requests");
  const router = useRouter();
  const colors = useColors();
  const onScroll = useScrollHide();
  const headerInset = useBookingsHeaderInset();
  const tabBarClearance = useTabBarClearance();
  const [status, setStatus] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const expanded = useIsExpanded();

  // Trip filter arrives as a route param (the dashboard guest-spot row deep-links
  // here). We read it once into local state and immediately clear the param, so
  // re-opening the Bookings tab later from the nav doesn't resurrect a stale
  // filter — but navigating from a guest spot again re-applies it.
  //
  // `selected` (ME-15) is the expanded-class detail-pane selection. Unlike
  // tripId it is NOT read-and-cleared: it persists on the route so the
  // shrink-to-compact transition (Rule B below) can promote it to a pushed
  // route, and so re-renders keep the pane stable. Detail routes redirect here
  // with it at expanded (Rule A in app/bookings/[id].tsx).
  const params = useLocalSearchParams<{
    tripId?: string;
    tripTitle?: string;
    selected?: string;
  }>();
  const selected = params.selected || null;

  // Rule B: pane selection + window shrinks out of expanded -> the selection
  // becomes a normal pushed detail screen (native back header), so the artist
  // keeps their context. Fires once per class flip, never mid-drag.
  useWindowClassTransition((prev, next) => {
    if (prev === "expanded" && next !== "expanded" && selected) {
      router.setParams({ selected: "" });
      router.push(`/bookings/${selected}`);
    }
  });
  // Lazy init covers the fresh-mount deep link (filter applied on first render,
  // no wasted unfiltered fetch); the effect covers re-navigation when the tab is
  // already mounted. Both consume the param so it can't get stuck.
  const [trip, setTrip] = useState<{ id: string; title: string } | null>(() =>
    params.tripId
      ? { id: params.tripId, title: params.tripTitle || "this trip" }
      : null,
  );
  useEffect(() => {
    if (params.tripId) {
      setTrip({ id: params.tripId, title: params.tripTitle || "this trip" });
      router.setParams({ tripId: "", tripTitle: "" });
    }
  }, [params.tripId, params.tripTitle, router]);

  const queryParts: string[] = [];
  if (status) queryParts.push(`status=${status}`);
  if (trip) queryParts.push(`tripId=${encodeURIComponent(trip.id)}`);
  const path = queryParts.length ? `/bookings?${queryParts.join("&")}` : "/bookings";
  const q = useInfiniteApiQuery<MobileBookingListItem>(path);
  const stats = useApiQuery<MobileBookingStats>("/bookings/stats");
  const me = useApiQuery<MobileMe>("/me");
  const bookingUrl = me.data?.slug ? config.publicUrl(me.data.slug) : null;

  // Stats + filter scroll WITH the list (ListHeaderComponent, the flash-tab
  // idiom) so the scroll-hiding TopBar and the rising bookings band actually
  // reclaim space (founder round 8).
  const listHeader = (
    <>
      {/* Trip filter banner: shown when the artist arrived from a dashboard guest
          spot. Names the trip and offers a one-tap way back to the full inbox. */}
      {trip ? (
        <View className="mt-1 flex-row items-center gap-2 rounded-card border-brand border-shell-border bg-shell-hover px-4 py-2.5">
          <MapPin size={16} color={colors.accent} />
          <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
            Showing {trip.title}
          </Text>
          <Pressable
            onPress={() => setTrip(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear trip filter"
            className="flex-row items-center gap-1 active:opacity-70"
          >
            <Text className="text-sm font-medium text-accent">Clear</Text>
            <X size={16} color={colors.accent} />
          </Pressable>
        </View>
      ) : null}

      {/* Founder round 4: prominent big numbers for the booking pipeline.
          Sourced from /bookings/stats (NOT the widget-gated /home counts).
          While the filter strip is open the tiles compact into one-liners
          ("26 pending") to win the header height back (founder round 8).
          Hidden while a trip filter is active: the stats are whole-pipeline
          totals and would contradict the trip-scoped list below. */}
      {trip ? null : (
        <View className="flex-row gap-2 pt-1">
          <StatTile
            value={stats.data?.pendingCount ?? null}
            label="Pending"
            compact={filtersOpen}
            onPress={() => {
              setStatus("pending");
              setFiltersOpen(true);
            }}
          />
          <StatTile
            value={stats.data?.upcomingCount ?? null}
            label="Upcoming"
            compact={filtersOpen}
            onPress={() => router.replace("/bookings/calendar")}
          />
          <StatTile
            value={stats.data?.thisMonthCount ?? null}
            label="This month"
            compact={filtersOpen}
          />
        </View>
      )}

      {/* Collapsed-by-default status filter (web filter-row parity): a single
          Filter pill that reveals the chip strip; the active status stays
          legible on the pill while collapsed. */}
      <View className="flex-row items-center py-2.5">
        <FilterToggle
          open={filtersOpen}
          onToggle={() => setFiltersOpen((v) => !v)}
          activeCount={status ? 1 : 0}
          activeLabel={status ? humanStatusLabel(status) : null}
        />
      </View>
      {filtersOpen ? (
        // Screen's px-5 is 17.5px (NativeWind inlines rem=14, not 16), so the
        // -20/+20 margin/padding pair over-cancels by 2.5px offscreen and
        // restores the same 17.5px content inset; scrolling chips clip at the
        // physical screen edge, not mid-screen.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: 8,
            paddingBottom: 10,
            paddingHorizontal: 20,
          }}
          style={{ flexGrow: 0, flexShrink: 0, marginHorizontal: -20 }}
        >
          {FILTERS.map((f) => (
            <FilterChip
              key={f ?? "all"}
              label={f === null ? "All" : humanStatusLabel(f)}
              selected={status === f}
              onPress={() => setStatus(f)}
            />
          ))}
        </ScrollView>
      ) : null}
    </>
  );

  const list = (
      <FlatList
        data={q.items}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <RequestCard
            b={item}
            selected={expanded && selected === item.id}
            onPress={() =>
              expanded
                ? router.setParams({ selected: item.id })
                : router.push(`/bookings/${item.id}`)
            }
          />
        )}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        // Full-bleed list (the same -20/+20 over-cancel as the chips strip) so
        // the strip's negative margin isn't clipped at the list bounds and the
        // chips still clip at the physical screen edge.
        style={{ marginHorizontal: -20 }}
        contentContainerStyle={{
          paddingTop: headerInset,
          paddingBottom: tabBarClearance,
          paddingHorizontal: 20,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={() => {
              q.refresh();
              stats.refresh();
            }}
            tintColor={colors.accent}
            progressViewOffset={headerInset}
          />
        }
        onEndReached={q.fetchNextPage}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          q.fetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          q.loading ? null : q.error ? (
            <EmptyState title="Couldn't load requests" subtitle={q.error} />
          ) : trip ? (
            <EmptyState
              title="No bookings for this trip yet"
              subtitle={
                status
                  ? "Try another status filter."
                  : "Requests clients place for this trip will show up here."
              }
            />
          ) : status ? (
            <EmptyState title="No requests here" subtitle="Try another filter." />
          ) : (
            <ShareZeroState bookingUrl={bookingUrl} />
          )
        }
      />
  );

  return (
    <Screen edges={["left", "right"]}>
      {expanded ? (
        <ListDetailHost
          list={list}
          detail={
            selected ? (
              // Keyed by the selection: fresh scroll + local state per request.
              <BookingDetailContent key={selected} id={selected} />
            ) : null
          }
          empty={
            <EmptyState
              title="Select a request"
              subtitle="Choose a request from the list to see its details."
            />
          }
          onClose={() => router.setParams({ selected: "" })}
        />
      ) : (
        list
      )}
    </Screen>
  );
}
