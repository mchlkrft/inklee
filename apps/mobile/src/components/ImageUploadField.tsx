import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { apiUpload } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import type { MobileImageUpload } from "@inklee/shared/mobile-api";

/** RN file descriptor for a picked image, as apiUpload expects it. */
export type PickedImage = { uri: string; name: string; type: string };

// Pick a photo from the library (compressed on-device via the picker's quality)
// and either upload it immediately to a mobile multipart endpoint (eager mode:
// pass `endpoint`) or hand the picked file to the parent for a later upload
// (deferred mode: pass `onPick` — the goods create flow uploads after the
// product exists, with a local file:// preview in the meantime). Shows the
// current/just-picked image as a thumbnail. Used for logo / flash / goods.
export function ImageUploadField({
  label,
  imageUrl,
  endpoint,
  onPick,
  aspect = [1, 1],
  shape = "square",
  maxBytes = 4 * 1024 * 1024,
  hint,
  hero = false,
  onUploaded,
}: {
  label: string;
  imageUrl: string | null;
  /** Eager mode: multipart endpoint to upload to on pick. */
  endpoint?: string;
  /** Deferred mode: receive the picked file instead of uploading. */
  onPick?: (file: PickedImage) => void;
  aspect?: [number, number];
  shape?: "square" | "circle";
  /** Client-side size cap — mirror the matching server route's limit so an
   *  oversized photo fails with a clear message before it leaves the device. */
  maxBytes?: number;
  /** Muted helper line under the field (format / size / resize note). */
  hint?: string;
  /** Full-width tall preview (the image IS the content, e.g. a flash design)
   *  instead of the small avatar-style square. */
  hero?: boolean;
  onUploaded?: (url: string) => void;
}) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(imageUrl);
  const maxLabel = `${Math.round(maxBytes / (1024 * 1024))} MB`;

  async function pick() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Allow photo access to upload an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect,
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    // Match the server cap (and stay under the platform body limit) so an
    // oversized photo fails with a clear message instead of a generic upload
    // error from the platform rejecting the body.
    if (asset.fileSize && asset.fileSize > maxBytes) {
      setError(
        `That image is too large (max ${maxLabel}). Try a smaller photo.`,
      );
      return;
    }
    const file: PickedImage = {
      uri: asset.uri,
      name: asset.fileName ?? "upload.jpg",
      type: asset.mimeType ?? "image/jpeg",
    };
    if (onPick) {
      // Deferred: instant local preview (expo-image renders file:// URIs); the
      // parent owns the actual upload.
      setLocalUrl(asset.uri);
      onPick(file);
      return;
    }
    if (!endpoint) return;
    setBusy(true);
    try {
      const { url } = await apiUpload<MobileImageUpload>(endpoint, file);
      setLocalUrl(url);
      onUploaded?.(url);
    } catch (e) {
      captureError(e, { op: "imageUpload", endpoint });
      setError(
        e instanceof Error && /too large/i.test(e.message)
          ? "That image is too large."
          : "Couldn't upload. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const size = 96;
  const radius = shape === "circle" ? size / 2 : 16;
  const imageStyle = hero
    ? { width: "100%" as const, height: 260, borderRadius: 20 }
    : { width: size, height: size, borderRadius: radius };

  return (
    <View className={`mb-4 ${hero ? "" : "items-center"}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: choose a photo`}
        onPress={pick}
        disabled={busy}
        className={`${hero ? "" : "items-center"} active:opacity-80`}
      >
        {localUrl ? (
          <Image source={{ uri: localUrl }} style={imageStyle} contentFit="cover" />
        ) : (
          <View
            style={imageStyle}
            className="items-center justify-center border border-shell-border bg-glass"
          >
            <Ionicons
              name="camera-outline"
              size={hero ? 40 : 28}
              color={colors.shell.mute}
            />
            {hero ? (
              <Text className="mt-2 text-sm text-shell-dim">
                Add the design photo
              </Text>
            ) : null}
          </View>
        )}
        <View className="mt-2 h-5 items-center justify-center">
          {busy ? (
            <ActivityIndicator color={colors.mustard} />
          ) : (
            <Text className="text-sm font-medium text-mustard">
              {localUrl ? "Change photo" : "Add photo"}
            </Text>
          )}
        </View>
      </Pressable>
      {error ? (
        <Text className="mt-1 text-xs text-danger">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-shell-dim">{hint}</Text>
      ) : null}
    </View>
  );
}
