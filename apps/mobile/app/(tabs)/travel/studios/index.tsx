import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import type {
  MobileStudio,
  MobileStudiosResponse,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import { visibilityLabel } from "@/lib/travel";
import { colors } from "@/lib/tokens";

export default function StudiosList() {
  const router = useRouter();
  const q = useApiQuery<MobileStudiosResponse>("/travel/studios");

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
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
              title="No studios yet"
              subtitle="Add the studios you work from so you can attach them to trip stops."
            />
          }
          ItemSeparatorComponent={() => <View className="h-3" />}
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
  const place = [studio.city, studio.country].filter(Boolean).join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-2xl border border-shell-border bg-[rgba(229,225,213,0.04)] p-4 active:opacity-80"
    >
      <View className="flex-row items-center justify-between">
        <Text
          className="flex-1 pr-2 text-base font-semibold text-bone"
          numberOfLines={1}
        >
          {studio.name}
        </Text>
        {studio.isPrimary ? (
          <Text className="text-xs font-medium text-mustard">Primary</Text>
        ) : null}
      </View>
      {place ? (
        <Text className="mt-0.5 text-sm text-shell-dim">{place}</Text>
      ) : null}
      <Text className="mt-1.5 text-xs text-shell-mute">
        {visibilityLabel(studio.visibilityMode)}
      </Text>
    </Pressable>
  );
}
