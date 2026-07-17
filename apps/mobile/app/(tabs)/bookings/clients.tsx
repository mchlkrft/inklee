import { useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { customerLabel } from "@inklee/shared/booking-domain";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import type { ClientListItem } from "@/lib/clients";
import { relativeTime } from "@/lib/date";
import { useColors } from "@/lib/theme";
import { useScrollHide } from "@/lib/scroll-hide";
import { useBookingsHeaderInset } from "@/lib/bookings-header";
import { useTabBarClearance } from "@/lib/layout";
import { useScreenView } from "@/lib/analytics";

function ClientRow({
  item,
  onPress,
}: {
  item: ClientListItem;
  onPress: () => void;
}) {
  const label = customerLabel(item.handle, item.email);
  // Show the email as a subline only when the primary label is the @handle.
  const showEmail = item.handle.trim().length > 0;
  return (
    <View className="mb-2">
      <Card onPress={onPress}>
        {/* Founder round 5: list rows read at a glance — 18/16/14 hierarchy
            (the round-2 readability standard the client list never got). */}
        <View className="mb-1.5 flex-row items-center justify-between">
          <View className="flex-1 pr-2">
            <Text className="text-lg font-semibold text-foreground">{label}</Text>
            {showEmail ? (
              <Text className="text-base text-shell-dim">{item.email}</Text>
            ) : null}
          </View>
          <StatusPill status={item.latestStatus} />
        </View>
        <Text className="text-base text-shell-dim">
          {item.bookingCount} booking{item.bookingCount === 1 ? "" : "s"}
        </Text>
        <Text className="mt-1 text-sm text-shell-dim">
          {relativeTime(item.lastBookingAt)}
        </Text>
      </Card>
    </View>
  );
}

export default function ClientsScreen() {
  useScreenView("clients");
  const router = useRouter();
  const themed = useColors();
  const onScroll = useScrollHide();
  const headerInset = useBookingsHeaderInset();
  const tabBarClearance = useTabBarClearance();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<{ items: ClientListItem[] }>("/clients");
  const [query, setQuery] = useState("");

  // Memoized so the `?? []` fallback doesn't mint a new array every render
  // and invalidate the filter memo below (react-hooks/exhaustive-deps).
  const items = useMemo(() => data?.items ?? [], [data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.handle.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Search + count scroll WITH the list (ListHeaderComponent) so the
  // scroll-hiding TopBar and the rising bookings band reclaim space
  // (founder round 8).
  const listHeader = (
    <>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by handle or email"
        placeholderTextColor={themed.shell.mute}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search clients"
        className="mb-3 h-12 rounded-xl border border-shell-border px-4 text-base text-foreground"
      />
      {items.length > 0 ? (
        <Text className="mb-2 text-sm text-shell-mute">
          {items.length} unique customer{items.length === 1 ? "" : "s"}
        </Text>
      ) : null}
    </>
  );

  return (
    <Screen edges={["left", "right"]}>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.email}
        renderItem={({ item }) => (
          <ClientRow
            item={item}
            onPress={() =>
              router.push(`/clients/${encodeURIComponent(item.email)}`)
            }
          />
        )}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingTop: headerInset,
          paddingBottom: tabBarClearance,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={themed.accent}
            progressViewOffset={headerInset}
          />
        }
        ListEmptyComponent={
          loading ? null : error ? (
            <EmptyState title="Couldn't load clients" subtitle={error} />
          ) : items.length === 0 ? (
            <EmptyState
              title="No clients yet"
              subtitle="People who book with you will be collected here."
            />
          ) : (
            <EmptyState title="No clients match." />
          )
        }
      />
    </Screen>
  );
}
