import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type {
  MobileFlashItem,
  MobileFlashItemsResponse,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import { flashLabel, flashStatusTone, formatFlashPrice } from "@/lib/flash";
import { colors } from "@/lib/tokens";

export default function FlashItemsList() {
  const router = useRouter();
  const q = useApiQuery<MobileFlashItemsResponse>("/flash/items");

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
          ) : (
            <ErrorState
              title="Couldn't load flash"
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
      <PageHeader title="Flash" />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/flash/days")}
        className="mb-1 mt-3 flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass p-4 active:opacity-80"
      >
        <View className="flex-row items-center gap-2">
          <Ionicons name="calendar-outline" size={18} color={colors.mustard} />
          <Text className="text-base font-semibold text-foreground">Flash days</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.shell.mute} />
      </Pressable>

      <FlatList
        data={q.data.items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={q.refresh}
            tintColor={colors.mustard}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="No flash designs yet"
            subtitle="Add designs on the web or import from Instagram, then manage them here."
          />
        }
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => (
          <FlashItemRow
            item={item}
            onPress={() => router.push(`/flash/items/${item.id}`)}
          />
        )}
      />
    </Screen>
  );
}

function FlashItemRow({
  item,
  onPress,
}: {
  item: MobileFlashItem;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-shell-border bg-glass p-3 active:opacity-80"
    >
      {item.previewImageUrl ? (
        <Image
          source={{ uri: item.previewImageUrl }}
          style={{ width: 56, height: 56, borderRadius: 12 }}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View className="h-14 w-14 items-center justify-center rounded-xl bg-mustard/15">
          <Ionicons name="image-outline" size={22} color={colors.shell.mute} />
        </View>
      )}
      <View className="flex-1">
        <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
          {item.title}
        </Text>
        <Text className="mt-0.5 text-sm text-shell-dim">
          {formatFlashPrice(item.priceType, item.price)}
        </Text>
        <View className="mt-1 flex-row items-center gap-2">
          <Text
            className={`text-xs font-medium ${flashStatusTone(item.status)}`}
          >
            {flashLabel(item.status)}
          </Text>
          {!item.isBookable ? (
            <Text className="text-xs text-shell-mute">· Not bookable</Text>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.shell.mute} />
    </Pressable>
  );
}
