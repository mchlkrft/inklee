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
import { colors } from "@/lib/tokens";
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
        <View className="mb-1.5 flex-row items-center justify-between">
          <View className="flex-1 pr-2">
            <Text className="text-base font-semibold text-foreground">{label}</Text>
            {showEmail ? (
              <Text className="text-sm text-shell-dim">{item.email}</Text>
            ) : null}
          </View>
          <StatusPill status={item.latestStatus} />
        </View>
        <Text className="text-sm text-shell-dim">
          {item.bookingCount} booking{item.bookingCount === 1 ? "" : "s"}
        </Text>
        <Text className="mt-1 text-xs text-shell-mute">
          {relativeTime(item.lastBookingAt)}
        </Text>
      </Card>
    </View>
  );
}

export default function ClientsScreen() {
  useScreenView("clients");
  const router = useRouter();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<{ items: ClientListItem[] }>("/clients");
  const [query, setQuery] = useState("");

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.handle.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <Screen edges={["left", "right"]}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by handle or email"
        placeholderTextColor="rgba(229,225,213,0.32)"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search clients"
        className="mb-3 h-12 rounded-xl border border-shell-border px-4 text-foreground"
      />
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
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.mustard}
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
