import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MapPin } from "lucide-react-native";
import type { MobileTrip, MobileTripsResponse } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { TopBar, useTopBarHeight } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { TravelIcon } from "@/components/TravelIcon";
import { BrandLoader } from "@/components/BrandLoader";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { NavCardRow } from "@/components/NavCardRow";
import { useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { useScrollHide } from "@/lib/scroll-hide";
import { TAB_BAR_CLEARANCE } from "@/components/BottomNav";

const ListGap = () => <View className="h-3" />;

export default function TripsList() {
  const router = useRouter();
  const q = useApiQuery<MobileTripsResponse>("/travel/trips");
  const colors = useColors();
  const onScroll = useScrollHide();
  const topBarHeight = useTopBarHeight();

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]} topBar={<TopBar />}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <BrandLoader />
          ) : (
            <ErrorState
              title="Couldn't load trips"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  // Header scrolls WITH the list so the overlay TopBar reclaims its space.
  const listHeader = (
    <>
      <PageHeader title="Guest Spots" icon={MapPin} iconRole="cobalt" />
      <View className="gap-2 py-3">
        <Button
          label="New trip"
          onPress={() => router.push("/travel/trips/new")}
        />
        <NavCardRow
          icon="business-outline"
          label="Studios"
          onPress={() => router.push("/travel/studios")}
        />
      </View>
    </>
  );

  return (
    <Screen edges={["left", "right"]} topBar={<TopBar />}>
      <View className="flex-1">
        <FlatList
          data={q.data.items}
          keyExtractor={(t) => t.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{
            paddingTop: topBarHeight,
            paddingBottom: TAB_BAR_CLEARANCE,
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={q.refreshing}
              onRefresh={q.refresh}
              tintColor={colors.accent}
              progressViewOffset={topBarHeight}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No trips yet"
              subtitle="Add a trip with date stops to show your guest spots on your booking page."
            />
          }
          ItemSeparatorComponent={ListGap}
          renderItem={({ item }) => (
            <TripRow
              trip={item}
              onPress={() => router.push(`/travel/trips/${item.id}`)}
            />
          )}
        />
      </View>
    </Screen>
  );
}

function TripRow({ trip, onPress }: { trip: MobileTrip; onPress: () => void }) {
  const themed = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-2xl border border-shell-border bg-glass p-4 active:opacity-80"
    >
      <View className="flex-row items-center justify-between">
        {trip.icon ? (
          <View className="mr-2">
            <TravelIcon
              icon={trip.icon}
              fallback={MapPin}
              size={16}
              color={themed.cobalt}
            />
          </View>
        ) : null}
        <Text
          className="flex-1 pr-2 text-base font-semibold text-foreground"
          numberOfLines={1}
        >
          {trip.title}
        </Text>
        <Text
          className={`text-xs font-medium ${
            trip.showOnBookingForm ? "text-success-fg" : "text-shell-dim"
          }`}
        >
          {trip.showOnBookingForm ? "On booking form" : "Hidden"}
        </Text>
      </View>
      {trip.description ? (
        <Text className="mt-1 text-sm text-shell-dim" numberOfLines={1}>
          {trip.description}
        </Text>
      ) : null}
      <Text className="mt-1.5 text-xs text-shell-mute">
        {trip.legCount} stop{trip.legCount === 1 ? "" : "s"}
      </Text>
    </Pressable>
  );
}
