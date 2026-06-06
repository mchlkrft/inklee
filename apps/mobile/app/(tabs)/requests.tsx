import { FlatList, RefreshControl, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import { colors } from "@/lib/tokens";

type BookingItem = {
  id: string;
  status: string;
  client: string;
  placement: string | null;
  size: string | null;
  preferredDate: string | null;
  createdAt: string;
  depositAmount: number | null;
  depositCurrency: string;
  depositPaid: boolean;
};

type BookingsPage = {
  items: BookingItem[];
  nextCursor: string | null;
};

function RequestCard({ b }: { b: BookingItem }) {
  const detail = [b.placement, b.size, b.preferredDate]
    .filter(Boolean)
    .join(" · ");
  return (
    <View className="mb-2">
      <Card>
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
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<BookingsPage>("/bookings");

  return (
    <Screen>
      <Text className="py-2 text-2xl font-bold text-bone">Requests</Text>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <RequestCard b={item} />}
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
