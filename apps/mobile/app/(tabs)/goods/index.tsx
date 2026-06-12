import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import type {
  MobileProduct,
  MobileProductsResponse,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { TopBar, useTopBarHeight } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { BrandLoader } from "@/components/BrandLoader";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import {
  formatProductPrice,
  productStatusLabel,
  setProductStatus,
} from "@/lib/goods";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useScrollHide } from "@/lib/scroll-hide";
import { TAB_BAR_CLEARANCE } from "@/components/BottomNav";

export default function GoodsList() {
  const router = useRouter();
  const q = useApiQuery<MobileProductsResponse>("/goods");
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
              title="Couldn't load goods"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  const isEmpty = q.data.items.length === 0;

  // Header scrolls WITH the grid so the overlay TopBar reclaims its space.
  const listHeader = (
    <>
      <PageHeader
        title="Goods"
        subtitle="Products your clients can pick up at their appointment. Shown on your public page and offered as add-ons when a client pays a deposit."
      />
      {/* Web hides the header create button when empty (the empty state has its
          own CTA); mirror that to avoid a duplicate button. */}
      {!isEmpty ? (
        <View className="pb-3">
          <Button label="New product" onPress={() => router.push("/goods/new")} />
        </View>
      ) : null}
    </>
  );

  return (
    <Screen edges={["left", "right"]} topBar={<TopBar />}>
      <View className="flex-1">
        <FlatList
          data={q.data.items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{
            paddingTop: topBarHeight,
            paddingBottom: TAB_BAR_CLEARANCE,
            gap: 12,
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
            <View className="items-center gap-4 rounded-[20px] border border-dashed border-shell-border px-6 py-12">
              <EmptyState
                title="No goods yet"
                subtitle="Add your first product to show it on your public page and offer it at checkout."
              />
              <Button
                label="Add your first product"
                onPress={() => router.push("/goods/new")}
              />
            </View>
          }
          renderItem={({ item }) => (
            <ProductTile
              product={item}
              onPress={() => router.push(`/goods/${item.id}`)}
              onRefresh={q.refresh}
            />
          )}
        />
      </View>
    </Screen>
  );
}

function ProductTile({
  product,
  onPress,
  onRefresh,
}: {
  product: MobileProduct;
  onPress: () => void;
  onRefresh: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  // Optimistic local status so the sold-out toggle feels instant; reverts if the
  // PATCH fails (mirrors the web GoodsTile). Resyncs whenever the server value
  // changes (refetch / edit-on-detail), or the tile keeps showing a stale badge.
  const [status, setStatus] = useState(product.status);
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setStatus(product.status);
  }, [product.status]);

  const soldOut = status === "sold_out";
  const dimmed = status === "sold_out" || status === "hidden";

  async function toggleSoldOut() {
    if (pending) return;
    const prev = status;
    const next = soldOut ? "active" : "sold_out";
    setStatus(next);
    setPending(true);
    try {
      await setProductStatus(queryClient, product.id, next);
      onRefresh();
    } catch (e) {
      captureError(e, { op: "toggleProductStatus" });
      setStatus(prev); // revert on failure
    } finally {
      setPending(false);
      setRevealed(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => (revealed ? setRevealed(false) : onPress())}
      onLongPress={() => setRevealed(true)}
      // max-w caps the LAST tile of an odd-count grid: with numColumns={2},
      // flex-1 alone stretches it to full row width (and aspect-square then
      // doubles its height). 48.5% ~ half the row minus the 12px column gap.
      className={`relative aspect-square flex-1 overflow-hidden rounded-2xl border border-shell-border bg-glass ${
        dimmed ? "opacity-70" : ""
      }`}
      style={{ maxWidth: "48.5%" }}
    >
      {product.imageUrl ? (
        <Image
          source={{ uri: product.imageUrl }}
          style={{ position: "absolute", inset: 0 }}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View className="absolute inset-0 items-center justify-center bg-mustard/10">
          <Ionicons
            name="pricetag-outline"
            size={24}
            color={colors.shell.mute}
          />
        </View>
      )}

      {/* Status badge (top-right) for non-active products. */}
      {status !== "active" ? (
        <View className="absolute right-2 top-2 rounded-full bg-charcoal/80 px-2 py-0.5">
          <Text className="text-[10px] font-medium uppercase tracking-wide text-bone">
            {productStatusLabel(status)}
          </Text>
        </View>
      ) : null}

      {/* Multi-image badge (bottom-left): +N for a gallery. */}
      {product.imageCount > 1 ? (
        <View className="absolute bottom-2 left-2 rounded-full bg-charcoal/80 px-1.5 py-0.5">
          <Text className="text-[10px] font-medium leading-none text-bone">
            +{product.imageCount - 1}
          </Text>
        </View>
      ) : null}

      {/* Reveal overlay (long-press): quick sold-out toggle + edit. */}
      {revealed ? (
        <View className="absolute inset-0 z-10 items-center justify-center gap-2 bg-charcoal/80 px-3">
          <Pressable
            onPress={toggleSoldOut}
            disabled={pending}
            accessibilityRole="button"
            className="h-10 w-full flex-row items-center justify-center gap-1.5 rounded-full border border-bone/60 px-3 active:opacity-80"
          >
            <Ionicons
              name={soldOut ? "refresh" : "checkmark"}
              size={15}
              color={colors.bone}
            />
            <Text className="text-sm font-semibold text-bone">
              {soldOut ? "Available" : "Sold out"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            className="h-10 w-full flex-row items-center justify-center gap-1.5 rounded-full bg-mustard px-3 active:opacity-90"
          >
            <Ionicons name="pencil" size={15} color={colors.charcoal} />
            <Text className="text-sm font-semibold text-charcoal">Edit</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Title strip (gradient) — hidden while the overlay is revealed. */}
      {!revealed ? (
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.9)"]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 8,
            paddingTop: 24,
            paddingBottom: 8,
          }}
        >
          <Text className="text-xs font-medium text-bone" numberOfLines={1}>
            {product.title}
          </Text>
          <Text className="text-[10px] text-bone/75" numberOfLines={1}>
            {formatProductPrice(product.price, product.currency)}
            {!product.isPublicVisible ? " · draft" : ""}
          </Text>
        </LinearGradient>
      ) : null}
    </Pressable>
  );
}
