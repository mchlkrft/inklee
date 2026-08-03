import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ArrowDown, ArrowUp, RefreshCw, Trash2, X } from "lucide-react-native";
import { TextField } from "@/components/TextField";
import { IconButton } from "@/components/IconButton";
import { FilterChip } from "@/components/Chip";
import { apiUpload } from "@/lib/api";
import { planBoundaryMessage } from "@/lib/plan-errors";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import {
  MAX_GALLERY_IMAGES,
  MAX_GALLERY_CAPTION,
  type BioGalleryImage,
  type BioImageGalleryBlock,
} from "@inklee/shared/bio-page";
import type { MobileImageUpload } from "@inklee/shared/mobile-api";

// Native Link Hub image-gallery editor (founder ruling FD2, 2026-08-01,
// SUPERSEDES D4's web-only-editing-v1 deferral): the app gets FULL gallery
// editing parity — device upload, delete, reorder, captions, layout, and the
// entitlement/downgrade states — layout of the CONTROLS need not match the
// web editor (`link-hub/bio-page-form.tsx`), only the core functionality.
//
// Deliberately NOT ported: web's "Import from URL" (FD4). That path spends
// Inklee's own egress under an SSRF guard + a per-artist rate limit; FD2's
// required scope is device upload, deletion, reordering, captions,
// visibility, entitlement states, progress, retry, unsupported-file
// handling, empty states, and safe render — it does not name a native import
// affordance, so this is a scope cut, not an oversight.
//
// Uploads go through POST /api/mobile/settings/hub/gallery-image (out of
// band from the settings save, mirroring the web action): this component
// only stores images into LOCAL block state via `onImagesChange` /
// `onLayoutChange`. The parent screen's normal "Save Link Hub" persists it
// through POST /api/mobile/settings/hub, which is also where the FD1
// entitlement gate (gateMediaBlocksForSave) and the orphan-cleanup sweep
// (removeDroppedHubImages) already run — so a removed image here is actually
// deleted from storage once the artist saves, exactly like the web editor.

const MAX_BYTES = 4 * 1024 * 1024; // mirrors the server's readImageFile cap

type PendingUpload = {
  file: { uri: string; name: string; type: string };
  status: "uploading" | "error";
  error?: string;
};

/** A block still on Plus can be edited fully; a downgraded one renders
 *  read-only (D2: hide-on-downgrade, never delete) — mirrors the web
 *  editor's locked card exactly (bio-page-form.tsx). */
