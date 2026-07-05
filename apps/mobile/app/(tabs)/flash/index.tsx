import { useRef, useState } from "react";
import {
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { GripVertical } from "lucide-react-native";
import type {
  MobileFlashFoldersResponse,
  MobileFlashItem,
  MobileFlashItemsResponse,
  MobileMe,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { TopBar, useTopBarHeight } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { Spiderweb } from "@/components/icons/Spiderweb";
import { BrandLoader } from "@/components/BrandLoader";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { NavCardRow } from "@/components/NavCardRow";
import { AddToFolderSheet } from "@/components/flash/AddToFolderSheet";
import { FlashItemSheet } from "@/components/flash/FlashItemSheet";
import { ManageFolderSheet } from "@/components/flash/ManageFolderSheet";
import { apiPost, apiPut, useApiQuery } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import {
  flashLabel,
  flashStatusTone,
  formatFlashPrice,
  invalidateFlash,
} from "@/lib/flash";
import { useColors } from "@/lib/theme";
import { useScrollHide } from "@/lib/scroll-hide";
import { TAB_BAR_CLEARANCE } from "@/components/BottomNav";

const ListGap = () => <View className="h-3" />;

// A measured drop target (a folder filter chip) in window coordinates.
type DropRect = {
  key: string; // "unfiled" or a folder id
  folderId: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
};

export default function FlashItemsList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const q = useApiQuery<MobileFlashItemsResponse>("/flash/items");
  const colors = useColors();
  const onScroll = useScrollHide();
  const topBarHeight = useTopBarHeight();
  const [creating, setCreating] = useState(false);
  const [folder, setFolder] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const foldersQ = useApiQuery<MobileFlashFoldersResponse>("/flash/folders");
  // Artist slug (for the detail modal's Share / public-page link).
  const me = useApiQuery<MobileMe>("/me");

  // Tap → item detail modal; long-press → "Add to folder" sheet.
  const [detailItem, setDetailItem] = useState<MobileFlashItem | null>(null);
  const [sheetItem, setSheetItem] = useState<MobileFlashItem | null>(null);
  // Long-press a real folder chip → rename/delete sheet.
  const [manageFolder, setManageFolder] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Drag-into-folder: the lifted design follows the finger as a floating clone,
  // and dropping over a folder chip moves it there. Chips are measured in window
  // coords on drag start (react-native-gesture-handler isn't installed, so the
  // drag uses RN core PanResponder via a per-row grip handle — no scroll
  // conflict and no new native build).
  const [dragItem, setDragItem] = useState<MobileFlashItem | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const dragPos = useRef(new Animated.ValueXY()).current;
  const dropRects = useRef<DropRect[]>([]);
  const dropRefs = useRef<Map<string, View>>(new Map());

  function registerDrop(key: string, node: View | null) {
    if (node) dropRefs.current.set(key, node);
    else dropRefs.current.delete(key);
  }

  function hitTest(px: number, py: number): DropRect | null {
    return (
      dropRects.current.find(
        (r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h,
      ) ?? null
    );
  }

  async function assignFolder(item: MobileFlashItem, folderId: string | null) {
    if ((item.folderId ?? null) === (folderId ?? null)) return;
    // Optimistic: patch the list so the move shows immediately.
    queryClient.setQueryData<MobileFlashItemsResponse>(
      ["api", "/flash/items"],
      (cur) =>
        cur
          ? {
              items: cur.items.map((it) =>
                it.id === item.id ? { ...it, folderId } : it,
              ),
            }
          : cur,
    );
    try {
      await apiPut(`/flash/items/${item.id}/folder`, { folderId });
      await invalidateFlash(queryClient);
    } catch (e) {
      captureError(e, { op: "moveFlashFolder" });
      q.refresh(); // roll back to the server truth
    }
  }

  function startDrag(item: MobileFlashItem, px: number, py: number) {
    setDragItem(item);
    dragPos.setValue({ x: px, y: py });
    dropRects.current = [];
    for (const [key, node] of dropRefs.current.entries()) {
      node.measureInWindow((x, y, w, h) => {
        dropRects.current = dropRects.current.filter((r) => r.key !== key);
        dropRects.current.push({
          key,
          folderId: key === "unfiled" ? null : key,
          x,
          y,
          w,
          h,
        });
      });
    }
  }

  function moveDrag(px: number, py: number) {
    dragPos.setValue({ x: px, y: py });
    const hit = hitTest(px, py);
    setHoverKey(hit ? hit.key : null);
  }

  function endDrag(px: number, py: number) {
    const hit = hitTest(px, py);
    if (hit && dragItem) void assignFolder(dragItem, hit.folderId);
    setDragItem(null);
    setHoverKey(null);
  }

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

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    setSavingFolder(true);
    try {
      const { id } = await apiPost<{ id: string }>("/flash/folders", { name });
      setNewName("");
      setNewOpen(false);
      await foldersQ.refresh();
      setFolder(id);
    } catch (e) {
      captureError(e, { op: "createFlashFolder" });
    } finally {
      setSavingFolder(false);
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

  const items = q.data.items;
  const folders = foldersQ.data?.folders ?? [];
  const unfiledCount = items.filter((i) => !i.folderId).length;
  const visible =
    folder === "all"
      ? items
      : folder === "unfiled"
        ? items.filter((i) => !i.folderId)
        : items.filter((i) => i.folderId === folder);

  // Header scrolls WITH the list (ListHeaderComponent) so the overlay TopBar
  // can reclaim its space when it hides on scroll.
  const listHeader = (
    <>
      <PageHeader title="Flash" icon={Spiderweb} iconRole="rosa" />
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

      {/* Folder filter + inline create. The Unfiled + folder chips double as
          drop targets while a design is being dragged. */}
      <View className="mt-3">
        <View className="flex-row flex-wrap gap-2">
          <FolderChip
            label={`All ${items.length}`}
            active={folder === "all"}
            onPress={() => setFolder("all")}
          />
          <FolderChip
            label={`Unfiled ${unfiledCount}`}
            active={folder === "unfiled"}
            dropHot={hoverKey === "unfiled"}
            registerRef={(n) => registerDrop("unfiled", n)}
            onPress={() => setFolder("unfiled")}
          />
          {folders.map((f) => (
            <FolderChip
              key={f.id}
              label={`${f.name} ${items.filter((i) => i.folderId === f.id).length}`}
              active={folder === f.id}
              dropHot={hoverKey === f.id}
              registerRef={(n) => registerDrop(f.id, n)}
              onPress={() => setFolder(f.id)}
              onLongPress={() => setManageFolder({ id: f.id, name: f.name })}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New folder"
            onPress={() => setNewOpen((v) => !v)}
            className="rounded-full border border-dashed border-shell-border px-3 py-1.5 active:opacity-70"
          >
            <Text className="text-sm text-shell-dim">+ New</Text>
          </Pressable>
        </View>
        {newOpen ? (
          <View className="mt-3">
            <TextField
              label="New folder"
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Neo-trad"
              autoCapitalize="words"
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  label="Create"
                  size="sm"
                  onPress={createFolder}
                  loading={savingFolder}
                  disabled={!newName.trim()}
                />
              </View>
              <Button
                label="Cancel"
                variant="secondary"
                size="sm"
                onPress={() => {
                  setNewOpen(false);
                  setNewName("");
                }}
              />
            </View>
          </View>
        ) : null}
        {folders.length > 0 ? (
          <Text className="mt-2 text-xs text-shell-mute">
            Tip: hold a design to file it or drag it by the handle onto a folder.
            Hold a folder to rename or delete it.
          </Text>
        ) : null}
      </View>

      <View className="h-2" />
    </>
  );

  return (
    <Screen edges={["left", "right"]} topBar={<TopBar />}>
      <FlatList
        data={visible}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={listHeader}
        scrollEnabled={!dragItem}
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
          items.length === 0 ? (
            <EmptyState
              title="No flash designs yet"
              subtitle="Tap New design to add your first flash."
            />
          ) : (
            <EmptyState
              title="No designs in this folder"
              subtitle="Move designs into this folder, or pick another."
            />
          )
        }
        ItemSeparatorComponent={ListGap}
        renderItem={({ item }) => (
          <FlashItemRow
            item={item}
            dragging={dragItem?.id === item.id}
            onPress={() => setDetailItem(item)}
            onLongPress={() => setSheetItem(item)}
            onDragStart={startDrag}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
          />
        )}
      />

      {/* Floating clone that tracks the finger during a drag. */}
      {dragItem ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 50,
            transform: dragPos.getTranslateTransform(),
          }}
        >
          <View style={{ marginLeft: -120, marginTop: -28, width: 220 }}>
            <DragClone item={dragItem} />
          </View>
        </Animated.View>
      ) : null}

      <FlashItemSheet
        item={detailItem}
        artistSlug={me.data?.slug ?? null}
        onClose={() => setDetailItem(null)}
        onEdit={(itemId) => {
          setDetailItem(null);
          router.push(`/flash/items/${itemId}`);
        }}
      />

      <AddToFolderSheet
        visible={sheetItem !== null}
        designTitle={sheetItem?.title ?? ""}
        folders={folders}
        currentFolderId={sheetItem?.folderId ?? null}
        onSelect={(folderId) => {
          if (sheetItem) void assignFolder(sheetItem, folderId);
          setSheetItem(null);
        }}
        onClose={() => setSheetItem(null)}
      />

      <ManageFolderSheet
        folder={manageFolder}
        onClose={() => setManageFolder(null)}
        onSaved={() => void foldersQ.refresh()}
        onDeleted={() => {
          void foldersQ.refresh();
          void invalidateFlash(queryClient);
          setFolder("all");
        }}
      />
    </Screen>
  );
}

function FlashItemRow({
  item,
  dragging,
  onPress,
  onLongPress,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  item: MobileFlashItem;
  dragging: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onDragStart: (item: MobileFlashItem, px: number, py: number) => void;
  onDragMove: (px: number, py: number) => void;
  onDragEnd: (px: number, py: number) => void;
}) {
  const colors = useColors();

  // Keep the freshest callbacks/item in a ref so the PanResponder is created
  // exactly once (useRef): a parent re-render mid-drag (e.g. a hover-highlight
  // state change) must never swap the gesture handlers on the active touch.
  const latest = useRef({ item, onDragStart, onDragMove, onDragEnd });
  latest.current = { item, onDragStart, onDragMove, onDragEnd };

  // The grip handle owns its touches (a small area), so dragging from it never
  // competes with the list's scroll or the card's tap/long-press.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) =>
        latest.current.onDragStart(
          latest.current.item,
          e.nativeEvent.pageX,
          e.nativeEvent.pageY,
        ),
      onPanResponderMove: (e) =>
        latest.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: (e) =>
        latest.current.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderTerminate: (e) =>
        latest.current.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY),
    }),
  ).current;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      className={`flex-row items-center gap-3 rounded-2xl border border-shell-border bg-glass p-3 active:opacity-80 ${
        dragging ? "opacity-40" : ""
      }`}
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
          {formatFlashPrice(item.priceType, item.price, item.currency)}
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
      {/* Drag handle: press and drag onto a folder chip to file the design. */}
      <View
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Drag to a folder"
        className="h-11 w-9 items-center justify-center active:opacity-60"
      >
        <GripVertical size={18} color={colors.shell.mute} />
      </View>
    </Pressable>
  );
}

