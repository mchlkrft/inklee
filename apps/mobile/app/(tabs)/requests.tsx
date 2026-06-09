import { FlatList, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import { colors } from "@/lib/tokens";
import { useScreenView } from "@/lib/analytics";
import type {
  MobileBookingListItem,
  MobileBookingsPage,
} from "@inklee/shared/mobile-api";

function RequestCard({
  b,
  onPress,
}: {
  b: MobileBookingListItem;
  onPress: () => void;
}) {
  const detail = [b.placement, b.size, b.preferredDate]
    .filter(Boolean)
    .join(" · ");
  return (
    <View className="mb-2">
      <Card onPress={onPress}>
        <View className="mb-1.5 flex-row items-center justify-between">
          <Text className="flex-1 pr-2 text-base font-semibold text-bone">
            {b.client}
          </Text>
          <StatusPill status={b.status} />
        </View>
        <Text className="text-sm text-shell-dim">
          {detail || "No details provided"}
        </Text>
        {b.depositPaid ? (
          <Text className="mt-1 text-xs font-semibold text-success">
            Deposit paid
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

export default function RequestsScreen() {
  useScreenView("requests");
  const router = useRouter();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<MobileBookingsPage>("/bookings");

  return (
    <Screen>
      <Text className="py-2 text-2xl font-bold text-bone">Requests</Text>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <RequestCard
            b={item}
            onPress={() => router.push(`/bookings/${item.id}`)}
          />
        )}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.mustard}
          />
        }
        ListEmptyComponent={
          loading ? null : error ? (
            <EmptyState title="Couldn't load requests" subtitle={error} />
          ) : (
            <EmptyState
              title="No requests yet"
              subtitle="New booking requests will show up here."
            />
          )
        }
      />
    </Screen>
  );
}
