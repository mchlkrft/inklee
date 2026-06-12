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
import { ArrowUpRight, Check, Slash } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileProfile } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionLabel } from "@/components/SectionLabel";
import { TextField } from "@/components/TextField";
import { ImageUploadField } from "@/components/ImageUploadField";
import { CoverImageField } from "@/components/CoverImageField";
import { TimezoneField } from "@/components/TimezoneField";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, invalidateIdentity } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { config, displayUrl } from "@/lib/config";
import { border, tint } from "@/lib/tokens";
import { useColors } from "@/lib/theme";

const BIO_MAX = 280;
// Align with the web logo cap (2 MB); the cover field has its own 4 MB cap.
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// Brand swatches for the public-page cover (mirrors the web profile form's
// COVER_COLORS; the ids are what sanitizeCoverColor accepts server-side and
// they line up with the tint map, whose fg is the readable check color).
const COVER_COLORS = [
  { id: "mustard", hex: "#e9b22b", label: "Mustard" },
  { id: "rosa", hex: "#db88b9", label: "Rosa" },
  { id: "cobalt", hex: "#0b3d9f", label: "Cobalt" },
  { id: "red", hex: "#cf2e2c", label: "Red" },
  { id: "green", hex: "#105f2d", label: "Green" },
] as const;

export default function EditProfile() {
  const q = useApiQuery<MobileProfile>("/settings/profile");
  const themed = useColors();

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
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
  const themed = useColors();

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
  const previewHost = previewUrl ? displayUrl(previewUrl) : null;

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
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
      >
        {/* Identity block: logo + the public address, centered — the standard
            account-settings anchor (founder round 5 declutter). */}
        <ImageUploadField
          label="Logo"
          imageUrl={initial.logoUrl}
          endpoint="/settings/profile/logo"
          shape="circle"
          maxBytes={MAX_LOGO_BYTES}
          onUploaded={() => invalidateIdentity(queryClient)}
        />
        {previewUrl ? (
          <Pressable
            accessibilityRole="button"
            // Label-in-name: the spoken name starts with the visible URL text.
            accessibilityLabel={`${previewHost}, preview public page`}
            onPress={() => {
              void WebBrowser.openBrowserAsync(previewUrl);
            }}
            className="-mt-1 mb-1 flex-row items-center justify-center gap-1 px-6 active:opacity-70"
          >
            <Text
              className="shrink text-sm font-medium text-accent"
              numberOfLines={1}
            >
              {previewHost}
            </Text>
            <ArrowUpRight size={14} color={themed.accent} />
          </Pressable>
        ) : null}

        <SectionLabel size="sm">Profile</SectionLabel>
        <Card>
          <TextField
            label="Artist / studio name"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />

          <Text className="mb-1.5 text-sm font-medium text-foreground">
            Bio
          </Text>
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
        </Card>

        <SectionLabel size="sm">Public page cover</SectionLabel>
        <Card>
          <CoverImageField
            imageUrl={initial.coverImageUrl}
            fallbackColor={coverHex}
            onChanged={() => invalidateIdentity(queryClient)}
          />
          <View className="mt-1 flex-row flex-wrap items-center gap-3">
            <CoverSwatch
              label="No color"
              hex={null}
              selected={coverColor === ""}
              onPress={() => setCoverColor("")}
            />
            {COVER_COLORS.map((swatch) => (
              <CoverSwatch
                key={swatch.id}
                label={swatch.label}
                hex={swatch.hex}
                fg={tint[swatch.id].fg}
                selected={coverColor === swatch.id}
                onPress={() => setCoverColor(swatch.id)}
              />
            ))}
          </View>
          <Text className="mt-3 text-sm text-shell-dim">
            Shown behind your name on your public page. The color is used when
            no image is set.
          </Text>
        </Card>

        <View className="mt-6">
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
        </View>
      </ScrollView>
    </Screen>
  );
}

// One cover-color choice: a square color swatch (founder round 5; the old
// named pills read as clutter). Selected = themed ring + check; the "no
// color" square is hollow with a slash. Labels live on as accessibility names.
function CoverSwatch({
  label,
  hex,
  fg,
  selected,
  onPress,
}: {
  label: string;
  /** null = the "no color" swatch (transparent with a slash). */
  hex: string | null;
  /** Icon color that reads on the swatch fill (unused for the null swatch,
   *  whose check uses the themed foreground). */
  fg?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const themed = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cover color: ${label}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      className="h-12 w-12 items-center justify-center rounded-xl active:opacity-80"
      style={{
        padding: 2,
        borderWidth: 2,
        borderColor: selected ? themed.shell.fg : "transparent",
      }}
    >
      <View
        className="flex-1 items-center justify-center self-stretch rounded-lg"
        style={{
          backgroundColor: hex ?? "transparent",
          // Hairline keeps the bone-adjacent swatches visible in light theme.
          borderWidth: border.hairline,
          borderColor: themed.shell.border,
        }}
      >
        {selected ? (
          <Check size={18} strokeWidth={3} color={hex ? fg : themed.shell.fg} />
        ) : hex === null ? (
          <Slash size={16} color={themed.shell.dim} />
        ) : null}
      </View>
    </Pressable>
  );
}
