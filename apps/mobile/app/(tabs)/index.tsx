import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { BooksToggle } from "@/components/BooksToggle";
import { useApiQuery } from "@/lib/api";
import { colors } from "@/lib/tokens";
import { useScreenView } from "@/lib/analytics";
import type {
  MobileHome,
  MobileHomeBooking,
} from "@inklee/shared/mobile-api";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="flex-1">
      <Text className="text-2xl font-bold text-mustard">{value}</Text>
      <Text className="text-xs text-shell-dim">{label}</Text>
    </View>
  );
}

function BookingRow({ b }: { b: MobileHomeBooking }) {
  return (
    <View className="mb-2">
      <Card>
        <Text className="text-base font-semibold text-bone">{b.client}</Text>
        <Text className="mt-0.5 text-sm text-shell-dim">
          {[b.placement, b.preferredDate].filter(Boolean).join(" · ") ||
            "No details yet"}
        </Text>
      </Card>
    </View>
  );
}

export default function HomeScreen() {
  useScreenView("home");
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<MobileHome>("/home");

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.mustard}
          />
        }
      >
        <Text className="pt-2 text-2xl font-bold text-bone">
          {data?.displayName ? `Hi, ${data.displayName}` : "Home"}
        </Text>
        {data ? (
          <View className="mb-5 mt-3">
            <BooksToggle open={data.booksOpen} />
          </View>
        ) : (
          <Text className="mb-5 mt-1 text-sm text-shell-dim">
            {loading ? "Loading…" : ""}
          </Text>
        )}

        {error ? (
          <EmptyState title="Couldn't load your home" subtitle={error} />
        ) : null}

        {data ? (
          <>
            <Card>
              <View className="flex-row">
                <Stat label="Pending" value={data.pendingCount} />
                <Stat label="Waitlist" value={data.waitlistCount} />
              </View>
            </Card>

            <Text className="mb-2 mt-6 text-base font-semibold text-bone">
              Needs a reply
            </Text>
            {data.pending.length ? (
              data.pending.map((b) => <BookingRow key={b.id} b={b} />)
            ) : (
              <EmptyState title="No pending requests" />
            )}

            <Text className="mb-2 mt-6 text-base font-semibold text-bone">
              Upcoming
            </Text>
            {data.upcoming.length ? (
              data.upcoming.map((b) => <BookingRow key={b.id} b={b} />)
            ) : (
              <EmptyState title="Nothing on the books yet" />
            )}
            <View className="h-8" />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
