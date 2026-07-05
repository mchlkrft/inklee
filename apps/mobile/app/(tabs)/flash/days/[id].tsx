import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { TextArea } from "@/components/TextArea";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type {
  MobileFlashDay,
  MobileFlashDayItemsResponse,
  MobileFlashFoldersResponse,
  MobileFlashItemsResponse,
  MobileStudiosResponse,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { FieldLabel } from "@/components/FieldLabel";
import { TextField } from "@/components/TextField";
import { DateField } from "@/components/DateField";
import { Segmented } from "@/components/Segmented";
import { RadioList } from "@/components/RadioList";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, apiPut, apiDelete } from "@/lib/api";
import { DAY_STATUS_OPTIONS, invalidateFlash } from "@/lib/flash";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { colors } from "@/lib/tokens";

type DayStatus = (typeof DAY_STATUS_OPTIONS)[number]["value"];

export default function FlashDayForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const themed = useColors();
  const isNew = id === "new";
  const q = useApiQuery<MobileFlashDay>(`/flash/days/${id}`, {
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
  const [studioId, setStudioId] = useState(initial?.studioId ?? "");
  const studiosQ = useApiQuery<MobileStudiosResponse>("/travel/studios");
  const venueOptions = [
    { value: "", label: "Other / external venue" },
    ...(studiosQ.data?.items ?? []).map((s) => ({
      value: s.id,
      label: s.city ? `${s.name} · ${s.city}` : s.name,
    })),
  ];
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
      // studioId takes precedence; the shared validator clears location when set.
      studioId: studioId || null,
      location: location.trim() || null,
      description: description.trim() || null,
      status,
      isPublic,
    };
    try {
      // Item counts + the edited day's detail live under /flash too.
      if (isNew) {
        // Land on the just-created day so its roster builder (gated behind an
        // existing id) is right there — adding designs is the point of a day.
        const { id: newId } = await apiPost<{ id: string }>(
          "/flash/days",
          payload,
        );
        await invalidateFlash(queryClient);
        router.replace(`/flash/days/${newId}`);
      } else {
        await apiPut(`/flash/days/${id}`, payload);
        await invalidateFlash(queryClient);
        router.back();
      }
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
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 /* no tab pill on detail forms */ }}
      >
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Walk-in Saturday"
          autoCapitalize="sentences"
        />
        <DateField
          label="Date (optional)"
          value={scheduledOn || null}
          onChange={setScheduledOn}
          onClear={() => setScheduledOn("")}
        />
        {(studiosQ.data?.items ?? []).length > 0 ? (
          <>
            <FieldLabel>Venue</FieldLabel>
            <RadioList
              options={venueOptions}
              value={studioId}
              onChange={setStudioId}
            />
          </>
        ) : null}
        {studioId === "" ? (
          <TextField
            label="Location (optional)"
            value={location}
            onChangeText={setLocation}
            placeholder="Studio or city"
            autoCapitalize="words"
          />
        ) : null}

        <FieldLabel>Description (optional)</FieldLabel>
        <TextArea
          value={description}
          onChangeText={setDescription}
          placeholder="Details clients see on the public day page"
        />

        <FieldLabel>Status</FieldLabel>
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
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <Button
          label={isNew ? "Create flash day" : "Save"}
          onPress={save}
          loading={saving}
          disabled={!title.trim()}
        />

        {!isNew ? <DayItemsManager dayId={id} /> : null}
      </ScrollView>
    </Screen>
  );
}