// Compact floating card shown under the finger while dragging.
function DragClone({ item }: { item: MobileFlashItem }) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-2 rounded-2xl border border-mustard bg-charcoal p-2 shadow-lg">
      {item.previewImageUrl ? (
        <Image
          source={{ uri: item.previewImageUrl }}
          style={{ width: 40, height: 40, borderRadius: 8 }}
          contentFit="cover"
        />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-mustard/15">
          <Ionicons name="image-outline" size={18} color={colors.shell.mute} />
        </View>
      )}
      <Text
        className="flex-1 pr-1 text-sm font-semibold text-foreground"
        numberOfLines={1}
      >
        {item.title}
      </Text>
    </View>
  );
}

function FolderChip({
  label,
  active,
  dropHot,
  registerRef,
  onPress,
  onLongPress,
}: {
  label: string;
  active: boolean;
  dropHot?: boolean;
  registerRef?: (node: View | null) => void;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      ref={registerRef}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      className={`rounded-full border px-3 py-1.5 active:opacity-70 ${
        dropHot
          ? "border-mustard bg-mustard/30"
          : active
            ? "border-mustard bg-mustard"
            : "border-shell-border"
      }`}
    >
      <Text
        className={`text-sm ${active ? "font-semibold text-charcoal" : "text-shell-dim"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
