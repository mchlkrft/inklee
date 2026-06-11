import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { TextArea } from "@/components/TextArea";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileProductDetail } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Segmented } from "@/components/Segmented";
import { DangerButton } from "@/components/DangerButton";
import { ImageUploadField } from "@/components/ImageUploadField";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, apiPut, apiDelete } from "@/lib/api";
import {
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_STATUS_OPTIONS,
  formatProductPrice,
  isSupportedCurrency,
  parseEuAmount,
} from "@/lib/goods";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";

type Category = (typeof PRODUCT_CATEGORY_OPTIONS)[number]["value"];
type Status = (typeof PRODUCT_STATUS_OPTIONS)[number]["value"];

function Label({ children }: { children: string }) {
  return <Text className="mb-1.5 text-sm font-medium text-foreground">{children}</Text>;
}

function invalidateGoods(client: ReturnType<typeof useQueryClient>) {
  return client.invalidateQueries({
    predicate: (query) =>
      typeof query.queryKey[1] === "string" &&
      (query.queryKey[1] as string).startsWith("/goods"),
  });
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const q = useApiQuery<MobileProductDetail>(`/goods/${id}`, {
    enabled: !isNew,
  });

  if (!isNew && !q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
          ) : (
            <ErrorState
              title="Couldn't load product"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <ProductForm isNew={isNew} id={id} initial={isNew ? null : q.data!} />;
}

function ProductForm({
  isNew,
  id,
  initial,
}: {
  isNew: boolean;
  id: string;
  initial: MobileProductDetail | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [price, setPrice] = useState(
    initial?.price != null ? String(initial.price) : "",
  );
  const [currency, setCurrency] = useState(initial?.currency ?? "eur");
  // Coerce to a known option so an enum the mobile list hasn't mirrored yet shows
  // a real selection (and a save can't silently downgrade it on an unrelated edit).
  const [category, setCategory] = useState<Category>(() =>
    PRODUCT_CATEGORY_OPTIONS.some((o) => o.value === initial?.category)
      ? (initial!.category as Category)
      : "other",
  );
  const [status, setStatus] = useState<Status>(() =>
    PRODUCT_STATUS_OPTIONS.some((o) => o.value === initial?.status)
      ? (initial!.status as Status)
      : "active",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pickupNote, setPickupNote] = useState(initial?.pickupNote ?? "");
  const [quantity, setQuantity] = useState(
    initial?.quantity != null ? String(initial.quantity) : "",
  );
  const [isPublicVisible, setIsPublicVisible] = useState(
    initial?.isPublicVisible ?? true,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Echo the parsed price back so a mis-typed amount (e.g. EU grouping) is
  // visible before the artist saves.
  const pricePreview = parseEuAmount(price);

  async function save() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    const amount = parseEuAmount(price);
    if (amount === null) {
      setError("Enter a valid price.");
      return;
    }
    const cur = currency.trim().toLowerCase() || "eur";
    if (!isSupportedCurrency(cur)) {
      setError("Use a supported currency code (e.g. eur, usd, gbp).");
      return;
    }
    const qty = quantity.trim() === "" ? null : Number(quantity.trim());
    if (qty !== null && (!Number.isInteger(qty) || qty < 0)) {
      setError("Quantity must be a whole number, or leave it empty.");
      return;
    }

    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      price: amount,
      currency: cur,
      category,
      status,
      description: description.trim() || null,
      pickupNote: pickupNote.trim() || null,
      quantity: qty,
      isPublicVisible,
    };
    try {
      if (isNew) {
        // The image endpoint needs a product id, so a brand-new product can't
        // upload before its first save. Land straight on the saved product's
        // edit screen so the photo step follows immediately (no back-and-find).
        const created = await apiPost<{ id: string }>("/goods", payload);
        await invalidateGoods(queryClient);
        router.replace(`/goods/${created.id}`);
      } else {
        await apiPut(`/goods/${id}`, payload);
        await invalidateGoods(queryClient);
        router.back();
      }
    } catch (e) {
      captureError(e, { op: "saveProduct" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  async function doDelete() {
    setSaving(true);
    setError(null);
    try {
      await apiDelete(`/goods/${id}`);
      await invalidateGoods(queryClient);
      router.back();
    } catch (e) {
      captureError(e, { op: "deleteProduct" });
      setError(e instanceof Error ? e.message : "Couldn't delete. Try again.");
      setSaving(false);
    }
  }

  // Native two-button confirm before the destructive delete (the web shows an
  // inline confirm step; there was none on mobile before).
  function remove() {
    Alert.alert(
      "Delete product",
      "This removes it from your public page. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ],
    );
  }

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen options={{ title: isNew ? "New product" : "Product" }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 120 /* tab bar clearance */ }}
      >
        {!isNew ? (
          <ImageUploadField
            label="Photo"
            hero
            imageUrl={initial?.imageUrl ?? null}
            endpoint={`/goods/${id}/image`}
            onUploaded={() =>
              queryClient.invalidateQueries({
                predicate: (q) =>
                  typeof q.queryKey[1] === "string" &&
                  (q.queryKey[1] as string).startsWith("/goods"),
              })
            }
          />
        ) : (
          // The image endpoint needs the product's id, so the photo step comes
          // right after the first save (you land back here with it ready).
          <View
            className="mb-4 items-center justify-center rounded-[20px] border border-dashed border-shell-border bg-glass"
            style={{ height: 160 }}
          >
            <Text className="px-6 text-center text-sm text-shell-dim">
              Save the product and the photo upload appears right here.
            </Text>
          </View>
        )}

        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
        />

        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField
              label="Price"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="e.g. 25"
            />
          </View>
          <View className="w-28">
            <TextField
              label="Currency"
              value={currency}
              onChangeText={(v) => setCurrency(v.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="eur"
              maxLength={3}
            />
          </View>
        </View>
        {pricePreview !== null ? (
          <Text className="-mt-1 mb-3 text-xs text-shell-mute">
            ={" "}
            {formatProductPrice(
              pricePreview,
              currency.trim().toLowerCase() || "eur",
            )}
          </Text>
        ) : null}

        <Label>Category</Label>
        <Segmented
          options={PRODUCT_CATEGORY_OPTIONS}
          value={category}
          onChange={setCategory}
        />

        <Label>Status</Label>
        <Segmented
          options={PRODUCT_STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
        />

        <Label>Description (optional)</Label>
        <TextArea
          value={description}
          onChangeText={setDescription}
          maxLength={500}
          placeholder="What is it?"
        />

        <Label>Pickup note (optional)</Label>
        <TextArea
          value={pickupNote}
          onChangeText={setPickupNote}
          maxLength={200}
          placeholder="e.g. collect at your appointment"
          minHeight={48}
        />

        <TextField
          label="Quantity (optional)"
          value={quantity}
          onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          placeholder="Leave empty for unlimited"
        />

        <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass px-4 py-3">
          <View className="flex-1 pr-3">
            <Text className="text-base text-foreground">Show on your page</Text>
            <Text className="mt-0.5 text-sm text-shell-dim">
              Off keeps it as a draft.
            </Text>
          </View>
          <Switch
            value={isPublicVisible}
            onValueChange={setIsPublicVisible}
            trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
            thumbColor={colors.bone}
            ios_backgroundColor="rgba(0,0,0,0.35)"
          />
        </View>

        {error ? (
          <Text className="mb-3 text-sm text-danger">{error}</Text>
        ) : null}

        <Button
          label={isNew ? "Create product" : "Save"}
          onPress={save}
          loading={saving}
          disabled={!title.trim()}
        />

        {!isNew ? (
          <DangerButton
            label="Delete product"
            onPress={remove}
            disabled={saving}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
