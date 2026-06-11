import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { humanStatusLabel } from "@inklee/shared/status-labels";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { StatTile } from "@/components/StatTile";
import { FilterChip } from "@/components/Chip";
import { FilterToggle } from "@/components/FilterToggle";
import { PillButton } from "@/components/PillButton";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery, useInfiniteApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/components/BottomNav";
import { config } from "@/lib/config";
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
}: {
  b: MobileBookingListItem;
  onPress: () => void;
}) {
  const detail = [
    b.placement,
    b.size,
    b.preferredDate && formatShortDate(b.preferredDate),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View className="mb-2">
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
            <Text className="text-xs font-semibold text-success">
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
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!bookingUrl) return;
    await Clipboard.setStringAsync(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            {bookingUrl.replace(/^https?:\/\//, "")}
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
  const [status, setStatus] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const path = status ? `/bookings?status=${status}` : "/bookings";
  const q = useInfiniteApiQuery<MobileBookingListItem>(path);
  const stats = useApiQuery<MobileBookingStats>("/bookings/stats");
  const me = useApiQuery<MobileMe>("/me");
  const bookingUrl = me.data?.slug ? config.publicUrl(me.data.slug) : null;

  return (
    <Screen edges={["left", "right"]}>
      {/* Founder round 4: prominent big numbers for the booking pipeline.
          Sourced from /bookings/stats (NOT the widget-gated /home counts). */}
      <View className="flex-row gap-2 pt-1">
        <StatTile
          value={stats.data?.pendingCount ?? null}
          label="Pending"
          onPress={() => {
            setStatus("pending");
            setFiltersOpen(true);
          }}
        />
        <StatTile
          value={stats.data?.upcomingCount ?? null}
          label="Upcoming"
          onPress={() => router.replace("/bookings/calendar")}
        />
        <StatTile
          value={stats.data?.thisMonthCount ?? null}
          label="This month"
        />
      </View>

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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
          style={{ flexGrow: 0 }}
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

      <FlatList
        data={q.items}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <RequestCard
            b={item}
            onPress={() => router.push(`/bookings/${item.id}`)}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={() => {
              q.refresh();
              stats.refresh();
            }}
            tintColor={colors.mustard}
          />
        }
        onEndReached={q.fetchNextPage}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          q.fetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator color={colors.mustard} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          q.loading ? null : q.error ? (
            <EmptyState title="Couldn't load requests" subtitle={q.error} />
          ) : status ? (
            <EmptyState title="No requests here" subtitle="Try another filter." />
          ) : (
            <ShareZeroState bookingUrl={bookingUrl} />
          )
        }
      />
    </Screen>
  );
}
