import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import type { ClientDetail, ClientHistoryItem } from "@/lib/clients";
import { formatShortDate, relativeTime } from "@/lib/date";
import { colors } from "@/lib/tokens";

export default function ClientDetailScreen() {
  // Expo Router decodes the path segment, so `email` is the raw address; we
  // re-encode it for the API path (the server decodes once).
  const { email: param } = useLocalSearchParams<{ email: string }>();
  const email = param ?? "";
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<ClientDetail>(`/clients/${encodeURIComponent(email)}`);

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-5">
        {loading ? (
          <ActivityIndicator color={colors.mustard} />
        ) : (
          <View className="items-center">
            <EmptyState
              title="Couldn't load client"
              subtitle={error ?? undefined}
            />
            <Pressable
              accessibilityRole="button"
              onPress={refresh}
              className="mt-2 h-11 items-center justify-center rounded-xl border border-shell-border px-5 active:opacity-80"
            >
              <Text className="text-sm font-semibold text-foreground">Try again</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  const approved = data.history.filter((h) => h.status === "approved").length;
  // Avoid repeating the email when it's already the display label.
  const showEmail = data.client !== data.email;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.mustard}
        />
      }
    >
      <Text className="text-2xl font-bold text-foreground">{data.client}</Text>
      {showEmail ? (
        <Text className="mt-0.5 text-sm text-shell-dim">{data.email}</Text>
      ) : null}
      <Text className="mt-1 text-xs text-shell-mute">
        {data.bookingCount} booking{data.bookingCount === 1 ? "" : "s"} ·{" "}
        {approved} approved
      </Text>

      {data.notes && data.notes.trim() ? (
        <View className="mt-6">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-shell-mute">
            Notes (private)
          </Text>
          <Card>
            <Text className="text-sm text-foreground">{data.notes}</Text>
          </Card>
        </View>
      ) : null}

      <View className="mt-6">
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-shell-mute">
          Booking history
        </Text>
        <View className="gap-2">
          {data.history.map((h) => (
            <HistoryRow key={h.id} item={h} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function HistoryRow({ item }: { item: ClientHistoryItem }) {
  const router = useRouter();
  const dateLabel = item.preferredDate
    ? formatShortDate(item.preferredDate)
    : "No date";

  return (
    <Card onPress={() => router.push(`/bookings/${item.id}`)}>
      <View className="mb-1 flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-base font-semibold text-foreground">
          {item.placement ?? "Tattoo request"}
        </Text>
        <StatusPill status={item.status} />
      </View>
      {item.size ? (
        <Text className="text-sm text-shell-dim">{item.size}</Text>
      ) : null}
      <Text className="mt-0.5 text-xs text-shell-mute">
        {dateLabel} · submitted {relativeTime(item.createdAt)}
      </Text>
    </Card>
  );
}
