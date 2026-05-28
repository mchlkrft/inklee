"use client";

import TimeInput from "@/components/time-input";
import DateInput from "@/components/date-input";
import { addDaysToDateKey, localDateKey } from "@/lib/date-utils";
import { useState, startTransition } from "react";
import { createSlotsFromPatternAction } from "./actions";

type Window = { id: string; start: string; end: string };

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function tomorrow() {
  return addDaysToDateKey(localDateKey(), 1);
}

function countDatesInRange(
  from: string,
  to: string,
  weekdays: number[],
): number {
  if (!from || !to || to < from || weekdays.length === 0) return 0;
  let count = 0;
  const end = new Date(to + "T12:00:00Z");
  for (
    let d = new Date(from + "T12:00:00Z");
    d <= end;
    d.setDate(d.getDate() + 1)
  ) {
    if (weekdays.includes((d.getDay() + 6) % 7)) count++;
  }
  return count;
}

export default function SlotPatternBuilder({
  timezone,
  onDone,
}: {
  timezone: string;
  onDone?: () => void;
}) {
  const todayPlusOne = tomorrow();

  const [windows, setWindows] = useState<Window[]>([
    { id: "w1", start: "", end: "" },
  ]);
  const [applyMode, setApplyMode] = useState<"dates" | "weekdays">("dates");

  // Weekday mode
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [fromDate, setFromDate] = useState(todayPlusOne);
  const [toDate, setToDate] = useState("");

  // Specific dates mode
  const [specificDates, setSpecificDates] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState(todayPlusOne);

  // Submission
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  // ── Window helpers ────────────────────────────────────────────────────────

  function addWindow() {
    setWindows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), start: "", end: "" },
    ]);
  }

  function removeWindow(id: string) {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }

  function updateWindow(id: string, field: "start" | "end", value: string) {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, [field]: value } : w)),
    );
  }

  // ── Weekday helpers ───────────────────────────────────────────────────────

  function toggleDay(idx: number) {
    setWeekdays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx],
    );
  }

  // ── Date helpers ──────────────────────────────────────────────────────────

  function addDate() {
    if (!dateInput || specificDates.includes(dateInput)) return;
    setSpecificDates((prev) => [...prev, dateInput].sort());
  }

  function removeDate(date: string) {
    setSpecificDates((prev) => prev.filter((d) => d !== date));
  }

  // ── Preview count ─────────────────────────────────────────────────────────

  const validWindows = windows.filter(
    (w) => w.start && w.end && w.end > w.start,
  );

  const dateCount =
    applyMode === "weekdays"
      ? countDatesInRange(fromDate, toDate, weekdays)
      : specificDates.length;

  const slotCount = validWindows.length * dateCount;

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (validWindows.length === 0) {
      setError(
        "Add at least one complete time window (start must be before end).",
      );
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
        setError('"To" date must be after "From" date.');
        return;
      }
    } else {
      if (specificDates.length === 0) {
        setError("Add at least one date.");
        return;
      }
    }

    const fd = new FormData();
    fd.set(
      "windows_json",
      JSON.stringify(validWindows.map((w) => ({ start: w.start, end: w.end }))),
    );
    fd.set("apply_mode", applyMode);
    if (applyMode === "weekdays") {
      fd.set("weekdays_json", JSON.stringify(weekdays));
      fd.set("from_date", fromDate);
      fd.set("to_date", toDate);
    } else {
      fd.set("dates_json", JSON.stringify(specificDates));
    }

    setSaving(true);
    setAddedCount(null);
    startTransition(async () => {
      const result = await createSlotsFromPatternAction(fd);
      setSaving(false);
      if ("error" in result) {
        setError(result.error);
      } else {
        setAddedCount(result.count);
        setWindows([{ id: "w1", start: "", end: "" }]);
        setWeekdays([]);
        setSpecificDates([]);
        if (onDone) setTimeout(onDone, 1000);
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Time windows */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Time windows</p>
        <div className="space-y-2">
          {windows.map((w) => (
            <div key={w.id} className="flex items-center gap-2">
              <TimeInput
                value={w.start}
                onChange={(e) => updateWindow(w.id, "start", e.target.value)}
                placeholder="Start"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="shrink-0 text-muted-foreground">–</span>
              <TimeInput
                value={w.end}
                onChange={(e) => updateWindow(w.id, "end", e.target.value)}
                placeholder="End"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {windows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeWindow(w.id)}
                  className="shrink-0 text-lg leading-none text-muted-foreground hover:text-destructive transition-colors"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addWindow}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          + Add time window
        </button>
        <p className="text-xs text-muted-foreground">
          Each window is one appointment slot. Times in {timezone}.
        </p>
      </div>

      {/* Apply to */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Apply to</p>

        <div className="flex gap-2">
          {(["dates", "weekdays"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setApplyMode(m)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                applyMode === m
                  ? "bg-brand-mustard text-brand-charcoal"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "dates" ? "Specific dates" : "Weekdays"}
            </button>
          ))}
        </div>

        {applyMode === "weekdays" && (
          <div className="space-y-3">
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((day, idx) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    weekdays.includes(idx)
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">From</label>
                <DateInput
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  min={todayPlusOne}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">To</label>
                <DateInput
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  min={fromDate || todayPlusOne}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </div>
        )}

        {applyMode === "dates" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <DateInput
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                min={todayPlusOne}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={addDate}
                className="shrink-0 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Add
              </button>
            </div>
            {specificDates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {specificDates.map((date) => (
                  <span
                    key={date}
                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground"
                  >
                    {date}
                    <button
                      type="button"
                      onClick={() => removeDate(date)}
                      className="leading-none text-muted-foreground hover:text-destructive transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview */}
      {slotCount > 0 && !addedCount && (
        <p className="text-sm text-muted-foreground">
          Creates{" "}
          <span className="text-foreground font-medium">
            {slotCount} slot{slotCount !== 1 ? "s" : ""}
          </span>
          .
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {addedCount !== null && (
        <p className="text-sm text-green-500">
          {addedCount} slot{addedCount !== 1 ? "s" : ""} added.
          {onDone && " Closing…"}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || slotCount === 0}
        className="rounded-full bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {saving
          ? "Creating…"
          : slotCount > 0
            ? `Create ${slotCount} slot${slotCount !== 1 ? "s" : ""}`
            : "Create slots"}
      </button>
    </form>
  );
}
