"use client";

import TimeInput from "@/components/time-input";
import DateInput from "@/components/date-input";
import { addDaysToDateKey, localDateKey } from "@/lib/date-utils";
import { useState, startTransition } from "react";
import { createSlotAction, createSlotBlockAction } from "./actions";

const DURATIONS = [30, 60, 90, 120, 150, 180, 240];

const tomorrow = () => addDaysToDateKey(localDateKey(), 1);

function countSubSlots(
  startTime: string,
  endTime: string,
  duration: number,
): number {
  if (!startTime || !endTime || !duration) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const totalMinutes = eh * 60 + em - (sh * 60 + sm);
  if (totalMinutes <= 0) return 0;
  return Math.floor(totalMinutes / duration);
}

export default function CreateSlotForm() {
  const [mode, setMode] = useState<"single" | "block">("single");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [duration, setDuration] = useState(120);
  const slotCount =
    mode === "block" ? countSubSlots(startTime, endTime, duration) : 0;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    setSuccess(false);
    const action = mode === "single" ? createSlotAction : createSlotBlockAction;
    startTransition(async () => {
      const result = await action(fd);
      setSaving(false);
      if ("error" in result) setError(result.error);
      else {
        setSuccess(true);
        (e.target as HTMLFormElement).reset();
      }
    });
  };

  return (
    <div className="rounded-md border border-border p-5 space-y-5">
      <div className="flex gap-2">
        {(["single", "block"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              mode === m
                ? "bg-brand-mustard text-brand-charcoal"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {m === "single" ? "Single slot" : "Block of slots"}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className="text-sm text-green-500">
          {mode === "single" ? "Slot added." : `${slotCount} slots added.`}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Date</label>
            <DateInput
              name="date"
              required
              min={tomorrow()}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {mode === "single" ? (
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Start time
              </label>
              <TimeInput
                name="time"
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Start</label>
              <TimeInput
                name="start_time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
        </div>

        {mode === "block" && (
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">End</label>
            <TimeInput
              name="end_time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm text-muted-foreground">Duration</label>
          <select
            name="duration"
            required
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value, 10))}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d < 60
                  ? `${d} min`
                  : `${d / 60}h${d % 60 ? ` ${d % 60}min` : ""}`}
              </option>
            ))}
          </select>
        </div>

        {mode === "block" && slotCount > 0 && (
          <p className="text-xs text-muted-foreground">
            This will generate{" "}
            <span className="text-foreground">
              {slotCount} slot{slotCount !== 1 ? "s" : ""}
            </span>
            .
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {saving
            ? "Adding..."
            : mode === "single"
              ? "Add slot"
              : "Generate slots"}
        </button>
      </form>
    </div>
  );
}
