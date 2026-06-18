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
import { Trash2 } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import type {
  MobileTripDetail,
  MobileTripLeg,
} from "@inklee/shared/mobile-api";
import {
  sanitizeTravelIcon,
  sanitizeTravelIconColor,
  type TravelIconKey,
} from "@inklee/shared/travel-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { FieldLabel } from "@/components/FieldLabel";
import { IconButton } from "@/components/IconButton";
import { TextField } from "@/components/TextField";
import { DateField } from "@/components/DateField";
import { RadioList } from "@/components/RadioList";
import { IconHeaderControl } from "@/components/IconHeaderControl";
import { DangerButton } from "@/components/DangerButton";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import {
  formatDateRange,
  invalidateTravel,
  legIsActive,
  rangesOverlap,
} from "@/lib/travel";
import { toLocalDate } from "@/lib/date";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { colors } from "@/lib/tokens";

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const themed = useColors();
  const isNew = id === "new";
  const q = useApiQuery<MobileTripDetail>(`/travel/trips/${id}`, {
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
  const [icon, setIcon] = useState<TravelIconKey | null>(null);
  const [iconColor, setIconColor] = useState<string | null>(null);
  const [show, setShow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    title.trim() !== "" ||
    description.trim() !== "" ||
    icon !== null ||
    iconColor !== null ||
    show !== true;
  const { leave } = useUnsavedGuard(dirty && !saving, create);

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
        icon,
        iconColor,
      });
      await invalidateTravel(queryClient);
      // Land on the detail so the artist can add date stops. Bypass the guard:
      // the create is the intentional navigation.
      leave(() => router.replace(`/travel/trips/${id}`));
    } catch (e) {
      captureError(e, { op: "createTrip" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen
        options={{
          title: "New trip",
          headerRight: () => (
            <IconHeaderControl
              icon={icon}
              iconColor={iconColor}
              onChange={({ icon: nextIcon, iconColor: nextColor }) => {
                setIcon(nextIcon);
                setIconColor(nextColor);
              }}
            />
          ),
        }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 /* no tab pill on detail forms */ }}
      >
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Berlin guest spot"
          autoCapitalize="sentences"
        />
        <FieldLabel>Description (optional)</FieldLabel>
        <TextArea
          value={description}
          onChangeText={setDescription}
          placeholder="Details clients see"
        />
        <ShowToggle value={show} onChange={setShow} />
        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}
        <Button label="Create trip" onPress={create} loading={saving} />
      </ScrollView>
    </Screen>
  );
}

