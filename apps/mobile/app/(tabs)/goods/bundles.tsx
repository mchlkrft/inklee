import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileBundleList } from "@inklee/shared/mobile-api";
import {
  BUNDLE_NAME_MAX,
  MAX_BUNDLE_ITEMS,
  bundleSavings,
  canDeleteBundle,
  normalizeBundleName,
  validateBundleName,
} from "@inklee/shared/bundles";
import { formatPrice, parsePriceInput } from "@inklee/shared/goods";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { FilterChip } from "@/components/Chip";
import { ErrorState } from "@/components/ErrorState";
import { SectionLabel } from "@/components/SectionLabel";
import { TextField } from "@/components/TextField";
import {
  useApiQuery,
  apiPost,
  apiPatch,
  apiDelete,
  invalidateByPathPrefix,
} from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import { planBoundaryMessage } from "@/lib/plan-errors";

// Product bundles, native (closing the Stage 3 parity gap). Every write posts to
// a route that calls the SAME cores the web actions use, so the entitlement
// refusal, archive-first delete and item cap are one implementation. Display +
// management only; the payable bundle checkout is a separate slice.

const PATH = "/goods/bundles";

type Bundle = MobileBundleList["bundles"][number];
type ProductRow = MobileBundleList["products"][number];

function Badge({ label }: { label: string }) {
  return (
    <Text className="rounded-full border border-shell-border px-2 py-0.5 text-xs text-shell-mute">
      {label}
    </Text>
  );
}

export default function BundlesScreen() {
  useScreenView("goods_bundles");
  const c = useColors();
  const q = useApiQuery<MobileBundleList>(PATH);

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <ErrorState
              title="Couldn't load your bundles"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <BundlesList data={q.data} refresh={q.refresh} />;
}

