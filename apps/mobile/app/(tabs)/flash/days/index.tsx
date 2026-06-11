import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type {
  MobileFlashDay,
  MobileFlashDaysResponse,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import { flashLabel, flashStatusTone } from "@/lib/flash";
import { formatShortDate } from "@/lib/date";
import { colors } from "@/lib/tokens";

export default function FlashDaysList() {
  const router = useRouter();
  const q = useApiQuery<MobileFlashDaysResponse>("/flash/days");

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
          ) : (
            <ErrorState
              title="Couldn't load flash days"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right"]}>
      <View className="flex-1">
        <View className="py-3">
          <Button
            label="New flash day"
            onPress={() => router.push("/flash/days/new")}
          />
        </View>
        <FlatList
          data={q.data.items}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={q.refreshing}
              onRefresh={q.refresh}
              tintColor={colors.mustard}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No flash days yet"
              subtitle="Create a flash day for walk-ins or a guest spot, then attach designs to it."
            />
          }
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <DayRow
              day={item}
              onPress={() => router.push(`/flash/days/${item.id}`)}
            />
          )}
        />
      </View>
    </Screen>
  );
}

function DayRow({ day, onPress }: { day: MobileFlashDay; onPress: () => void }) {
  const dateLabel = day.scheduledOn
    ? formatShortDate(day.scheduledOn)
    : "No date set";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-2xl border border-shell-border bg-glass p-4 active:opacity-80"
    >
      <View className="flex-row items-center justify-between">
        <Text
          className="flex-1 pr-2 text-base font-semibold text-foreground"
          numberOfLines={1}
        >
          {day.title}
        </Text>
        <Text className={`text-xs font-medium ${flashStatusTone(day.status)}`}>
          {flashLabel(day.status)}
        </Text>
      </View>
      <Text className="mt-1 text-sm text-shell-dim">
        {dateLabel}
        {day.location ? ` · ${day.location}` : ""}
      </Text>
      <View className="mt-1.5 flex-row items-center gap-1">
        <Ionicons name="albums-outline" size={13} color={colors.shell.mute} />
        <Text className="text-xs text-shell-mute">
          {day.itemCount} design{day.itemCount === 1 ? "" : "s"}
          {day.isPublic ? "" : " · Hidden"}
        </Text>
        {day.isPublic ? (
          <Text className="text-xs text-success"> · Public</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
