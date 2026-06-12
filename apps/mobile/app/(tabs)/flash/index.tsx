import { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  MobileFlashItem,
  MobileFlashItemsResponse,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { TopBar, useTopBarHeight } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { BrandLoader } from "@/components/BrandLoader";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { NavCardRow } from "@/components/NavCardRow";
import { apiPost, useApiQuery } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { flashLabel, flashStatusTone, formatFlashPrice } from "@/lib/flash";
import { useColors } from "@/lib/theme";
import { useScrollHide } from "@/lib/scroll-hide";
import { TAB_BAR_CLEARANCE } from "@/components/BottomNav";

const ListGap = () => <View className="h-3" />;

export default function FlashItemsList() {
  const router = useRouter();
  const q = useApiQuery<MobileFlashItemsResponse>("/flash/items");
  const colors = useColors();
  const onScroll = useScrollHide();
  const topBarHeight = useTopBarHeight();
  const [creating, setCreating] = useState(false);

  // One-tap quick create (web parity): mint a draft immediately and land on
  // the photo-first editor — no save-the-form-before-the-photo friction.
  async function newDesign() {
    setCreating(true);
    try {
      const { id } = await apiPost<{ id: string }>("/flash/items");
      q.refresh();
      router.push(`/flash/items/${id}`);
    } catch (e) {
      captureError(e, { op: "createFlashItem" });
    } finally {
      setCreating(false);
    }
  }

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]} topBar={<TopBar />}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <BrandLoader />
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

  // Header scrolls WITH the list (ListHeaderComponent) so the overlay TopBar
  // can reclaim its space when it hides on scroll.
  const listHeader = (
    <>
      <PageHeader title="Flash" />
      <View className="pt-2">
        {/* Full md-height CTA, matching the calendar's New appointment. */}
        <Button label="New design" onPress={newDesign} loading={creating} />
      </View>
      <NavCardRow
        icon="calendar-outline"
        label="Flash days"
        className="mb-1 mt-3"
        onPress={() => router.push("/flash/days")}
      />
      <View className="h-2" />
    </>
  );

  return (
    <Screen edges={["left", "right"]} topBar={<TopBar />}>
      <FlatList
        data={q.data.items}
        keyExtractor={(it) => it.id}
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
            title="No flash designs yet"
            subtitle="Add designs on the web or import from Instagram, then manage them here."
          />
        }
        ItemSeparatorComponent={ListGap}
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
  const colors = useColors();
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
          {item.availabilityLabel ? (
            <Text
              className={`text-xs font-medium ${
                item.bookable ? "text-success-fg" : "text-shell-mute"
              }`}
            >
              · {item.availabilityLabel}
            </Text>
          ) : !item.isBookable ? (
            <Text className="text-xs text-shell-mute">· Not bookable</Text>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.shell.mute} />
    </Pressable>
  );
}