// Build the day's roster from the app: the designs in this day (junction-backed,
// removable) plus a picker of the artist's other designs to add. Mirrors the web
// FlashDayItemsManager; both go through the shared membership module via the API.
function DayItemsManager({ dayId }: { dayId: string }) {
  const queryClient = useQueryClient();
  const roster = useApiQuery<MobileFlashDayItemsResponse>(
    `/flash/days/${dayId}/items`,
  );
  const library = useApiQuery<MobileFlashItemsResponse>("/flash/items");
  const foldersQ = useApiQuery<MobileFlashFoldersResponse>("/flash/folders");
  const themed = useColors();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attached = roster.data?.items ?? [];
  const attachedIds = new Set(attached.map((i) => i.id));
  const candidates = (library.data?.items ?? []).filter(
    (i) => i.status !== "archived" && !attachedIds.has(i.id),
  );

  async function refreshAll() {
    await Promise.all([roster.refresh(), library.refresh()]);
    await invalidateFlash(queryClient);
  }

  async function attach() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/flash/days/${dayId}/items`, { itemIds: [...selected] });
      setSelected(new Set());
      await refreshAll();
    } catch (e) {
      captureError(e, { op: "attachFlashDayItems" });
      setError(e instanceof Error ? e.message : "Couldn't add. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function attachFolder(folderId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/flash/days/${dayId}/items`, { folderId });
      await refreshAll();
    } catch (e) {
      captureError(e, { op: "attachFlashDayFolder" });
      setError(
        e instanceof Error ? e.message : "Couldn't add folder. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function detach(itemId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/flash/days/${dayId}/items?itemId=${itemId}`);
      await refreshAll();
    } catch (e) {
      captureError(e, { op: "detachFlashDayItem" });
      setError(e instanceof Error ? e.message : "Couldn't remove. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <View className="mt-7">
      <FieldLabel>Designs in this day</FieldLabel>
      {roster.loading && !roster.data ? (
        <View className="mb-3 items-center py-2">
          <ActivityIndicator color={themed.accent} />
        </View>
      ) : attached.length === 0 ? (
        <Text className="mb-3 text-sm text-shell-dim">
          No designs added yet.
        </Text>
      ) : (
        <View className="mb-4 rounded-2xl border border-shell-border bg-glass">
          {attached.map((it, i) => (
            <View
              key={it.id}
              className={`flex-row items-center gap-3 px-3 py-2.5 ${
                i > 0 ? "border-t border-shell-border" : ""
              }`}
            >
              {it.previewImageUrl ? (
                <Image
                  source={{ uri: it.previewImageUrl }}
                  style={{ width: 40, height: 40, borderRadius: 8 }}
                  contentFit="cover"
                />
              ) : (
                <View className="h-10 w-10 rounded-lg bg-mustard/15" />
              )}
              <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                {it.title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${it.title}`}
                onPress={() => detach(it.id)}
                disabled={busy}
                hitSlop={8}
                className="active:opacity-60"
              >
                <Text className="text-sm text-danger-fg">Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {(foldersQ.data?.folders ?? []).length > 0 ? (
        <View className="mb-4">
          <Text className="mb-2 text-sm font-medium text-foreground">
            Add a folder
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(foldersQ.data?.folders ?? []).map((f) => (
              <Pressable
                key={f.id}
                accessibilityRole="button"
                accessibilityLabel={`Add folder ${f.name}`}
                onPress={() => attachFolder(f.id)}
                disabled={busy}
                className="rounded-full border border-shell-border px-3 py-1.5 active:opacity-70"
              >
                <Text className="text-sm text-shell-dim">{f.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {candidates.length > 0 ? (
        <>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-foreground">
              Add designs
            </Text>
            {selected.size > 0 ? (
              <Button
                label={`Add ${selected.size}`}
                size="sm"
                onPress={attach}
                loading={busy}
              />
            ) : null}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {candidates.map((c) => {
              const on = selected.has(c.id);
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={c.title}
                  onPress={() => toggle(c.id)}
                  className={`overflow-hidden rounded-xl border-2 ${
                    on ? "border-mustard" : "border-shell-border"
                  }`}
                  style={{ width: 76, height: 76 }}
                >
                  {c.previewImageUrl ? (
                    <Image
                      source={{ uri: c.previewImageUrl }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="flex-1 items-center justify-center bg-mustard/15 px-1">
                      <Text
                        className="text-center text-[10px] text-shell-dim"
                        numberOfLines={2}
                      >
                        {c.title}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {error ? (
        <Text className="mt-3 text-sm text-danger-fg">{error}</Text>
      ) : null}
    </View>
  );
}