export function GalleryBlockEditor({
  block,
  richBlocksAllowed,
  onImagesChange,
  onLayoutChange,
}: {
  block: BioImageGalleryBlock;
  richBlocksAllowed: boolean;
  onImagesChange: (images: BioGalleryImage[]) => void;
  onLayoutChange: (layout: "grid" | "carousel") => void;
}) {
  const colors = useColors();
  // Defensive: a corrupted/legacy row should render as an empty gallery, not
  // crash the screen (the "safe render" requirement in FD2's scope).
  const images = Array.isArray(block.images) ? block.images : [];
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const patchImage = (index: number, patch: Partial<BioGalleryImage>) =>
    onImagesChange(
      images.map((img, i) => (i === index ? { ...img, ...patch } : img)),
    );
  const removeImage = (index: number) =>
    onImagesChange(images.filter((_, i) => i !== index));
  const moveImage = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onImagesChange(next);
  };

  async function doUpload(file: PendingUpload["file"]) {
    setPending({ file, status: "uploading" });
    try {
      const { url, signedUrl } = await apiUpload<MobileImageUpload>(
        "/settings/hub/gallery-image",
        file,
      );
      setPending(null);
      if (images.length < MAX_GALLERY_IMAGES) {
        // Carry the upload-time signature so the thumbnail appears now (0151:
        // `url` is a private-bucket URL and renders nothing on its own). The
        // parser drops `signedUrl` on save, so this never reaches storage.
        onImagesChange([...images, { url, signedUrl }]);
      }
    } catch (e) {
      captureError(e, { op: "hubGalleryUpload" });
      // Route entitlement/ceiling errors through the IAP-safe helper (D17):
      // the server's raw message is written for the web, where "Upgrade to
      // Plus" is fine to say; every other failure (bad file type, too large,
      // upload failure) is already app-safe and passes through unchanged.
      setPending({
        file,
        status: "error",
        error: planBoundaryMessage(e, "Couldn't upload. Try again."),
      });
    }
  }

  async function pick() {
    setPickError(null);
    if (images.length >= MAX_GALLERY_IMAGES || pending) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPickError("Allow photo access to upload an image.");
      return;
    }
    // No forced crop/aspect: the server keeps the original aspect
    // (`fit:"inside"`), matching the web editor's uncropped uploads — a
    // gallery is meant to hold the artist's images as shot.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      setPickError("That image is too large (max 4 MB). Try a smaller photo.");
      return;
    }
    void doUpload({
      uri: asset.uri,
      name: asset.fileName ?? "image.jpg",
      type: asset.mimeType ?? "image/jpeg",
    });
  }

  if (!richBlocksAllowed) {
    return (
      <View className="mt-2 rounded-xl border-brand border-shell-border bg-glass p-3">
        <View className="mb-1.5 flex-row items-center gap-2">
          <Text className="text-xs font-medium text-foreground">
            Image gallery
          </Text>
          <View className="rounded-full bg-mustard/20 px-1.5 py-0.5">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-accent">
              Plus
            </Text>
          </View>
          <Text className="text-xs text-shell-dim">(locked)</Text>
        </View>
        <Text className="text-xs text-shell-dim">
          {images.length} image{images.length === 1 ? "" : "s"} saved. Editing
          image galleries is a Plus feature. Your images are kept and show on
          your page while you are on Plus. You can still remove this block, and
          everything is in your data export.
        </Text>
        {images.length > 0 ? (
          <View className="mt-2">
            {images.map((img, i) => (
              <Text
                key={`${img.url}-${i}`}
                numberOfLines={1}
                className="text-xs text-shell-dim"
              >
                {img.caption?.trim() ? img.caption : img.url}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View className="mt-2">
      <View className="mb-2 flex-row items-center gap-2">
        <Text className="text-xs text-shell-dim">Layout</Text>
        <FilterChip
          label="Grid"
          selected={block.layout === "grid"}
          onPress={() => onLayoutChange("grid")}
        />
        <FilterChip
          label="Carousel"
          selected={block.layout === "carousel"}
          onPress={() => onLayoutChange("carousel")}
        />
      </View>

      {images.length === 0 ? (
        <Text className="mb-2 text-xs text-shell-dim">
          No images yet. Add one below. An empty gallery is not saved.
        </Text>
      ) : null}

      {images.map((img, i) => (
        <View
          key={`${img.url}-${i}`}
          className="mb-2 flex-row items-start gap-2 rounded-xl border-brand border-shell-border p-2"
        >
          {/* 0151 (LO-5 DPIA R4): gallery objects are private, so only the
              short-lived `signedUrl` the route attaches is renderable. NO
              fallback to `img.url`: it would render nothing anyway, and a
              fallback here is how the web side would quietly regain one too.
              An older app build that never reads `signedUrl` shows an empty
              frame, which is acceptable because the gallery capability has
              never been granted to any artist. */}
          {img.signedUrl ? (
            <Image
              source={{ uri: img.signedUrl }}
              style={{ width: 56, height: 56, borderRadius: 10 }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{ width: 56, height: 56, borderRadius: 10 }}
              className="bg-shell-border"
            />
          )}
          <View className="flex-1">
            <TextField
              value={img.caption ?? ""}
              onChangeText={(v) =>
                patchImage(i, { caption: v.slice(0, MAX_GALLERY_CAPTION) })
              }
              placeholder="Caption (optional)"
              accessibilityLabel={`Caption for image ${i + 1}`}
            />
          </View>
          <View className="flex-row items-center gap-1">
            <IconButton
              icon={ArrowUp}
              label="Move image up"
              outlined
              iconSize={14}
              disabled={i === 0}
              onPress={() => moveImage(i, -1)}
            />
            <IconButton
              icon={ArrowDown}
              label="Move image down"
              outlined
              iconSize={14}
              disabled={i === images.length - 1}
              onPress={() => moveImage(i, 1)}
            />
            <IconButton
              icon={Trash2}
              label="Remove image"
              outlined
              iconSize={14}
              onPress={() => removeImage(i)}
            />
          </View>
        </View>
      ))}

      {pending ? (
        <View className="mb-2 flex-row items-center gap-2 rounded-xl border-brand border-shell-border p-2">
          <Image
            source={{ uri: pending.file.uri }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 10,
              opacity: pending.status === "uploading" ? 0.5 : 1,
            }}
            contentFit="cover"
          />
          <View className="flex-1">
            {pending.status === "uploading" ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color={colors.accent} />
                <Text className="text-xs text-shell-dim">Uploading…</Text>
              </View>
            ) : (
              <Text className="text-xs text-danger-fg">{pending.error}</Text>
            )}
          </View>
          {pending.status === "error" ? (
            <View className="flex-row items-center gap-1">
              <IconButton
                icon={RefreshCw}
                label="Retry upload"
                outlined
                iconSize={14}
                onPress={() => void doUpload(pending.file)}
              />
              <IconButton
                icon={X}
                label="Discard this photo"
                outlined
                iconSize={14}
                onPress={() => setPending(null)}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {pickError ? (
        <Text className="mb-2 text-xs text-danger-fg">{pickError}</Text>
      ) : null}

      {images.length < MAX_GALLERY_IMAGES && !pending ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a gallery image"
          onPress={() => void pick()}
          className="flex-row items-center justify-center gap-1.5 rounded-xl border-brand border-shell-border bg-glass py-2.5 active:opacity-80"
          style={{ borderStyle: "dashed" }}
        >
          <Ionicons name="camera-outline" size={16} color={colors.shell.mute} />
          <Text className="text-xs font-medium text-foreground">Add image</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
