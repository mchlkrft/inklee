import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { TextArea } from "@/components/TextArea";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, X } from "lucide-react-native";
import type {
  MobileProductDetail,
  MobileProductVariantInput,
  MobileProductVariantsUpdate,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { FieldLabel } from "@/components/FieldLabel";
import { IconButton } from "@/components/IconButton";
import { PillButton } from "@/components/PillButton";
import { RadioList } from "@/components/RadioList";
import { TextField } from "@/components/TextField";
import { Segmented } from "@/components/Segmented";
import { DangerButton } from "@/components/DangerButton";
import { MultiImageField } from "@/components/MultiImageField";
import type { PickedImage } from "@/components/ImageUploadField";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, apiPut, apiUpload, apiDelete } from "@/lib/api";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  MAX_PRODUCT_TITLE,
  MAX_VARIANT_NAME,
  MAX_VARIANTS,
  maxProductImages,
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_STATUS_OPTIONS,
  dropProductDetail,
  formatProductPrice,
  invalidateGoods,
  parseEuAmount,
} from "@/lib/goods";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { colors } from "@/lib/tokens";

type Category = (typeof PRODUCT_CATEGORY_OPTIONS)[number]["value"];
type Status = (typeof PRODUCT_STATUS_OPTIONS)[number]["value"];

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({
  value: c,
  label: c.toUpperCase(),
}));

