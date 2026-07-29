import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileCollectionList } from "@inklee/shared/mobile-api";
import {
  COLLECTION_NAME_MAX,
  canDeleteCollection,
  normalizeCollectionName,
  validateCollectionName,
} from "@inklee/shared/collections";
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

// Shop collections, native (closing the P5d parity gap). Every write posts to
// a route that calls the SAME cores the web actions use, so the entitlement
// refusal, the delete-eligibility rule and the ordering behaviour are one
// implementation rather than two that agree today.

const PATH = "/goods/collections";

/** Small state badge. Local rather than a shared component: it is two words of
 *  muted text, and the app has no Chip primitive for a non-interactive label. */
function Badge({ label }: { label: string }) {
  return (
    <Text className="rounded-full border border-shell-border px-2 py-0.5 text-xs text-shell-mute">
      {label}
    </Text>
  );
}

export default function CollectionsScreen() {
  useScreenView("goods_collections");
  const c = useColors();
  const q = useApiQuery<MobileCollectionList>(PATH);

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <ErrorState
              title="Couldn't load your collections"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <CollectionsList data={q.data} refresh={q.refresh} />;
}

function CollectionsList({
  data,
  refresh,
}: {
  data: MobileCollectionList;
  refresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = data.collections.filter((c) => !c.archivedAt);
  const archived = data.collections.filter((c) => !!c.archivedAt);
  const inCollection = new Set(
    data.memberships.map((m) => `${m.productId}:${m.collectionId}`),
  );

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
    const normalized = normalizeCollectionName(name);
    // The SAME shared rules the server applies, so the artist hears about a
    // bad name before a round trip rather than after one.
    const nameError = validateCollectionName(normalized);
    if (nameError) {
      setError(nameError);
      return;
    }
    await run("createCollection", async () => {
      await apiPost(PATH, { name: normalized });
      setName("");
      setAdding(false);
    });
  }

  function confirmDelete(id: string, label: string, count: number) {
    Alert.alert(
      `Delete "${label}"?`,
      count > 0
        ? `Its ${count} product${count === 1 ? "" : "s"} stay in your shop, just ungrouped.`
        : undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void run("deleteCollection", () =>
              apiDelete(`${PATH}?id=${encodeURIComponent(id)}`),
            ),
        },
      ],
    );
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
          Group your shop into sections. A product can be in more than one.
          Anything with no section shows at the end.
        </Text>

        {!data.entitled ? (
          <Card>
            {/* No price and no purchase step: D17 keeps the app clear of
                anything that reads as steering around IAP. */}
            <Text className="text-sm text-shell-dim">
              Collections are part of Plus. Your shop shows one list until then,
              and any sections you already made are kept.
            </Text>
          </Card>
        ) : null}

        {error ? (
          <Text className="mb-3 text-sm text-danger">{error}</Text>
        ) : null}

        <SectionLabel>Sections</SectionLabel>
        {live.length === 0 && !adding ? (
          <Text className="mb-3 text-sm text-shell-dim">
            No sections yet. Everything shows as one list.
          </Text>
        ) : null}

        {live.map((col) => (
          <View key={col.id} className="mb-2">
          <Card>
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-sm font-semibold text-shell-text">
                {col.name}
              </Text>
              {!col.isPublicVisible ? <Badge label="Hidden" /> : null}
              <Text className="text-xs text-shell-dim">
                {col.productCount === 1
                  ? "1 product"
                  : `${col.productCount} products`}
              </Text>
            </View>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <Button
                label={col.isPublicVisible ? "Hide" : "Show"}
                variant="secondary"
                size="sm"
                disabled={busy || !data.entitled}
                onPress={() =>
                  void run("toggleCollectionVisibility", () =>
                    apiPost(PATH, {
                      id: col.id,
                      isPublicVisible: !col.isPublicVisible,
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
                  void run("archiveCollection", () =>
                    apiPatch(PATH, {
                      op: "archive",
                      id: col.id,
                      archived: true,
                    }),
                  )
                }
              />
              <Button
                label="Delete"
                variant="secondary"
                size="sm"
                // Refuses in the UI for the same reason the server does:
                // membership and ordering are arranging work with no undo, so
                // archive is the reversible exit and delete waits.
                disabled={
                  busy ||
                  !data.entitled ||
                  !canDeleteCollection(
                    { ...col, archivedAt: col.archivedAt },
                    col.productCount,
                  )
                }
                onPress={() =>
                  confirmDelete(col.id, col.name, col.productCount)
                }
              />
            </View>
          </Card>
          </View>
        ))}

        {adding ? (
          <View className="mb-2">
          <Card>
            <TextField
              value={name}
              onChangeText={(v) => setName(v.slice(0, COLLECTION_NAME_MAX))}
              placeholder="e.g. Prints"
              accessibilityLabel="Collection name"
            />
            <View className="mt-3 flex-row gap-2">
              <Button label="Create" disabled={busy} onPress={() => void create()} />
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setAdding(false);
                  setName("");
                  setError(null);
                }}
              />
            </View>
          </Card>
          </View>
        ) : (
          <Button
            label="New collection"
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
              Archived sections keep their products and their order. Restore one
              and it comes back exactly as it was.
            </Text>
            {archived.map((col) => (
              <View key={col.id} className="mb-2">
              <Card>
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="text-sm font-semibold text-shell-text">
                    {col.name}
                  </Text>
                  <Badge label="Archived" />
                  <Text className="text-xs text-shell-dim">
                    {col.productCount === 1
                      ? "1 product"
                      : `${col.productCount} products`}
                  </Text>
                </View>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  <Button
                    label="Restore"
                    variant="secondary"
                    size="sm"
                    disabled={busy || !data.entitled}
                    onPress={() =>
                      void run("restoreCollection", () =>
                        apiPatch(PATH, {
                          op: "archive",
                          id: col.id,
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
                    onPress={() =>
                      confirmDelete(col.id, col.name, col.productCount)
                    }
                  />
                </View>
              </Card>
              </View>
            ))}
          </View>
        ) : null}

        {live.length > 0 && data.products.length > 0 ? (
          <View className="mt-6">
            <SectionLabel>What goes where</SectionLabel>
            <Text className="mb-2 text-xs text-shell-dim">
              Tap every section a product belongs in. It can be in several.
            </Text>
            {data.products.map((p) => (
              <View key={p.id} className="mb-2">
              <Card>
                <Text className="text-sm text-shell-text">{p.title}</Text>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {live.map((col) => {
                    const on = inCollection.has(`${p.id}:${col.id}`);
                    return (
                      <FilterChip
                        key={col.id}
                        label={col.name}
                        selected={on}
                        onPress={() =>
                          void run("toggleCollectionMembership", () =>
                            apiPatch(PATH, {
                              op: on ? "removeProduct" : "addProduct",
                              productId: p.id,
                              collectionId: col.id,
                            }),
                          )
                        }
                      />
                    );
                  })}
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