function EditTrip({ id, initial }: { id: string; initial: MobileTripDetail }) {
  const queryClient = useQueryClient();

  // Seeds captured for the unsaved-changes guard's dirty comparison.
  const seedTitle = initial.title;
  const seedDescription = initial.description ?? "";
  const seedIcon = sanitizeTravelIcon(initial.icon ?? null);
  const seedIconColor = sanitizeTravelIconColor(initial.iconColor ?? null);
  const seedShow = initial.showOnBookingForm;

  const [title, setTitle] = useState(seedTitle);
  const [description, setDescription] = useState(seedDescription);
  const [icon, setIcon] = useState<TravelIconKey | null>(seedIcon);
  const [iconColor, setIconColor] = useState<string | null>(seedIconColor);
  const [show, setShow] = useState(seedShow);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    title !== seedTitle ||
    description !== seedDescription ||
    icon !== seedIcon ||
    iconColor !== seedIconColor ||
    show !== seedShow;
  const { leave } = useUnsavedGuard(dirty && !saving, saveTrip);

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
        icon,
        iconColor,
      });
      await invalidateTravel(queryClient);
      leave();
    } catch (e) {
      captureError(e, { op: "saveTrip" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  function confirmDeleteTrip() {
    Alert.alert(
      "Delete trip",
      "Delete this trip and all its dates? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: deleteTrip },
      ],
    );
  }

  async function deleteTrip() {
    setSaving(true);
    setError(null);
    try {
      await apiDelete(`/travel/trips/${id}`);
      await invalidateTravel(queryClient);
      leave();
    } catch (e) {
      captureError(e, { op: "deleteTrip" });
      setError(e instanceof Error ? e.message : "Couldn't delete. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen
        options={{
          title: initial.title,
          headerRight: () => (
            <IconHeaderControl
              icon={icon}
              iconColor={iconColor}
              onChange={({ icon: nextIcon, iconColor: nextColor }) => {
                setIcon(nextIcon);
                setIconColor(nextColor);
              }}
            />
          ),
        }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 /* no tab pill on detail forms */ }}
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
        <FieldLabel>Description (optional)</FieldLabel>
        <TextArea
          value={description}
          onChangeText={setDescription}
          placeholder="Details clients see"
        />
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

        {rangesOverlap(initial.legs) ? <OverlapNotice /> : null}

        <AddLeg
          tripId={id}
          studios={initial.studios}
          onAdded={() => invalidateTravel(queryClient)}
        />

        {error ? (
          <Text className="mt-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <DangerButton
          label="Delete trip"
          onPress={confirmDeleteTrip}
          disabled={saving}
        />
      </ScrollView>
    </Screen>
  );
}

function OverlapNotice() {
  return (
    <View className="mb-3 rounded-2xl border border-mustard/40 bg-mustard/10 px-3 py-2.5">
      <Text className="text-xs leading-snug text-foreground">
        <Text className="font-semibold">These dates overlap.</Text> That&apos;s
        fine if you&apos;re working more than one studio at once, but clients booking on
        those days will see every matching studio and be asked to wait for your
        confirmation. Remember to tell each client which studio to come to.
      </Text>
    </View>
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
    <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass px-4 py-3">
      <View className="flex-1 pr-3">
        <Text className="text-base text-foreground">Show on booking form</Text>
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
  const themed = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = legIsActive(leg.startsOn, leg.endsOn);

  function confirmRemove() {
    Alert.alert("Remove stop", "Remove this date stop from the trip?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: remove },
    ]);
  }

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
    <View className="rounded-2xl border border-shell-border bg-glass p-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-medium text-foreground">
              {formatDateRange(leg.startsOn, leg.endsOn)}
            </Text>
            {active ? (
              <Text className="text-xs font-medium text-success-fg">Now</Text>
            ) : null}
          </View>
          <Text className="mt-0.5 text-sm text-shell-dim">
            {leg.studioName ?? "No studio"}
            {leg.notes ? ` · ${leg.notes}` : ""}
          </Text>
        </View>
        {busy ? (
          <View className="h-10 w-10 items-center justify-center">
            <ActivityIndicator color={colors.shell.mute} />
          </View>
        ) : (
          <IconButton
            size="sm"
            icon={Trash2}
            label="Remove stop"
            onPress={confirmRemove}
            iconSize={18}
            color={themed.dangerFg}
          />
        )}
      </View>
      {error ? (
        <Text className="mt-1 text-xs text-danger-fg">{error}</Text>
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
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [studioId, setStudioId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studioOptions = [
    { value: "", label: "No studio" },
    ...studios.map((s) => ({ value: s.id, label: s.name })),
  ];

  async function add() {
    if (!startsOn || !endsOn) {
      setError("Start and end dates are required.");
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/travel/trips/${tripId}/legs`, {
        startsOn,
        endsOn,
        studioId: studioId || null,
        notes: notes.trim() || null,
      });
      setStartsOn(null);
      setEndsOn(null);
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
      <Text className="mb-3 text-sm font-medium text-foreground">Add a stop</Text>
      <DateField label="Start date" value={startsOn} onChange={setStartsOn} />
      <DateField
        label="End date"
        value={endsOn}
        onChange={setEndsOn}
        minimumDate={startsOn ? toLocalDate(startsOn) : undefined}
      />
      {studios.length > 0 ? (
        <>
          <FieldLabel>Studio</FieldLabel>
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
        <Text className="mb-2 text-sm text-danger-fg">{error}</Text>
      ) : null}
      <Button label="Add stop" variant="secondary" onPress={add} loading={busy} />
    </View>
  );
}
