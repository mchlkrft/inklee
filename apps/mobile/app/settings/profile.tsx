import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { TextArea } from "@/components/TextArea";
import { getCalendars } from "expo-localization";
import * as WebBrowser from "expo-web-browser";
import { ArrowUpRight } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileProfile } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ImageUploadField } from "@/components/ImageUploadField";
import { CoverImageField } from "@/components/CoverImageField";
import { TimezoneField } from "@/components/TimezoneField";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, invalidateIdentity } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { config } from "@/lib/config";
import { colors } from "@/lib/tokens";
import { useColors } from "@/lib/theme";

const BIO_MAX = 280;
// Align with the web logo cap (2 MB); the cover field has its own 4 MB cap.
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// Brand swatches for the public-page cover (mirrors the web profile form's
// COVER_COLORS; the ids are what sanitizeCoverColor accepts server-side).
const COVER_COLORS = [
  { id: "mustard", hex: "#e9b22b", label: "Mustard" },
  { id: "rosa", hex: "#db88b9", label: "Rosa" },
  { id: "cobalt", hex: "#0b3d9f", label: "Cobalt" },
  { id: "red", hex: "#cf2e2c", label: "Red" },
  { id: "green", hex: "#105f2d", label: "Green" },
] as const;

export default function EditProfile() {
  const q = useApiQuery<MobileProfile>("/settings/profile");

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
          ) : (
            <ErrorState
              title="Couldn't load your profile"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <ProfileForm initial={q.data} />;
}

function ProfileForm({ initial }: { initial: MobileProfile }) {
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [instagram, setInstagram] = useState(initial.instagramHandle ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [timezone, setTimezone] = useState(initial.timezone ?? "");
  const [coverColor, setCoverColor] = useState(initial.coverColor ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deviceTz = getCalendars()[0]?.timeZone ?? null;
  const previewUrl = initial.slug ? config.publicUrl(initial.slug) : null;

  // Resolved hex behind the cover preview when no image is set: a swatch id
  // maps to its brand hex; a raw #hex saved on web passes through.
  const coverHex = coverColor
    ? (COVER_COLORS.find((c) => c.id === coverColor)?.hex ??
      (coverColor.startsWith("#") ? coverColor : null))
    : null;

  async function save() {
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await apiPost("/settings/profile", {
        displayName: displayName.trim(),
        bio: bio.trim(),
        instagramHandle: instagram.trim(),
        location: location.trim(),
        timezone: timezone.trim() || undefined,
        // Always sent, like the web form's hidden input: "" clears the color.
        coverColor,
      });
      await invalidateIdentity(queryClient); // /me + /home + /settings/profile
      setSaved(true);
    } catch (e) {
      captureError(e, { op: "saveProfile" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
      >
        {previewUrl ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void WebBrowser.openBrowserAsync(previewUrl);
            }}
            className="mb-3 flex-row items-center justify-center gap-1 active:opacity-70"
          >
            <Text className="text-sm font-medium text-mustard">
              Preview public page
            </Text>
            <ArrowUpRight size={14} color={colors.mustard} />
          </Pressable>
        ) : null}

        <ImageUploadField
          label="Logo"
          imageUrl={initial.logoUrl}
          endpoint="/settings/profile/logo"
          shape="circle"
          maxBytes={MAX_LOGO_BYTES}
          hint="PNG, JPG, or WebP - max 2 MB - resized to 512x512"
          onUploaded={() => invalidateIdentity(queryClient)}
        />

        <Text className="mb-1.5 text-sm font-medium text-foreground">
          Cover image
        </Text>
        <Text className="mb-1.5 text-xs text-shell-dim">
          Shown behind your name on your public booking page. Falls back to
          your cover color or charcoal.
        </Text>
        <CoverImageField
          imageUrl={initial.coverImageUrl}
          fallbackColor={coverHex}
          onChanged={() => invalidateIdentity(queryClient)}
        />

        <Text className="mb-1.5 text-sm font-medium text-foreground">
          Cover color
        </Text>
        <Text className="mb-1.5 text-xs text-shell-dim">
          Used when no cover image is set.
        </Text>
        <View className="mb-4 flex-row flex-wrap items-center gap-2">
          <CoverSwatch
            label="None"
            hex={colors.charcoal}
            selected={coverColor === ""}
            onPress={() => setCoverColor("")}
          />
          {COVER_COLORS.map((swatch) => (
            <CoverSwatch
              key={swatch.id}
              label={swatch.label}
              hex={swatch.hex}
              selected={coverColor === swatch.id}
              onPress={() => setCoverColor(swatch.id)}
            />
          ))}
        </View>

        <TextField
          label="Artist / studio name"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
        />

        <Text className="mb-1.5 text-sm font-medium text-foreground">Bio</Text>
        <TextArea
          value={bio}
          onChangeText={setBio}
          maxLength={BIO_MAX}
          placeholder="A short line clients see on your page"
          minHeight={72}
          showCounter
        />

        <TextField
          label="Instagram"
          value={instagram}
          onChangeText={setInstagram}
          placeholder="yourhandle"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          leftSlot={<Text className="text-base text-shell-dim">@</Text>}
        />
        <TextField
          label="Location"
          value={location}
          onChangeText={setLocation}
          placeholder="Berlin, DE"
          autoCapitalize="words"
        />

        <TimezoneField
          value={timezone}
          onChange={setTimezone}
          deviceTz={deviceTz}
        />

        {error ? (
          <Text className="mb-3 text-sm text-danger">{error}</Text>
        ) : null}
        {saved && !error ? (
          <Text className="mb-3 text-sm text-success">Profile updated.</Text>
        ) : null}

        <Button
          label="Save"
          onPress={save}
          loading={saving}
          disabled={!displayName.trim()}
        />
      </ScrollView>
    </Screen>
  );
}

// One cover-color chip: a small color dot + label, filled when selected
// (mirrors the web swatch buttons' active state: foreground fill + background
// text).
function CoverSwatch({
  label,
  hex,
  selected,
  onPress,
}: {
  label: string;
  hex: string;
  selected: boolean;
  onPress: () => void;
}) {
  const themed = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="h-9 flex-row items-center gap-2 rounded-full px-3 active:opacity-80"
      style={
        selected
          ? { backgroundColor: themed.bone }
          : { borderWidth: 1.5, borderColor: themed.shell.border }
      }
    >
      <View className="h-3 w-3 rounded-full" style={{ backgroundColor: hex }} />
      <Text
        className="text-xs font-medium"
        style={{ color: selected ? themed.shell.bg : themed.shell.dim }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
