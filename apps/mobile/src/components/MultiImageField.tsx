import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { X } from "lucide-react-native";
import { apiDelete, apiUpload } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { colors as staticColors } from "@/lib/tokens";
import type { MobileImageUpload } from "@inklee/shared/mobile-api";
import type { PickedImage } from "@/components/ImageUploadField";

// Mirror the server cap (readImageFile): oversized photos fail client-side
// with a clear message instead of a generic body-limit error.
const MAX_BYTES = 4 * 1024 * 1024;

// Multi-image grid for the goods editor — the native port of the web product
// form's thumbnail grid: square tiles in pick order (the FIRST is the hero
// everywhere), a per-tile X remove, one dashed "Add" tile while under the cap,
// and an "N / max" counter. Two modes, like ImageUploadField:
//   EAGER (edit): `endpoint` set — each pick uploads immediately (append mode
//   so order is preserved), X deletes server-side; `onChanged` lets the parent
//   drop/refresh caches.
//   DEFERRED (create): `pending` + `onPendingChange` — picks queue as local
//   file:// previews; the parent uploads after the product row exists.
export function MultiImageField({
  label = "Images",
  max,
  capHint,
  imageUrls,
  endpoint,
  removeEndpoint,
  onChanged,
  pending,
  onPendingChange,
}: {
  label?: string;
  /** Live image cap (3, or variant count + 1 — the shared rule). */
  max: number;
  /** Helper line under the grid explaining the cap. */
  capHint?: string;
  /** EAGER mode: the server image list this product currently has. */
  imageUrls?: string[];
  /** EAGER mode: multipart POST endpoint (append mode is added here). */
  endpoint?: string;
  /** EAGER mode: DELETE endpoint taking { url }. */
  removeEndpoint?: string;
  /** EAGER mode: fired after a server write with the new URL list (the parent
   *  syncs its cap state and patches the cached detail IN PLACE — never
   *  removeQueries while the form observes the key, or a re-render unmounts
   *  it and wipes unsaved edits). */
  onChanged?: (urls: string[]) => void;
  /** DEFERRED mode: queued picks (parent owns the state). */
  pending?: PickedImage[];
  onPendingChange?: (next: PickedImage[]) => void;
}) {
  const themed = useColors();
  const eager = !!endpoint;
  const [urls, setUrls] = useState<string[]>(imageUrls ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items: { key: string; uri: string; url?: string; index: number }[] =
    eager
      ? urls.map((u, i) => ({ key: u, uri: u, url: u, index: i }))
      : (pending ?? []).map((p, i) => ({ key: `${p.uri}-${i}`, uri: p.uri, index: i }));
  const count = items.length;

  async function pick() {
    setError(null);
    if (count >= max) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Allow photo access to upload an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      setError("That image is too large (max 4 MB). Try a smaller photo.");
      return;
    }
    const file: PickedImage = {
      uri: asset.uri,
      name: asset.fileName ?? "image.jpg",
      type: asset.mimeType ?? "image/jpeg",
    };

    if (!eager) {
      onPendingChange?.([...(pending ?? []), file]);
      return;
    }
    setBusy(true);
    try {
      // Append so pick order is preserved (web parity: keep ++ new).
      const { url } = await apiUpload<MobileImageUpload>(
        `${endpoint}?append=1`,
        file,
      );
      setUrls((cur) => {
        const next = [...cur, url];
        onChanged?.(next);
        return next;
      });
    } catch (e) {
      captureError(e, { op: "productImageUpload" });
      setError(
        e instanceof Error && /at most/i.test(e.message)
          ? e.message
          : "Couldn't upload. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeAt(index: number) {
    setError(null);
    if (!eager) {
      const next = [...(pending ?? [])];
      next.splice(index, 1);
      onPendingChange?.(next);
      return;
    }
    const url = urls[index];
    if (!url || !removeEndpoint) return;
    setBusy(true);
    try {
      await apiDelete(removeEndpoint, { url });
      setUrls((cur) => {
        const next = cur.filter((u) => u !== url);
        onChanged?.(next);
        return next;
      });
    } catch (e) {
      captureError(e, { op: "productImageRemove" });
      setError("Couldn't remove the image. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mb-4">
      <View className="mb-1.5 flex-row items-center justify-between">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        <Text className="text-xs text-shell-dim">
          {count} / {max}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {items.map((item) => (
          <View key={item.key} className="relative aspect-square w-[31%]">
            <Image
              source={{ uri: item.uri }}
              style={{ width: "100%", height: "100%", borderRadius: 14 }}
              contentFit="cover"
              transition={150}
            />
            {item.index === 0 ? (
              <View
                className="absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5"
                style={{ backgroundColor: "rgba(30,30,30,0.7)" }}
              >
                <Text className="text-[10px] font-medium text-bone">Main</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove image ${item.index + 1}`}
              onPress={() => void removeAt(item.index)}
              disabled={busy}
              hitSlop={8}
              className="absolute right-1.5 top-1.5 h-7 w-7 items-center justify-center rounded-full active:opacity-80"
              style={{ backgroundColor: "rgba(30,30,30,0.7)" }}
            >
              <X size={14} color={staticColors.bone} />
            </Pressable>
          </View>
        ))}
        {count < max ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add an image"
            onPress={() => void pick()}
            disabled={busy}
            className="aspect-square w-[31%] items-center justify-center rounded-2xl border border-shell-border bg-glass active:opacity-80"
            style={{ borderStyle: "dashed" }}
          >
            {busy ? (
              <ActivityIndicator color={themed.accent} />
            ) : (
              <>
                <Ionicons
                  name="camera-outline"
                  size={24}
                  color={themed.shell.mute}
                />
                <Text className="mt-1 text-xs text-shell-dim">Add</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
      {capHint ? (
        <Text className="mt-1.5 text-xs text-shell-dim">{capHint}</Text>
      ) : null}
      {error ? (
        <Text className="mt-1 text-xs text-danger-fg">{error}</Text>
      ) : null}
    </View>
  );
}