// One editable option row. `id` round-trips for the server's non-destructive
// reconcile (existing variants update in place; historical orders keep their
// pointers). `key` is the local React key for unsaved rows.
type VariantRow = {
  key: number;
  id: string | null;
  name: string;
  price: string;
  stock: string;
};

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const themed = useColors();
  const queryClient = useQueryClient();
  const isNew = id === "new";
  const q = useApiQuery<MobileProductDetail>(`/goods/${id}`, {
    enabled: !isNew,
  });

  // Drop the cached detail when the editor leaves so the NEXT open seeds from
  // the network — the whole-list variants save makes a stale seed destructive
  // (a variant added on the web meanwhile would be reconciled away). Never
  // drop while mounted: removing an actively observed query unmounts the form
  // on the next re-render and wipes unsaved edits.
  useEffect(() => {
    if (isNew) return;
    return () => dropProductDetail(queryClient, id);
  }, [isNew, id, queryClient]);

  if (!isNew && !q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
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
  const themed = useColors();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [price, setPrice] = useState(
    initial?.price != null ? String(initial.price) : "",
  );
  const [currency, setCurrency] = useState(
    initial?.currency ?? DEFAULT_CURRENCY,
  );
  const [currencyOpen, setCurrencyOpen] = useState(false);
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
  const [moreOpen, setMoreOpen] = useState(false);

  // Variants: seeded from the server's active set (`?? []` guards an older
  // server that doesn't send them yet). Ids round-trip for the reconcile.
  const initialVariants = initial?.variants ?? [];
  const [hasOptions, setHasOptions] = useState(initialVariants.length > 0);
  const [variantRows, setVariantRows] = useState<VariantRow[]>(() =>
    initialVariants.map((v, i) => ({
      key: i,
      id: v.id,
      name: v.name,
      price: v.priceOverride != null ? String(v.priceOverride) : "",
      stock: v.stock != null ? String(v.stock) : "",
    })),
  );
  const [nextRowKey, setNextRowKey] = useState(initialVariants.length);

  // Images. Create mode queues picks (deferred) and uploads them right after
  // the product row exists — one save, no second step (the round-4 hard
  // requirement). Edit mode uploads/removes eagerly per tile.
  const initialImageUrls =
    initial?.imageUrls ??
    (initial?.imageUrl ? [initial.imageUrl] : []);
  const [pendingPhotos, setPendingPhotos] = useState<PickedImage[]>([]);
  const [imageCount, setImageCount] = useState(initialImageUrls.length);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Unsaved-changes guard. Image edits are persisted eagerly in edit mode, so
  // they aren't "unsaved"; the queued create photos (pendingPhotos) are. Variant
  // rows compare by their serialized name/price/stock, ignoring local keys.
  const seedCategory: Category = PRODUCT_CATEGORY_OPTIONS.some(
    (o) => o.value === initial?.category,
  )
    ? (initial!.category as Category)
    : "other";
  const seedStatus: Status = PRODUCT_STATUS_OPTIONS.some(
    (o) => o.value === initial?.status,
  )
    ? (initial!.status as Status)
    : "active";
  const seedVariantKey = initialVariants
    .map(
      (v) =>
        `${v.name}|${v.priceOverride != null ? String(v.priceOverride) : ""}|${
          v.stock != null ? String(v.stock) : ""
        }`,
    )
    .join(";;");
  const currentVariantKey = variantRows
    .map((r) => `${r.name}|${r.price}|${r.stock}`)
    .join(";;");
  const dirty =
    title !== (initial?.title ?? "") ||
    price !== (initial?.price != null ? String(initial.price) : "") ||
    currency !== (initial?.currency ?? DEFAULT_CURRENCY) ||
    category !== seedCategory ||
    status !== seedStatus ||
    description !== (initial?.description ?? "") ||
    pickupNote !== (initial?.pickupNote ?? "") ||
    quantity !== (initial?.quantity != null ? String(initial.quantity) : "") ||
    isPublicVisible !== (initial?.isPublicVisible ?? true) ||
    hasOptions !== initialVariants.length > 0 ||
    currentVariantKey !== seedVariantKey ||
    (isNew && pendingPhotos.length > 0);
  const { leave } = useUnsavedGuard(dirty && !saving, save);

  // The live image cap follows the option rows exactly like the web editor:
  // adding an option opens an image slot (one per option plus a shared one).
  const liveVariantCount = hasOptions
    ? variantRows.filter((r) => r.name.trim().length > 0).length
    : 0;
  const liveMaxImages = maxProductImages(liveVariantCount);
  const currentImageCount = isNew ? pendingPhotos.length : imageCount;
  const capHint =
    liveVariantCount > 0
      ? `With ${liveVariantCount} ${
          liveVariantCount === 1 ? "option" : "options"
        } you can add up to ${liveMaxImages} images (one per option plus a shared one).`
      : "Up to 3 images. The first is the main photo.";

  // Echo the parsed price back so a mis-typed amount (e.g. EU grouping) is
  // visible before the artist saves.
  const pricePreview = parseEuAmount(price);

  function updateRow(key: number, patch: Partial<VariantRow>) {
    setVariantRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function addRow() {
    if (variantRows.length >= MAX_VARIANTS) return;
    setVariantRows((rows) => [
      ...rows,
      { key: nextRowKey, id: null, name: "", price: "", stock: "" },
    ]);
    setNextRowKey((k) => k + 1);
  }

  function toggleOptions(on: boolean) {
    setHasOptions(on);
    // Seed one blank row so the editor isn't an empty card (web parity).
    if (on && variantRows.length === 0) addRow();
  }

  function buildVariantsPayload():
    | { value: MobileProductVariantInput[] }
    | { error: string } {
    if (!hasOptions) return { value: [] };
    const out: MobileProductVariantInput[] = [];
    for (const row of variantRows) {
      const name = row.name.trim().slice(0, MAX_VARIANT_NAME);
      if (!name) continue; // nameless rows are dropped, like the web
      let priceOverride: number | null = null;
      if (row.price.trim() !== "") {
        const n = parseEuAmount(row.price);
        if (n === null) {
          return { error: `Option "${name}": enter a valid price.` };
        }
        priceOverride = n;
      }
      let stock: number | null = null;
      if (row.stock.trim() !== "") {
        const n = Number(row.stock.trim());
        if (!Number.isInteger(n) || n < 0) {
          return { error: `Option "${name}": stock must be 0 or more.` };
        }
        stock = n;
      }
      out.push({ id: row.id, name, priceOverride, stock });
    }
    return { value: out.slice(0, MAX_VARIANTS) };
  }

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
    const qty = quantity.trim() === "" ? null : Number(quantity.trim());
    if (qty !== null && (!Number.isInteger(qty) || qty < 0)) {
      setError("Quantity must be a whole number, or leave it empty.");
      return;
    }
    const variantsRes = buildVariantsPayload();
    if ("error" in variantsRes) {
      setError(variantsRes.error);
      return;
    }
    const variantsPayload = variantsRes.value;
    const newMax = maxProductImages(variantsPayload.length);
    if (currentImageCount > newMax) {
      setError(
        `Remove ${currentImageCount - newMax} ${
          currentImageCount - newMax === 1 ? "image" : "images"
        } first: with ${variantsPayload.length} ${
          variantsPayload.length === 1 ? "option" : "options"
        } you can have at most ${newMax}.`,
      );
      return;
    }

    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      price: amount,
      currency,
      category,
      status,
      description: description.trim() || null,
      pickupNote: pickupNote.trim() || null,
      // Web parity: the quantity input unmounts while options are on, so the
      // web stores NULL — per-variant stock takes over.
      quantity: hasOptions ? null : qty,
      isPublicVisible,
    };
    const variantsBody: MobileProductVariantsUpdate = {
      variants: variantsPayload,
    };
    try {
      if (isNew) {
        // One user-visible save: create the row, then the options (BEFORE the
        // photos — the server's image cap counts saved variants), then upload
        // the queued photos sequentially in pick order.
        const created = await apiPost<{ id: string }>("/goods", payload);
        let failedStep: "options" | "photo" | null = null;
        if (variantsPayload.length > 0) {
          try {
            await apiPut(`/goods/${created.id}/variants`, variantsBody);
          } catch (e) {
            captureError(e, { op: "createProductVariants" });
            failedStep = "options";
          }
        }
        let uploadedPhotos = 0;
        if (failedStep === null) {
          for (const photo of pendingPhotos) {
            try {
              await apiUpload(`/goods/${created.id}/image?append=1`, photo);
              uploadedPhotos += 1;
            } catch (e) {
              captureError(e, { op: "createProductPhoto" });
              failedStep = "photo";
              break;
            }
          }
        }
        dropProductDetail(queryClient, created.id);
        await invalidateGoods(queryClient);
        if (failedStep) {
          // The product exists — never re-arm Create (a retry would mint a
          // duplicate). Land on the edit screen, which retries naturally.
          // Queued photos don't survive the hop, so say what needs re-adding.
          const droppedPhotos = pendingPhotos.length - uploadedPhotos;
          leave(() => router.replace(`/goods/${created.id}`));
          Alert.alert(
            "Product saved",
            failedStep === "options"
              ? droppedPhotos > 0
                ? "The options didn't save, so your photos weren't added. Check the options, save, then add the photos again."
                : "The options didn't save. Check them and save again."
              : droppedPhotos === 1
                ? "A photo didn't upload. Tap Add to try again."
                : `${droppedPhotos} photos didn't upload. Tap Add to add them again.`,
          );
          return;
        }
        leave();
      } else {
        await apiPut(`/goods/${id}`, payload);
        // Skip the reconcile when there is nothing to save AND nothing to
        // clear — also keeps variant-less edits working against a server
        // that predates the /variants route.
        if (variantsPayload.length > 0 || initialVariants.length > 0) {
          await apiPut(`/goods/${id}/variants`, variantsBody);
        }
        // The unmount effect in ProductScreen drops the cached detail as the
        // screen leaves, so the next open seeds fresh.
        await invalidateGoods(queryClient);
        leave();
      }
    } catch (e) {
      captureError(e, { op: "saveProduct" });
      // A partial edit failure (metadata saved, variants errored) must not
      // leave the cache stale: invalidate IN PLACE (a removeQueries here
      // would unmount the mounted form and wipe the typed values the artist
      // needs for the retry); the unmount effect drops the entry on exit.
      if (!isNew) {
        void invalidateGoods(queryClient);
      }
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
      leave();
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
        // The tab pill no longer overlays nested detail forms (BottomNav hides
        // on [bracket] routes), so plain scroll clearance is enough.
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 }}
      >
        {isNew ? (
          // Deferred picks: local previews now, sequential uploads right after
          // the first save creates the product id (no separate photo step).
          <MultiImageField
            max={liveMaxImages}
            capHint={capHint}
            pending={pendingPhotos}
            onPendingChange={setPendingPhotos}
          />
        ) : (
          // Cap clamped to the SAVED variant count: uploads are eager, and the
          // server's cap counts saved variants, so unsaved option rows must
          // not promise slots the next upload would reject.
          <MultiImageField
            max={Math.min(
              liveMaxImages,
              maxProductImages(initialVariants.length),
            )}
            capHint={capHint}
            imageUrls={initialImageUrls}
            endpoint={`/goods/${id}/image`}
            removeEndpoint={`/goods/${id}/image`}
            onChanged={(urls) => {
              setImageCount(urls.length);
              // Patch the cached detail IN PLACE (a removeQueries here would
              // unmount the form on the next re-render and wipe unsaved
              // edits); the unmount effect drops the entry for the next open.
              queryClient.setQueryData<MobileProductDetail>(
                ["api", `/goods/${id}`],
                (cur) =>
                  cur
                    ? { ...cur, imageUrls: urls, imageUrl: urls[0] ?? null }
                    : cur,
              );
              void invalidateGoods(queryClient);
            }}
          />
        )}

        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
          maxLength={MAX_PRODUCT_TITLE}
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
            <FieldLabel>Currency</FieldLabel>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Currency: ${currency.toUpperCase()}`}
              accessibilityState={{ expanded: currencyOpen }}
              onPress={() => setCurrencyOpen((v) => !v)}
              className="h-12 flex-row items-center justify-between rounded-xl border-brand border-shell-border px-4 active:opacity-80"
            >
              <Text className="text-base text-foreground">
                {currency.toUpperCase()}
              </Text>
              {currencyOpen ? (
                <ChevronUp size={16} color={themed.shell.dim} />
              ) : (
                <ChevronDown size={16} color={themed.shell.dim} />
              )}
            </Pressable>
          </View>
        </View>
        {currencyOpen ? (
          <View className="mt-2">
            <RadioList
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={(v) => {
                setCurrency(v);
                setCurrencyOpen(false);
              }}
            />
          </View>
        ) : null}
        {pricePreview !== null ? (
          <Text className="-mt-1 mb-1 text-xs text-shell-mute">
            = {formatProductPrice(pricePreview, currency)}
          </Text>
        ) : null}
        {currency !== "eur" ? (
          <Text className="mb-3 mt-1 text-xs text-shell-dim">
            Non-EUR products show on your page but can&apos;t be added to
            deposit checkouts.
          </Text>
        ) : (
          <View className="mb-2" />
        )}

        <FieldLabel>Description (optional)</FieldLabel>
        <TextArea
          value={description}
          onChangeText={setDescription}
          maxLength={500}
          placeholder="What is it?"
        />

        {/* Options (variants) — the web "This product has options" editor:
            whole-list save, ids round-trip, nameless rows dropped. */}
        <View className="mb-3 rounded-2xl border border-shell-border bg-glass p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-base font-semibold text-foreground">
                This product has options
              </Text>
              <Text className="mt-0.5 text-sm text-shell-dim">
                Sizes, colors, editions.
              </Text>
            </View>
            <Switch
              value={hasOptions}
              onValueChange={toggleOptions}
              trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
              thumbColor={colors.bone}
              ios_backgroundColor="rgba(0,0,0,0.35)"
            />
          </View>

          {hasOptions ? (
            <View className="mt-3 border-t border-shell-border pt-3">
              <View className="mb-1 flex-row gap-2 pr-12">
                <Text className="flex-1 text-xs text-shell-dim">Name</Text>
                <Text className="w-20 text-xs text-shell-dim">Price</Text>
                <Text className="w-16 text-xs text-shell-dim">Stock</Text>
              </View>
              {variantRows.map((row) => (
                <View key={row.key} className="flex-row items-center gap-2">
                  <View className="flex-1">
                    <TextField
                      value={row.name}
                      onChangeText={(v) => updateRow(row.key, { name: v })}
                      placeholder="M"
                      maxLength={MAX_VARIANT_NAME}
                    />
                  </View>
                  <View className="w-20">
                    <TextField
                      value={row.price}
                      onChangeText={(v) => updateRow(row.key, { price: v })}
                      keyboardType="decimal-pad"
                      placeholder="Price"
                    />
                  </View>
                  <View className="w-16">
                    <TextField
                      value={row.stock}
                      onChangeText={(v) =>
                        updateRow(row.key, {
                          stock: v.replace(/[^0-9]/g, ""),
                        })
                      }
                      keyboardType="number-pad"
                      placeholder="∞"
                    />
                  </View>
                  <View className="mb-3">
                    <IconButton
                      icon={X}
                      label={`Remove option ${row.name || ""}`.trim()}
                      outlined
                      iconSize={14}
                      color={themed.bone}
                      onPress={() =>
                        setVariantRows((rows) =>
                          rows.filter((r) => r.key !== row.key),
                        )
                      }
                    />
                  </View>
                </View>
              ))}
              {variantRows.length < MAX_VARIANTS ? (
                <View className="flex-row">
                  <PillButton label="Add option" onPress={addRow} />
                </View>
              ) : null}
              <Text className="mt-2 text-xs text-shell-dim">
                Leave price empty to use the product price. Leave stock empty
                for unlimited.
              </Text>
            </View>
          ) : null}
        </View>

        {!hasOptions ? (
          <TextField
            label="Quantity (optional)"
            value={quantity}
            onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            placeholder="Leave empty for unlimited"
          />
        ) : null}

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

        {/* Category / status / pickup note sit behind a collapsed group so the
            primary path stays images, title, price (web "More settings"
            parity). The tile long-press already covers quick status flips. */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: moreOpen }}
          onPress={() => setMoreOpen((v) => !v)}
          className="mb-3 flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass px-4 py-3 active:opacity-80"
        >
          <Text className="text-base font-semibold text-foreground">
            More settings
          </Text>
          {moreOpen ? (
            <ChevronUp size={18} color={themed.shell.dim} />
          ) : (
            <ChevronDown size={18} color={themed.shell.dim} />
          )}
        </Pressable>
        {moreOpen ? (
          <View>
            <FieldLabel>Category</FieldLabel>
            <Segmented
              options={PRODUCT_CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
            />

            <FieldLabel>Status</FieldLabel>
            <Segmented
              options={PRODUCT_STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />

            <FieldLabel>Pickup note (optional)</FieldLabel>
            <TextArea
              value={pickupNote}
              onChangeText={setPickupNote}
              maxLength={200}
              placeholder="e.g. collect at your appointment"
              minHeight={48}
            />
          </View>
        ) : null}

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
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
