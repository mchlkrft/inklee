import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { TextArea } from "@/components/TextArea";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  VISIBILITY_MODES,
  type VisibilityMode,
} from "@inklee/shared/studio-validation";
import type { MobileStudio } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { FieldLabel } from "@/components/FieldLabel";
import { TextField } from "@/components/TextField";
import { RadioList } from "@/components/RadioList";
import { DangerButton } from "@/components/DangerButton";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, apiPut, apiDelete } from "@/lib/api";
import { VISIBILITY_OPTIONS, invalidateTravel } from "@/lib/travel";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { colors } from "@/lib/tokens";

export default function StudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const themed = useColors();
  const isNew = id === "new";
  const q = useApiQuery<MobileStudio>(`/travel/studios/${id}`, {
    enabled: !isNew,
  });

  if (!isNew && !q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load studio"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <StudioForm isNew={isNew} id={id} initial={isNew ? null : q.data!} />;
}

function StudioForm({
  isNew,
  id,
  initial,
}: {
  isNew: boolean;
  id: string;
  initial: MobileStudio | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState(initial?.name ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [publicNote, setPublicNote] = useState(initial?.publicNote ?? "");
  const [visibility, setVisibility] = useState<VisibilityMode>(() => {
    const v = initial?.visibilityMode;
    return (VISIBILITY_MODES as readonly string[]).includes(v ?? "")
      ? (v as VisibilityMode)
      : "hidden";
  });
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      city: city.trim(),
      country: country.trim(),
      address: address.trim() || null,
      public_note: publicNote.trim() || null,
      visibility_mode: visibility,
      is_primary: isPrimary,
    };
    try {
      if (isNew) await apiPost("/travel/studios", payload);
      else await apiPut(`/travel/studios/${id}`, payload);
      await invalidateTravel(queryClient);
      router.back();
    } catch (e) {
      captureError(e, { op: "saveStudio" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  function confirmRemove() {
    Alert.alert(
      "Delete studio",
      "Remove this studio from your library?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: remove },
      ],
    );
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await apiDelete(`/travel/studios/${id}`);
      await invalidateTravel(queryClient);
      router.back();
    } catch (e) {
      captureError(e, { op: "deleteStudio" });
      setError(e instanceof Error ? e.message : "Couldn't delete. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen options={{ title: isNew ? "New studio" : "Studio" }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 /* no tab pill on detail forms */ }}
      >
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Studio name"
          autoCapitalize="words"
        />
        <TextField
          label="City"
          value={city}
          onChangeText={setCity}
          autoCapitalize="words"
        />
        <TextField
          label="Country"
          value={country}
          onChangeText={setCountry}
          autoCapitalize="words"
        />
        <TextField
          label="Address (optional)"
          value={address}
          onChangeText={setAddress}
        />

        <FieldLabel>Public note (optional)</FieldLabel>
        <TextArea
          value={publicNote}
          onChangeText={setPublicNote}
          placeholder="Shown to clients when this studio is public"
          minHeight={56}
        />

        <FieldLabel>Visibility</FieldLabel>
        <RadioList
          options={VISIBILITY_OPTIONS}
          value={visibility}
          onChange={setVisibility}
        />

        <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass px-4 py-3">
          <Text className="text-base text-foreground">Primary studio</Text>
          <Switch
            value={isPrimary}
            onValueChange={setIsPrimary}
            trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
            thumbColor={colors.bone}
            ios_backgroundColor="rgba(0,0,0,0.35)"
          />
        </View>

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <Button
          label={isNew ? "Create studio" : "Save"}
          onPress={save}
          loading={saving}
          disabled={!name.trim()}
        />

        {!isNew ? (
          <DangerButton
            label="Delete studio"
            onPress={confirmRemove}
            disabled={saving}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