function BundlesList({
  data,
  refresh,
}: {
  data: MobileBundleList;
  refresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemsEditingId, setItemsEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = data.bundles.filter((b) => !b.archivedAt);
  const archived = data.bundles.filter((b) => !!b.archivedAt);

  async function run(op: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await invalidateByPathPrefix(queryClient, [PATH]);
      refresh();
    } catch (e) {
      captureError(e, { op });
      setError(planBoundaryMessage(e, "Couldn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    Keyboard.dismiss();
    const normalized = normalizeBundleName(name);
    const nameError = validateBundleName(normalized);
    if (nameError) {
      setError(nameError);
      return;
    }
    // Same shared price parser the server uses, so a bad price is caught before
    // the round trip.
    const parsed = parsePriceInput(price || "0");
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    await run("createBundle", async () => {
      await apiPost(PATH, { name: normalized, priceAmount: parsed.value });
      setName("");
      setPrice("");
      setAdding(false);
    });
  }

  function confirmDelete(id: string, label: string) {
    Alert.alert(`Delete "${label}"?`, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void run("deleteBundle", () =>
            apiDelete(`${PATH}?id=${encodeURIComponent(id)}`),
          ),
      },
    ]);
  }

  return (
    <Screen edges={["left", "right"]} column="form">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 }}
      >
        <Text className="mb-4 text-sm text-shell-dim">
          Sell a few products together at one price. Your shop shows the saving.
        </Text>

        {!data.entitled ? (
          <Card>
            <Text className="text-sm text-shell-dim">
              Bundles are part of Plus. Any bundles you already made are kept and
              show again when Plus is active.
            </Text>
          </Card>
        ) : null}

        {error ? (
          <Text className="mb-3 text-sm text-danger">{error}</Text>
        ) : null}

        <SectionLabel>Bundles</SectionLabel>
        {live.length === 0 && !adding ? (
          <Text className="mb-3 text-sm text-shell-dim">No bundles yet.</Text>
        ) : null}

        {live.map((b) => (
          <View key={b.id} className="mb-2">
            <Card>
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-sm font-semibold text-shell-text">
                  {b.name}
                </Text>
                <Text className="text-sm text-shell-text">
                  {formatPrice(b.priceAmount, b.currency)}
                </Text>
                {!b.isPublicVisible ? <Badge label="Hidden" /> : null}
                <Text className="text-xs text-shell-dim">
                  {b.items.length === 1
                    ? "1 product"
                    : `${b.items.length} products`}
                </Text>
              </View>

              <View className="mt-2 flex-row flex-wrap gap-2">
                <Button
                  label={editingId === b.id ? "Close" : "Edit"}
                  variant="secondary"
                  size="sm"
                  disabled={busy || !data.entitled}
                  onPress={() =>
                    setEditingId((cur) => (cur === b.id ? null : b.id))
                  }
                />
                <Button
                  label={itemsEditingId === b.id ? "Close products" : "Products"}
                  variant="secondary"
                  size="sm"
                  disabled={busy || !data.entitled}
                  onPress={() =>
                    setItemsEditingId((cur) => (cur === b.id ? null : b.id))
                  }
                />
                <Button
                  label={b.isPublicVisible ? "Hide" : "Show"}
                  variant="secondary"
                  size="sm"
                  disabled={busy || !data.entitled}
                  onPress={() =>
                    void run("toggleBundleVisibility", () =>
                      apiPost(PATH, {
                        id: b.id,
                        isPublicVisible: !b.isPublicVisible,
                      }),
                    )
                  }
                />
                <Button
                  label="Archive"
                  variant="secondary"
                  size="sm"
                  disabled={busy || !data.entitled}
                  onPress={() =>
                    void run("archiveBundle", () =>
                      apiPatch(PATH, { op: "archive", id: b.id, archived: true }),
                    )
                  }
                />
                <Button
                  label="Delete"
                  variant="secondary"
                  size="sm"
                  // Archive-first (B4): the button refuses in the UI for the same
                  // reason the server does.
                  disabled={busy || !data.entitled || !canDeleteBundle(b)}
                  onPress={() => confirmDelete(b.id, b.name)}
                />
              </View>

              {editingId === b.id ? (
                <BundleEditForm
                  bundle={b}
                  busy={busy}
                  onSave={(fields) =>
                    void run("editBundle", async () => {
                      await apiPost(PATH, { id: b.id, ...fields });
                      setEditingId(null);
                    })
                  }
                  onError={setError}
                />
              ) : null}

              {itemsEditingId === b.id ? (
                <BundleItemsEditor
                  bundle={b}
                  products={data.products}
                  busy={busy}
                  onSave={(items) =>
                    void run("setBundleItems", () =>
                      apiPatch(PATH, { op: "setItems", bundleId: b.id, items }),
                    )
                  }
                />
              ) : null}
            </Card>
          </View>
        ))}

        {adding ? (
          <View className="mb-2">
            <Card>
              <TextField
                value={name}
                onChangeText={(v) => setName(v.slice(0, BUNDLE_NAME_MAX))}
                placeholder="e.g. Starter kit"
                accessibilityLabel="Bundle name"
              />
              <View className="mt-2">
                <TextField
                  value={price}
                  onChangeText={setPrice}
                  placeholder="Price, e.g. 40.00"
                  keyboardType="decimal-pad"
                  accessibilityLabel="Bundle price"
                />
              </View>
              <View className="mt-3 flex-row gap-2">
                <Button
                  label="Create"
                  disabled={busy}
                  onPress={() => void create()}
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setAdding(false);
                    setName("");
                    setPrice("");
                    setError(null);
                  }}
                />
              </View>
            </Card>
          </View>
        ) : (
          <Button
            label="New bundle"
            variant="secondary"
            size="sm"
            disabled={busy || !data.entitled}
            onPress={() => setAdding(true)}
          />
        )}

        {archived.length > 0 ? (
          <View className="mt-6">
            <SectionLabel>Archived</SectionLabel>
            <Text className="mb-2 text-xs text-shell-dim">
              Archived bundles keep their products. Restore one and it comes back
              as it was, or delete it once archived.
            </Text>
            {archived.map((b) => (
              <View key={b.id} className="mb-2">
                <Card>
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="text-sm font-semibold text-shell-text">
                      {b.name}
                    </Text>
                    <Text className="text-sm text-shell-text">
                      {formatPrice(b.priceAmount, b.currency)}
                    </Text>
                    <Badge label="Archived" />
                  </View>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    <Button
                      label="Restore"
                      variant="secondary"
                      size="sm"
                      disabled={busy || !data.entitled}
                      onPress={() =>
                        void run("restoreBundle", () =>
                          apiPatch(PATH, {
                            op: "archive",
                            id: b.id,
                            archived: false,
                          }),
                        )
                      }
                    />
                    <Button
                      label="Delete"
                      variant="secondary"
                      size="sm"
                      disabled={busy || !data.entitled}
                      onPress={() => confirmDelete(b.id, b.name)}
                    />
                  </View>
                </Card>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** Inline name + price edit for one bundle. */
function BundleEditForm({
  bundle,
  busy,
  onSave,
  onError,
}: {
  bundle: Bundle;
  busy: boolean;
  onSave: (fields: { name: string; priceAmount: number }) => void;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = useState(bundle.name);
  const [price, setPrice] = useState(bundle.priceAmount.toFixed(2));

  function save() {
    Keyboard.dismiss();
    const normalized = normalizeBundleName(name);
    const nameError = validateBundleName(normalized);
    if (nameError) {
      onError(nameError);
      return;
    }
    const parsed = parsePriceInput(price || "0");
    if ("error" in parsed) {
      onError(parsed.error);
      return;
    }
    onError(null);
    onSave({ name: normalized, priceAmount: parsed.value });
  }

  return (
    <View className="mt-3 border-t border-shell-border pt-3">
      <TextField
        value={name}
        onChangeText={(v) => setName(v.slice(0, BUNDLE_NAME_MAX))}
        placeholder="Bundle name"
        accessibilityLabel="Bundle name"
      />
      <View className="mt-2">
        <TextField
          value={price}
          onChangeText={setPrice}
          placeholder="Price"
          keyboardType="decimal-pad"
          accessibilityLabel="Bundle price"
        />
      </View>
      <View className="mt-3">
        <Button label="Save changes" disabled={busy} onPress={save} />
      </View>
    </View>
  );
}

/** One (product, variant) slot in the bundle-being-edited. A product may hold
 *  more than one slot (FD6): once per distinct variant. */
type Slot = { productId: string; variantId: string | null; quantity: number };

/** Per-bundle product picker: toggle products in/out and set quantities, then
 *  save the whole set (the core replaces the bundle's items to match). A
 *  product WITH active variants shows a chip PER VARIANT instead of a single
 *  product toggle (FD6): tapping a variant chip adds or removes that exact
 *  slot, so two variants of the same product can both be in the bundle at
 *  once — the artist fixes the choice here; there is no buyer-time picker.
 *  Shows the saving vs buying the parts separately. */
function BundleItemsEditor({
  bundle,
  products,
  busy,
  onSave,
}: {
  bundle: Bundle;
  products: ProductRow[];
  busy: boolean;
  onSave: (
    items: { productId: string; quantity: number; variantId: string | null }[],
  ) => void;
}) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    bundle.items.map((it) => ({
      productId: it.productId,
      variantId: it.variantId,
      quantity: it.quantity,
    })),
  );

  const productById = new Map(products.map((p) => [p.id, p]));
  const overCap = slots.length > MAX_BUNDLE_ITEMS;
  const needsVariantCount = slots.filter((s) => {
    const p = productById.get(s.productId);
    return !!p && p.variants.length > 0 && !s.variantId;
  }).length;

  const components = slots
    .map((s) => {
      const p = productById.get(s.productId);
      if (!p) return null;
      const variant = s.variantId
        ? p.variants.find((v) => v.id === s.variantId)
        : undefined;
      const priceAmount = variant?.priceAmount ?? p.priceAmount;
      return { priceAmount, quantity: s.quantity };
    })
    .filter((x): x is { priceAmount: number; quantity: number } => x !== null);
  const savings = bundleSavings(bundle.priceAmount, components);

  function toggleNoVariantProduct(id: string) {
    setSlots((prev) => {
      const has = prev.some((s) => s.productId === id);
      if (has) return prev.filter((s) => s.productId !== id);
      return [...prev, { productId: id, variantId: null, quantity: 1 }];
    });
  }
  function toggleVariantSlot(productId: string, variantId: string) {
    setSlots((prev) => {
      const idx = prev.findIndex(
        (s) => s.productId === productId && s.variantId === variantId,
      );
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, { productId, variantId, quantity: 1 }];
    });
  }
  function removeSlotAt(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }
  function step(index: number, delta: 1 | -1) {
    setSlots((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, quantity: Math.max(1, s.quantity + delta) } : s,
      ),
    );
  }

  return (
    <View className="mt-3 border-t border-shell-border pt-3">
      <Text className="mb-2 text-xs text-shell-dim">
        Tap the products in this bundle, then set how many. A product with
        options needs a variant chosen for each one you add.
      </Text>
      {products.map((p) => {
        const hasVariants = p.variants.length > 0;
        const productSlots = slots
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => s.productId === p.id);

        if (!hasVariants) {
          const on = productSlots.length > 0;
          const index = productSlots[0]?.i ?? -1;
          return (
            <View key={p.id} className="mb-1.5 flex-row items-center gap-2">
              <View className="flex-1">
                <FilterChip
                  label={`${p.title}  ${formatPrice(p.priceAmount, bundle.currency)}`}
                  selected={on}
                  onPress={() => toggleNoVariantProduct(p.id)}
                />
              </View>
              {on ? (
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => step(index, -1)}
                    accessibilityLabel={`Fewer ${p.title}`}
                    className="h-8 w-8 items-center justify-center rounded-full border border-shell-border active:opacity-60"
                  >
                    <Text className="text-shell-text">-</Text>
                  </Pressable>
                  <Text className="w-5 text-center text-sm text-shell-text">
                    {slots[index]?.quantity ?? 1}
                  </Text>
                  <Pressable
                    onPress={() => step(index, 1)}
                    accessibilityLabel={`More ${p.title}`}
                    className="h-8 w-8 items-center justify-center rounded-full border border-shell-border active:opacity-60"
                  >
                    <Text className="text-shell-text">+</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }

        // Variant-bearing product: one chip per ACTIVE variant, each an
        // independent slot toggle.
        return (
          <View key={p.id} className="mb-1.5">
            <Text className="mb-1 text-xs text-shell-text">{p.title}</Text>
            {p.variants.map((v) => {
              const slotIndex = slots.findIndex(
                (s) => s.productId === p.id && s.variantId === v.id,
              );
              const on = slotIndex >= 0;
              return (
                <View
                  key={v.id}
                  className="mb-1 flex-row items-center gap-2 pl-2"
                >
                  <View className="flex-1">
                    <FilterChip
                      label={`${v.name}  ${formatPrice(v.priceAmount ?? p.priceAmount, bundle.currency)}`}
                      selected={on}
                      onPress={() => toggleVariantSlot(p.id, v.id)}
                    />
                  </View>
                  {on ? (
                    <View className="flex-row items-center gap-2">
                      <Pressable
                        onPress={() => step(slotIndex, -1)}
                        accessibilityLabel={`Fewer ${p.title} ${v.name}`}
                        className="h-8 w-8 items-center justify-center rounded-full border border-shell-border active:opacity-60"
                      >
                        <Text className="text-shell-text">-</Text>
                      </Pressable>
                      <Text className="w-5 text-center text-sm text-shell-text">
                        {slots[slotIndex]?.quantity ?? 1}
                      </Text>
                      <Pressable
                        onPress={() => step(slotIndex, 1)}
                        accessibilityLabel={`More ${p.title} ${v.name}`}
                        className="h-8 w-8 items-center justify-center rounded-full border border-shell-border active:opacity-60"
                      >
                        <Text className="text-shell-text">+</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
            {(() => {
              // An EXISTING slot with no variant, on a product that now HAS
              // active variants: invisible in the chip list above (no chip
              // maps to a null variantId), so it needs its own callout or the
              // artist could never see or clear it (FD6 editor requirement:
              // surface as "needs a variant", never silently break).
              const orphanIndex = slots.findIndex(
                (s) => s.productId === p.id && s.variantId === null,
              );
              if (orphanIndex < 0) return null;
              return (
                <View className="mb-1 flex-row items-center gap-2 pl-2">
                  <Text className="flex-1 text-xs text-danger">
                    An existing item here needs a variant chosen.
                  </Text>
                  <Pressable
                    onPress={() => removeSlotAt(orphanIndex)}
                    accessibilityLabel={`Remove the unresolved ${p.title} item`}
                  >
                    <Text className="text-xs text-shell-dim underline">
                      Remove
                    </Text>
                  </Pressable>
                </View>
              );
            })()}
          </View>
        );
      })}

      {slots.length > 0 ? (
        <Text className="mt-1 text-xs text-shell-dim">
          {savings.isSaving
            ? `Bundle ${formatPrice(bundle.priceAmount, bundle.currency)}, parts ${formatPrice(savings.componentTotal, bundle.currency)}. Save ${formatPrice(savings.savingsAmount, bundle.currency)} (${savings.savingsPercent}%).`
            : `Bundle ${formatPrice(bundle.priceAmount, bundle.currency)}, parts ${formatPrice(savings.componentTotal, bundle.currency)}. Not cheaper than the parts.`}
        </Text>
      ) : null}
      {overCap ? (
        <Text className="mt-1 text-xs text-danger">
          A bundle can hold at most {MAX_BUNDLE_ITEMS} products.
        </Text>
      ) : null}
      {needsVariantCount > 0 ? (
        <Text className="mt-1 text-xs text-danger">
          Choose a variant for every highlighted product before saving.
        </Text>
      ) : null}

      <View className="mt-3">
        <Button
          label="Save products"
          disabled={busy || overCap || needsVariantCount > 0}
          onPress={() =>
            onSave(
              slots.map((s) => ({
                productId: s.productId,
                quantity: s.quantity,
                variantId: s.variantId,
              })),
            )
          }
        />
      </View>
    </View>
  );
}
