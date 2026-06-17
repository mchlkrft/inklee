import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Building2 } from "lucide-react-native";
import type {
  MobileStudio,
  MobileStudiosResponse,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { TravelIcon } from "@/components/TravelIcon";
import { useApiQuery } from "@/lib/api";
import { visibilityLabel } from "@/lib/travel";
import { useColors } from "@/lib/theme";

const ListGap = () => <View className="h-3" />;

export default function StudiosList() {
  const router = useRouter();
  const q = useApiQuery<MobileStudiosResponse>("/travel/studios");
  const themed = useColors();

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load studios"
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
            label="New studio"
            onPress={() => router.push("/travel/studios/new")}
          />
        </View>
        <FlatList
          data={q.data.items}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingBottom: 120 /* tab bar clearance */ }}
          refreshControl={
            <RefreshControl
              refreshing={q.refreshing}
              onRefresh={q.refresh}
              tintColor={themed.accent}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No studios yet"
              subtitle="Add the studios you work from so you can attach them to trip stops."
            />
          }
          ItemSeparatorComponent={ListGap}
          renderItem={({ item }) => (
            <StudioRowView
              studio={item}
              onPress={() => router.push(`/travel/studios/${item.id}`)}
            />
          )}
        />
      </View>
    </Screen>
  );
}

function StudioRowView({
  studio,
  onPress,
}: {
  studio: MobileStudio;
  onPress: () => void;
}) {
  const themed = useColors();
  const place = [studio.city, studio.country].filter(Boolean).join(", ");
  const street = studio.address;
  const showStreet = street && street !== place;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-shell-border bg-glass p-3 active:opacity-80"
    >
      {/* Full-height square icon tile (founder's custom inklee set) */}
      <View className="h-16 w-16 items-center justify-center rounded-xl border border-shell-border bg-shell-hover">
        <TravelIcon
          icon={studio.icon}
          fallback={Building2}
          size={34}
          color={themed.shell.fg}
        />
      </View>
      <View className="flex-1 justify-center">
        <View className="flex-row items-center justify-between">
          <Text
            className="flex-1 pr-2 text-base font-semibold text-foreground"
            numberOfLines={1}
          >
            {studio.name}
          </Text>
          {studio.isPrimary ? (
            <Text className="text-xs font-medium text-accent">Primary</Text>
          ) : null}
        </View>
        {place ? (
          <Text className="mt-0.5 text-sm text-shell-dim" numberOfLines={1}>
            {place}
          </Text>
        ) : null}
        {showStreet ? (
          <Text className="mt-0.5 text-xs text-shell-mute" numberOfLines={1}>
            {street}
          </Text>
        ) : null}
        <Text className="mt-1 text-xs text-shell-mute">
          {visibilityLabel(studio.visibilityMode)}
        </Text>
      </View>
    </Pressable>
  );
}
