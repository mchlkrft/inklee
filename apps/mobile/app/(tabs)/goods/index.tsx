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
  MobileProduct,
  MobileProductsResponse,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import {
  formatProductPrice,
  productCategoryLabel,
  productStatusLabel,
  productStatusTone,
} from "@/lib/goods";
import { colors } from "@/lib/tokens";

export default function GoodsList() {
  const router = useRouter();
  const q = useApiQuery<MobileProductsResponse>("/goods");

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
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

  return (
    <Screen edges={["left", "right"]}>
      <View className="flex-1">
        <PageHeader title="Goods" />
        <View className="py-3">
          <Button
            label="New product"
            onPress={() => router.push("/goods/new")}
          />
        </View>
        <FlatList
          data={q.data.items}
          keyExtractor={(p) => p.id}
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
              title="No products yet"
              subtitle="Add prints, shirts and more to show on your page. Add product photos on the web."
            />
          }
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <ProductRow
              product={item}
              onPress={() => router.push(`/goods/${item.id}`)}
            />
          )}
        />
      </View>
    </Screen>
  );
}

function ProductRow({
  product,
  onPress,
}: {
  product: MobileProduct;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-shell-border bg-glass p-3 active:opacity-80"
    >
      {product.imageUrl ? (
        <Image
          source={{ uri: product.imageUrl }}
          style={{ width: 56, height: 56, borderRadius: 12 }}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View className="h-14 w-14 items-center justify-center rounded-xl bg-mustard/15">
          <Ionicons name="pricetag-outline" size={20} color={colors.shell.mute} />
        </View>
      )}
      <View className="flex-1">
        <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
          {product.title}
        </Text>
        <Text className="mt-0.5 text-sm text-shell-dim">
          {productCategoryLabel(product.category)} ·{" "}
          {formatProductPrice(product.price, product.currency)}
        </Text>
        <View className="mt-1 flex-row items-center gap-2">
          <Text
            className={`text-xs font-medium ${productStatusTone(product.status)}`}
          >
            {productStatusLabel(product.status)}
          </Text>
          {!product.isPublicVisible ? (
            <Text className="text-xs text-shell-mute">· Draft</Text>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.shell.mute} />
    </Pressable>
  );
}
