import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Pencil } from "lucide-react-native";
import { apiDelete, apiUpload } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";
import type { MobileImageUpload } from "@inklee/shared/mobile-api";

// Mirror the cover half of the web profile form: the server route caps uploads
// at 4 MB (readImageFile), kept under the platform body limit.
const MAX_BYTES = 4 * 1024 * 1024;

// Wide (16:6) public-page cover upload — the native mirror of the web profile
// form's cover block: live preview over a fixed charcoal box, Upload/Replace +
// Remove pills, and the selected cover color showing through when no image is
// set. Upload and remove hit /settings/profile/cover immediately (the same
// eager pattern as the logo field); the parent refreshes the cached profile
// via onChanged.
//
// Founder round 7: the cover imitates the public page header. The action row
// lives at the TOP of the cover (pen toggles the parent's color palette into
// that row), and the `overlap` slot hangs centered over the cover's bottom
// edge — the profile photo sits half on, half off, like the client-side view.
export function CoverImageField({
  imageUrl,
  fallbackColor,
  onChanged,
  colorPicker,
  paletteOpen = false,
  onTogglePalette,
  overlap,
}: {
  imageUrl: string | null;
  /** Resolved hex of the selected cover color (null = plain charcoal). */
  fallbackColor: string | null;
  onChanged?: (url: string | null) => void;
  /** Swatch row shown inside the cover while paletteOpen (pen icon toggles). */
  colorPicker?: ReactNode;
  paletteOpen?: boolean;
  /** Renders the pen toggle when provided. */
  onTogglePalette?: () => void;
  /** Content centered over the cover's bottom edge (the profile photo) —
   *  pulled up by half its 96px height so the edge bisects it. */
  overlap?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(imageUrl);

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
      aspect: [16, 6],
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      setError("That image is too large (max 4 MB). Try a smaller photo.");
      return;
    }
    setBusy(true);
    try {
      const { url } = await apiUpload<MobileImageUpload>(
        "/settings/profile/cover",
        {
          uri: asset.uri,
          name: asset.fileName ?? "cover.jpg",
          type: asset.mimeType ?? "image/jpeg",
        },
      );
      setLocalUrl(url);
      onChanged?.(url);
    } catch (e) {
      captureError(e, { op: "coverUpload" });
      setError(
        e instanceof Error && /too large/i.test(e.message)
          ? "That image is too large."
          : "Couldn't upload. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await apiDelete("/settings/profile/cover");
      setLocalUrl(null);
      onChanged?.(null);
    } catch (e) {
      captureError(e, { op: "coverRemove" });
      setError("Couldn't remove the cover. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mb-3">
      <View
        className="h-32 w-full overflow-hidden rounded-2xl border border-shell-border"
        style={{ backgroundColor: colors.charcoal }}
      >
        {localUrl ? (
          <Image
            source={{ uri: localUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        ) : fallbackColor ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: fallbackColor },
            ]}
          />
        ) : null}
        {/* Actions sit at the TOP so the bottom edge stays clear for the
            overlapping profile photo. */}
        <View className="flex-row items-start justify-between p-3">
          <View className="flex-1 flex-row items-center pr-2">
            {paletteOpen && colorPicker ? (
              <View
                className="flex-row items-center gap-1.5 rounded-full px-2 py-1"
                style={{ backgroundColor: "rgba(30,30,30,0.6)" }}
              >
                {colorPicker}
              </View>
            ) : (
              <View
                className="rounded-full px-2.5 py-1"
                style={{ backgroundColor: "rgba(30,30,30,0.6)" }}
              >
                <Text className="text-xs font-medium text-bone">Preview</Text>
              </View>
            )}
          </View>
          <View className="flex-row items-center gap-2">
            {paletteOpen ? null : busy ? (
              <ActivityIndicator color={colors.bone} />
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    localUrl ? "Replace cover image" : "Upload a cover image"
                  }
                  onPress={pick}
                  className="h-8 items-center justify-center rounded-full px-4 active:opacity-80"
                  style={{ backgroundColor: colors.bone }}
                >
                  <Text className="text-xs font-medium text-charcoal">
                    {localUrl ? "Replace" : "Upload"}
                  </Text>
                </Pressable>
                {localUrl ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove cover image"
                    onPress={remove}
                    className="h-8 items-center justify-center rounded-full px-4 active:opacity-80"
                    style={{ backgroundColor: "rgba(30,30,30,0.6)" }}
                  >
                    <Text className="text-xs font-medium text-bone">
                      Remove
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
            {onTogglePalette ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  paletteOpen ? "Close the color picker" : "Edit cover color"
                }
                onPress={onTogglePalette}
                hitSlop={6}
                className="h-8 w-8 items-center justify-center rounded-full active:opacity-80"
                style={{
                  backgroundColor: paletteOpen
                    ? colors.bone
                    : "rgba(30,30,30,0.6)",
                }}
              >
                <Pencil
                  size={14}
                  color={paletteOpen ? colors.charcoal : colors.bone}
                />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      {overlap ? (
        <View className="items-center" style={{ marginTop: -48, zIndex: 10 }}>
          {overlap}
        </View>
      ) : null}
      {/* No standing format hint (founder round 5: less tiny explanation) —
          the size/format caps surface through the error path when hit. */}
      {error ? (
        <Text className="mt-1 text-sm text-danger-fg">{error}</Text>
      ) : null}
    </View>
  );
}
