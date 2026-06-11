import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { TextArea } from "@/components/TextArea";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileFlashDay } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Segmented } from "@/components/Segmented";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, apiPut } from "@/lib/api";
import { DAY_STATUS_OPTIONS } from "@/lib/flash";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";

type DayStatus = (typeof DAY_STATUS_OPTIONS)[number]["value"];

function Label({ children }: { children: string }) {
  return <Text className="mb-1.5 text-sm font-medium text-foreground">{children}</Text>;
}

export default function FlashDayForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const q = useApiQuery<MobileFlashDay>(`/flash/days/${id}`, {
    enabled: !isNew,
  });

  if (!isNew && !q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
          ) : (
            <ErrorState
              title="Couldn't load flash day"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <DayForm isNew={isNew} id={id} initial={isNew ? null : q.data!} />;
}

function DayForm({
  isNew,
  id,
  initial,
}: {
  isNew: boolean;
  id: string;
  initial: MobileFlashDay | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [scheduledOn, setScheduledOn] = useState(initial?.scheduledOn ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<DayStatus>(
    (initial?.status ?? "upcoming") as DayStatus,
  );
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      scheduledOn: scheduledOn.trim() || null,
      location: location.trim() || null,
      description: description.trim() || null,
      status,
      isPublic,
    };
    try {
      if (isNew) await apiPost("/flash/days", payload);
      else await apiPut(`/flash/days/${id}`, payload);
      // Item counts + the edited day's detail live under /flash too.
      await queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[1] === "string" &&
          (query.queryKey[1] as string).startsWith("/flash"),
      });
      router.back();
    } catch (e) {
      captureError(e, { op: "saveFlashDay" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen
        options={{ title: isNew ? "New flash day" : "Flash day" }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
      >
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Walk-in Saturday"
          autoCapitalize="sentences"
        />
        <TextField
          label="Date (optional)"
          value={scheduledOn}
          onChangeText={setScheduledOn}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <TextField
          label="Location (optional)"
          value={location}
          onChangeText={setLocation}
          placeholder="Studio or city"
          autoCapitalize="words"
        />

        <Label>Description (optional)</Label>
        <TextArea
          value={description}
          onChangeText={setDescription}
          placeholder="Details clients see on the public day page"
        />

        <Label>Status</Label>
        <Segmented options={DAY_STATUS_OPTIONS} value={status} onChange={setStatus} />

        <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass px-4 py-3">
          <View className="flex-1 pr-3">
            <Text className="text-base text-foreground">Public page</Text>
            <Text className="mt-0.5 text-sm text-shell-dim">
              Show this day at your public flash page.
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
            thumbColor={colors.bone}
            ios_backgroundColor="rgba(0,0,0,0.35)"
          />
        </View>

        {error ? (
          <Text className="mb-3 text-sm text-danger">{error}</Text>
        ) : null}

        <Button
          label={isNew ? "Create flash day" : "Save"}
          onPress={save}
          loading={saving}
          disabled={!title.trim()}
        />
      </ScrollView>
    </Screen>
  );
}
