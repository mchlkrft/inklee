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
import { useRouter } from "expo-router";
import { getCalendars } from "expo-localization";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileProfile } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ImageUploadField } from "@/components/ImageUploadField";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, invalidateIdentity } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";

const BIO_MAX = 280;

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
  const router = useRouter();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [instagram, setInstagram] = useState(initial.instagramHandle ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [timezone, setTimezone] = useState(initial.timezone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deviceTz = getCalendars()[0]?.timeZone ?? null;
  const canUseDeviceTz = !!deviceTz && deviceTz !== timezone;

  async function save() {
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await apiPost("/settings/profile", {
        displayName: displayName.trim(),
        bio: bio.trim(),
        instagramHandle: instagram.trim(),
        location: location.trim(),
        timezone: timezone.trim() || undefined,
      });
      await invalidateIdentity(queryClient); // /me + /home + /settings/profile
      router.back();
    } catch (e) {
      captureError(e, { op: "saveProfile" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
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
        <ImageUploadField
          label="Logo"
          imageUrl={initial.logoUrl}
          endpoint="/settings/profile/logo"
          shape="circle"
          onUploaded={() => invalidateIdentity(queryClient)}
        />

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
          placeholder="@yourhandle"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <TextField
          label="Location"
          value={location}
          onChangeText={setLocation}
          placeholder="Berlin, DE"
          autoCapitalize="words"
        />

        <Text className="mb-1.5 text-sm font-medium text-foreground">Timezone</Text>
        <View className="mb-3 rounded-xl border border-shell-border px-4 py-3">
          <Text className="text-base text-foreground">{timezone || "Not set"}</Text>
          {canUseDeviceTz ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setTimezone(deviceTz!)}
              className="mt-2 active:opacity-70"
            >
              <Text className="text-sm text-mustard">
                Use this device&apos;s timezone ({deviceTz})
              </Text>
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <Text className="mb-3 text-sm text-danger">{error}</Text>
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
