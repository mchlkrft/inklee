import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  MobileTripDetail,
  MobileTripLeg,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { RadioList } from "@/components/RadioList";
import { DangerButton } from "@/components/DangerButton";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, apiPut, apiDelete } from "@/lib/api";
import { formatDateRange } from "@/lib/travel";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";

function invalidateTravel(client: QueryClient) {
  return client.invalidateQueries({
    predicate: (query) =>
      typeof query.queryKey[1] === "string" &&
      (query.queryKey[1] as string).startsWith("/travel"),
  });
}

function Label({ children }: { children: string }) {
  return <Text className="mb-1.5 text-sm font-medium text-bone">{children}</Text>;
}

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const q = useApiQuery<MobileTripDetail>(`/travel/trips/${id}`, {
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
              title="Couldn't load trip"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return isNew ? <CreateTrip /> : <EditTrip id={id} initial={q.data!} />;
}

function CreateTrip() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [show, setShow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      const { id } = await apiPost<{ id: string }>("/travel/trips", {
        title: title.trim(),
        description: description.trim() || null,
        showOnBookingForm: show,
      });
      await invalidateTravel(queryClient);
      // Land on the detail so the artist can add date stops.
      router.replace(`/travel/trips/${id}`);
    } catch (e) {
      captureError(e, { op: "createTrip" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen options={{ title: "New trip" }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
      >
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Berlin guest spot"
          autoCapitalize="sentences"
        />
        <Label>Description (optional)</Label>
        <View className="mb-3 rounded-xl border border-shell-border px-4 py-3">
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Details clients see"
            placeholderTextColor={colors.shell.mute}
            className="min-h-[64px] text-base text-bone"
            style={{ textAlignVertical: "top" }}
          />
        </View>
        <ShowToggle value={show} onChange={setShow} />
        {error ? (
          <Text className="mb-3 text-sm text-danger">{error}</Text>
        ) : null}
        <Button label="Create trip" onPress={create} loading={saving} />
      </ScrollView>
    </Screen>
  );
}

function EditTrip({ id, initial }: { id: string; initial: MobileTripDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [show, setShow] = useState(initial.showOnBookingForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveTrip() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await apiPut(`/travel/trips/${id}`, {
        title: title.trim(),
        description: description.trim() || null,
        showOnBookingForm: show,
      });
      await invalidateTravel(queryClient);
      router.back();
    } catch (e) {
      captureError(e, { op: "saveTrip" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  async function deleteTrip() {
    setSaving(true);
    setError(null);
    try {
      await apiDelete(`/travel/trips/${id}`);
      await invalidateTravel(queryClient);
      router.back();
    } catch (e) {
      captureError(e, { op: "deleteTrip" });
      setError(e instanceof Error ? e.message : "Couldn't delete. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen options={{ title: initial.title }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
      >
        {/* Header fields seed from `initial` once; a leg add/delete refetch
            updates the legs list below but intentionally does NOT re-seed these
            so an in-progress title/description edit isn't clobbered. */}
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
        />
        <Label>Description (optional)</Label>
        <View className="mb-3 rounded-xl border border-shell-border px-4 py-3">
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Details clients see"
            placeholderTextColor={colors.shell.mute}
            className="min-h-[64px] text-base text-bone"
            style={{ textAlignVertical: "top" }}
          />
        </View>
        <ShowToggle value={show} onChange={setShow} />
        <Button label="Save trip" onPress={saveTrip} loading={saving} />

        <Text className="mb-2 mt-7 text-xs font-semibold uppercase tracking-wide text-shell-mute">
          Date stops
        </Text>
        {initial.legs.length === 0 ? (
          <Text className="mb-3 text-sm text-shell-dim">
            No stops yet. Add the dates and studio for each leg of this trip.
          </Text>
        ) : (
          <View className="mb-3 gap-2">
            {initial.legs.map((leg) => (
              <LegRow
                key={leg.id}
                leg={leg}
                onDeleted={() => invalidateTravel(queryClient)}
              />
            ))}
          </View>
        )}

        <AddLeg
          tripId={id}
          studios={initial.studios}
          onAdded={() => invalidateTravel(queryClient)}
        />

        {error ? (
          <Text className="mt-3 text-sm text-danger">{error}</Text>
        ) : null}

        <DangerButton label="Delete trip" onPress={deleteTrip} disabled={saving} />
      </ScrollView>
    </Screen>
  );
}

function ShowToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-shell-border bg-[rgba(229,225,213,0.04)] px-4 py-3">
      <View className="flex-1 pr-3">
        <Text className="text-base text-bone">Show on booking form</Text>
        <Text className="mt-0.5 text-sm text-shell-dim">
          Let clients pick this trip when they book.
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
        thumbColor={colors.bone}
        ios_backgroundColor="rgba(0,0,0,0.35)"
      />
    </View>
  );
}

function LegRow({
  leg,
  onDeleted,
}: {
  leg: MobileTripLeg;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/travel/legs/${leg.id}`);
      onDeleted();
    } catch (e) {
      captureError(e, { op: "deleteLeg" });
      setError("Couldn't remove. Try again.");
      setBusy(false);
    }
  }

  return (
    <View className="rounded-2xl border border-shell-border bg-[rgba(229,225,213,0.04)] p-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-base font-medium text-bone">
            {formatDateRange(leg.startsOn, leg.endsOn)}
          </Text>
          <Text className="mt-0.5 text-sm text-shell-dim">
            {leg.studioName ?? "No studio"}
            {leg.notes ? ` · ${leg.notes}` : ""}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove stop"
          onPress={remove}
          disabled={busy}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center active:opacity-70"
        >
          {busy ? (
            <ActivityIndicator color={colors.shell.mute} />
          ) : (
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          )}
        </Pressable>
      </View>
      {error ? (
        <Text className="mt-1 text-xs text-danger">{error}</Text>
      ) : null}
    </View>
  );
}

function AddLeg({
  tripId,
  studios,
  onAdded,
}: {
  tripId: string;
  studios: MobileTripDetail["studios"];
  onAdded: () => void;
}) {
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [studioId, setStudioId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studioOptions = [
    { value: "", label: "No studio" },
    ...studios.map((s) => ({ value: s.id, label: s.name })),
  ];

  async function add() {
    if (!startsOn.trim() || !endsOn.trim()) {
      setError("Start and end dates are required.");
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/travel/trips/${tripId}/legs`, {
        startsOn: startsOn.trim(),
        endsOn: endsOn.trim(),
        studioId: studioId || null,
        notes: notes.trim() || null,
      });
      setStartsOn("");
      setEndsOn("");
      setStudioId("");
      setNotes("");
      onAdded();
    } catch (e) {
      captureError(e, { op: "addLeg" });
      setError(e instanceof Error ? e.message : "Couldn't add. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="rounded-2xl border border-shell-border p-4">
      <Text className="mb-3 text-sm font-medium text-bone">Add a stop</Text>
      <TextField
        label="Start date"
        value={startsOn}
        onChangeText={setStartsOn}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
      />
      <TextField
        label="End date"
        value={endsOn}
        onChangeText={setEndsOn}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
      />
      {studios.length > 0 ? (
        <>
          <Label>Studio</Label>
          <RadioList
            options={studioOptions}
            value={studioId}
            onChange={setStudioId}
          />
        </>
      ) : null}
      <TextField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g. walk-ins welcome"
      />
      {error ? (
        <Text className="mb-2 text-sm text-danger">{error}</Text>
      ) : null}
      <Button label="Add stop" variant="secondary" onPress={add} loading={busy} />
    </View>
  );
}
