import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import type {
  MobileFlashDay,
  MobileFlashDaysResponse,
  MobileMe,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { PillButton } from "@/components/PillButton";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import { config } from "@/lib/config";
import { flashLabel, flashStatusTone } from "@/lib/flash";
import { formatShortDate } from "@/lib/date";
import { useColors } from "@/lib/theme";
import { useTimedFlag } from "@/lib/use-timed-flag";

const ListGap = () => <View className="h-3" />;

export default function FlashDaysList() {
  const router = useRouter();
  const q = useApiQuery<MobileFlashDaysResponse>("/flash/days");
  const me = useApiQuery<MobileMe>("/me");
  const slug = me.data?.slug ?? null;
  const colors = useColors();

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.accent} />
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
          contentContainerStyle={{ paddingBottom: 120 /* tab bar clearance */ }}
          refreshControl={
            <RefreshControl
              refreshing={q.refreshing}
              onRefresh={q.refresh}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No flash days yet"
              subtitle="Create a flash day for walk-ins or a guest spot, then attach designs to it."
            />
          }
          ItemSeparatorComponent={ListGap}
          renderItem={({ item }) => (
            <DayRow
              day={item}
              publicUrl={
                item.isPublic && slug
                  ? `${config.publicUrl(slug)}/flash/days/${item.id}`
                  : null
              }
              onPress={() => router.push(`/flash/days/${item.id}`)}
            />
          )}
        />
      </View>
    </Screen>
  );
}

function DayRow({
  day,
  publicUrl,
  onPress,
}: {
  day: MobileFlashDay;
  publicUrl: string | null;
  onPress: () => void;
}) {
  const colors = useColors();
  const [copied, markCopied] = useTimedFlag();
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
          <Text className="text-xs text-success-fg"> · Public</Text>
        ) : null}
      </View>

      {publicUrl ? (
        <View className="mt-3 flex-row gap-2">
          <PillButton
            label={copied ? "Copied" : "Copy link"}
            onPress={async () => {
              await Clipboard.setStringAsync(publicUrl);
              markCopied();
            }}
          />
          <PillButton
            label="View"
            onPress={() => {
              void WebBrowser.openBrowserAsync(publicUrl);
            }}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
