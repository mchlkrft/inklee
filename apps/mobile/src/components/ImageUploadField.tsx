import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { apiUpload } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import type { MobileImageUpload } from "@inklee/shared/mobile-api";

// Pick a photo from the library (compressed on-device via the picker's quality),
// upload it to a mobile multipart endpoint, and surface the resulting URL. Shows
// the current/just-uploaded image as a thumbnail. Used for logo / flash / goods.
export function ImageUploadField({
  label,
  imageUrl,
  endpoint,
  aspect = [1, 1],
  shape = "square",
  onUploaded,
}: {
  label: string;
  imageUrl: string | null;
  endpoint: string;
  aspect?: [number, number];
  shape?: "square" | "circle";
  onUploaded?: (url: string) => void;
}) {
  const colors = useColors();
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
      aspect,
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    // Match the server cap (and stay under the platform body limit) so an
    // oversized photo fails with a clear message instead of a generic upload
    // error from the platform rejecting the body.
    if (asset.fileSize && asset.fileSize > 4 * 1024 * 1024) {
      setError("That image is too large (max 4 MB). Try a smaller photo.");
      return;
    }
    setBusy(true);
    try {
      const { url } = await apiUpload<MobileImageUpload>(endpoint, {
        uri: asset.uri,
        name: asset.fileName ?? "upload.jpg",
        type: asset.mimeType ?? "image/jpeg",
      });
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

  return (
    <View className="mb-4 items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} — choose a photo`}
        onPress={pick}
        disabled={busy}
        className="items-center active:opacity-80"
      >
        {localUrl ? (
          <Image
            source={{ uri: localUrl }}
            style={{ width: size, height: size, borderRadius: radius }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{ width: size, height: size, borderRadius: radius }}
            className="items-center justify-center border border-shell-border bg-glass"
          >
            <Ionicons
              name="camera-outline"
              size={28}
              color={colors.shell.mute}
            />
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
      ) : null}
    </View>
  );
}
