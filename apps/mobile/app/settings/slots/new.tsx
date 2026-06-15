import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react-native";
import {
  countDatesInRange,
  WEEKDAY_LABELS,
  type SlotPatternInput,
  type SlotWindow,
} from "@inklee/shared/slot-pattern";
import { addDaysToDateKey, localDateKey } from "@inklee/shared/date-utils";
import type {
  MobileMe,
  MobileSlotPatternResult,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { FieldLabel } from "@/components/FieldLabel";
import { IconButton } from "@/components/IconButton";
import { PillButton } from "@/components/PillButton";
import { Segmented } from "@/components/Segmented";
import { TimeField } from "@/components/TimeField";
import { invalidateNotifications } from "@/lib/notifications";
import { apiPost, invalidateSlots, useApiQuery } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { formatShortDate, toLocalDate } from "@/lib/date";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";

// Pattern-based slot creation — the native port of the web SlotPatternBuilder.
// Time windows x (specific dates | weekdays in a range); each window on each
// date becomes one slot. The live "Creates N slots" preview and the server
// insert both run on the shared @inklee/shared/slot-pattern expansion, so they
// cannot disagree. Times are interpreted in the artist's PROFILE timezone
// server-side, never the device timezone.

type WindowDraft = { id: number; start: string | null; end: string | null };

const APPLY_OPTIONS = [
  { value: "dates", label: "Specific dates" },
  { value: "weekdays", label: "Weekdays" },
] as const;

function tomorrow() {
  return addDaysToDateKey(localDateKey(), 1);
}

export default function NewSlotsScreen() {
  useScreenView("settings_slots_new");
  const router = useRouter();
  const queryClient = useQueryClient();
  const c = useColors();
  // /me is warm from the root layout — only read for the timezone cue.
  const me = useApiQuery<MobileMe>("/me");
  const todayPlusOne = tomorrow();
  // Web parity: the web builder floors every date input at tomorrow.
  // toLocalDate, not new Date(key): the latter parses UTC midnight, which is
  // the previous local day west of UTC.
  const minDate = toLocalDate(todayPlusOne);

  const [windows, setWindows] = useState<WindowDraft[]>([
    { id: 1, start: null, end: null },
  ]);
  const [nextId, setNextId] = useState(2);
  const [applyMode, setApplyMode] = useState<"dates" | "weekdays">("dates");

  // Weekday mode
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [fromDate, setFromDate] = useState<string | null>(todayPlusOne);
  const [toDate, setToDate] = useState<string | null>(null);

  // Specific dates mode
  const [dateInput, setDateInput] = useState<string | null>(todayPlusOne);
  const [specificDates, setSpecificDates] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validWindows: SlotWindow[] = windows
    .filter((w): w is WindowDraft & { start: string; end: string } =>
      Boolean(w.start && w.end && w.end > w.start),
    )
    .map((w) => ({ start: w.start, end: w.end }));

  const dateCount =
    applyMode === "weekdays"
      ? fromDate && toDate
        ? countDatesInRange(fromDate, toDate, weekdays)
        : 0
      : specificDates.length;

  const slotCount = validWindows.length * dateCount;

  function updateWindow(id: number, field: "start" | "end", value: string) {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, [field]: value } : w)),
    );
  }

  function addDate() {
    if (!dateInput || specificDates.includes(dateInput)) return;
    setSpecificDates((prev) => [...prev, dateInput].sort());
  }

  function toggleDay(idx: number) {
    setWeekdays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx],
    );
  }

  async function submit() {
    setError(null);
    if (validWindows.length === 0) {
      setError("Add at least one complete time window (start before end).");
      return;
    }
    if (applyMode === "weekdays") {
      if (weekdays.length === 0) {
        setError("Select at least one weekday.");
        return;
      }
      if (!fromDate || !toDate) {
        setError("Set a date range.");
        return;
      }
      if (toDate < fromDate) {
        setError("The end of the range must be after its start.");
        return;
      }
    } else if (specificDates.length === 0) {
      setError("Add at least one date.");
      return;
    }

    const body: SlotPatternInput =
      applyMode === "weekdays"
        ? {
            windows: validWindows,
            applyMode: "weekdays",
            weekdays,
            fromDate: fromDate!,
            toDate: toDate!,
          }
        : { windows: validWindows, applyMode: "dates", dates: specificDates };

    setSaving(true);
    try {
      await apiPost<MobileSlotPatternResult>("/slots/pattern", body);
      // Slot creation auto-resolves the standing no-slots warning server-side
      // (awaited there); refresh the feed so the warning leaves it this
      // session.
      await invalidateSlots(queryClient);
      await invalidateNotifications(queryClient);
      router.back();
    } catch (e) {
      captureError(e, { op: "createSlotsFromPattern" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 }}
      >
        <FieldLabel>Time windows</FieldLabel>
        <Text className="mb-2 text-xs text-shell-dim">
          Each window is one appointment slot.
          {me.data ? ` Times in ${me.data.timezone}.` : ""}
        </Text>
        {windows.map((w) => (
          <View key={w.id} className="flex-row items-center gap-2">
            <View className="flex-1">
              <TimeField
                value={w.start}
                onChange={(v) => updateWindow(w.id, "start", v)}
                placeholder="Start"
              />
            </View>
            <View className="flex-1">
              <TimeField
                value={w.end}
                onChange={(v) => updateWindow(w.id, "end", v)}
                placeholder="End"
              />
            </View>
            {windows.length > 1 ? (
              <View className="mb-3">
                <IconButton
                  icon={X}
                  label="Remove time window"
                  outlined
                  iconSize={14}
                  color={c.bone}
                  onPress={() =>
                    setWindows((prev) => prev.filter((x) => x.id !== w.id))
                  }
                />
              </View>
            ) : null}
          </View>
        ))}
        <View className="mb-4 flex-row">
          <PillButton
            label="Add time window"
            onPress={() => {
              setWindows((prev) => [
                ...prev,
                { id: nextId, start: null, end: null },
              ]);
              setNextId((n) => n + 1);
            }}
          />
        </View>

        <FieldLabel>Apply to</FieldLabel>
        <Segmented
          options={APPLY_OPTIONS}
          value={applyMode}
          onChange={(v) => setApplyMode(v)}
        />

        {applyMode === "weekdays" ? (
          <View className="mt-3">
            <View className="mb-3 flex-row flex-wrap gap-2">
              {WEEKDAY_LABELS.map((day, idx) => (
                <DayChip
                  key={day}
                  label={day}
                  selected={weekdays.includes(idx)}
                  onPress={() => toggleDay(idx)}
                />
              ))}
            </View>
            <DateField
              label="From"
              value={fromDate}
              onChange={setFromDate}
              minimumDate={minDate}
            />
            <DateField
              label="To"
              value={toDate}
              onChange={setToDate}
              minimumDate={fromDate ? toLocalDate(fromDate) : minDate}
            />
          </View>
        ) : (
          <View className="mt-3">
            <DateField
              label="Add a date"
              value={dateInput}
              onChange={setDateInput}
              minimumDate={minDate}
            />
            <View className="-mt-1 mb-3 flex-row">
              <PillButton label="Add date" onPress={addDate} />
            </View>
            {specificDates.length > 0 ? (
              <View className="mb-2 flex-row flex-wrap gap-2">
                {specificDates.map((date) => (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${formatShortDate(date)}`}
                    onPress={() =>
                      setSpecificDates((prev) =>
                        prev.filter((d) => d !== date),
                      )
                    }
                    className="flex-row items-center gap-1.5 rounded-full bg-shell-hover px-3 py-1.5 active:opacity-70"
                  >
                    <Text className="text-label text-foreground">
                      {formatShortDate(date)}
                    </Text>
                    <X size={12} color={c.shell.dim} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}

        {slotCount > 0 ? (
          <Text className="mt-3 text-sm text-shell-dim">
            Creates{" "}
            <Text className="font-semibold text-foreground">
              {slotCount} {slotCount === 1 ? "slot" : "slots"}
            </Text>
            .
          </Text>
        ) : null}

        {error ? (
          <Text className="mt-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <View className="mt-5">
          <Button
            label={
              slotCount > 0
                ? `Create ${slotCount} ${slotCount === 1 ? "slot" : "slots"}`
                : "Create slots"
            }
            onPress={submit}
            loading={saving}
            disabled={slotCount === 0}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

// Weekday toggle chip (Mo..Su) — selected = mustard fill, like FilterChip but
// compact and square-ish for the 7-up row.
function DayChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-10 w-10 items-center justify-center rounded-xl ${
        selected ? "bg-mustard" : "bg-shell-hover"
      } active:opacity-80`}
    >
      <Text
        className={`text-label font-semibold ${
          selected ? "text-charcoal" : "text-shell-dim"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
