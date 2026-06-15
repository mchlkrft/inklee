// Slot pattern expansion + validation — the ONE source of truth shared by the
// web SlotPatternBuilder (live preview), the web server action, the mobile
// pattern-builder screen (live preview) and the /api/mobile/slots routes.
// Pure date/string math only: no Intl calls (Hermes iOS has no Intl, and the
// mobile client imports this at runtime), no zod (kept out of the RN bundle).
// The wall-clock -> UTC conversion (which DOES need Intl) stays server-side in
// apps/web/src/lib/server/slots.ts.

import { addDaysToDateKey } from "./date-utils";

export type SlotWindow = { start: string; end: string };

/** A validated pattern: time windows x (specific dates | weekdays in range).
 *  Each window on each date becomes ONE slot whose duration is end - start. */
export type SlotPatternInput = {
  windows: SlotWindow[];
  applyMode: "dates" | "weekdays";
  /** dates mode: explicit YYYY-MM-DD keys. */
  dates?: string[];
  /** weekdays mode: Monday-first indices 0..6 + an inclusive date-key range. */
  weekdays?: number[];
  fromDate?: string;
  toDate?: string;
};

export type SlotPatternResult =
  | { ok: true; value: SlotPatternInput }
  | { ok: false; error: string };

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// Format AND range: "25:00" / "23:60" pass the regex but produce Invalid Date
// downstream (localToUTC would throw outside the error envelope).
function isRealTime(value: string): boolean {
  if (!TIME_RE.test(value)) return false;
  return Number(value.slice(0, 2)) <= 23 && Number(value.slice(3, 5)) <= 59;
}

// A real calendar date: the round-trip comparison rejects rollovers like
// 2026-02-30 (which Date silently turns into March 2) and the NaN guard
// rejects month 00/13+.
function isRealDateKey(key: string): boolean {
  if (!DATE_KEY_RE.test(key)) return false;
  const d = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

/** Weekday chip labels, Monday-first — matches the (getUTCDay()+6)%7 rule. */
export const WEEKDAY_LABELS = [
  "Mo",
  "Tu",
  "We",
  "Th",
  "Fr",
  "Sa",
  "Su",
] as const;

/**
 * Validate an untrusted candidate (parsed form data or a JSON body) into a
 * SlotPatternInput. Semantics and error copy match the original web action;
 * the date/time FORMAT checks are additive hardening both platforms get
 * together (the action previously trusted the strings it fed to localToUTC).
 */
export function validateSlotPattern(candidate: unknown): SlotPatternResult {
  const c = (candidate ?? {}) as Record<string, unknown>;

  const rawWindows = c.windows;
  if (!Array.isArray(rawWindows) || rawWindows.length === 0) {
    return { ok: false, error: "At least one time window is required." };
  }
  const windows: SlotWindow[] = [];
  for (const raw of rawWindows) {
    const w = (raw ?? {}) as Record<string, unknown>;
    if (
      typeof w.start !== "string" ||
      typeof w.end !== "string" ||
      !isRealTime(w.start) ||
      !isRealTime(w.end)
    ) {
      return { ok: false, error: "Invalid window data." };
    }
    if (w.end <= w.start) {
      return {
        ok: false,
        error: "Each window must have a start time before its end time.",
      };
    }
    windows.push({ start: w.start, end: w.end });
  }

  if (c.applyMode === "weekdays") {
    const weekdays = c.weekdays;
    if (!Array.isArray(weekdays) || weekdays.length === 0) {
      return { ok: false, error: "Select at least one weekday." };
    }
    if (
      !weekdays.every(
        (d) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
      )
    ) {
      return { ok: false, error: "Invalid weekday data." };
    }
    const fromDate = c.fromDate;
    const toDate = c.toDate;
    if (
      typeof fromDate !== "string" ||
      typeof toDate !== "string" ||
      !isRealDateKey(fromDate) ||
      !isRealDateKey(toDate)
    ) {
      return { ok: false, error: "Date range is required." };
    }
    return {
      ok: true,
      value: {
        windows,
        applyMode: "weekdays",
        weekdays: weekdays as number[],
        fromDate,
        toDate,
      },
    };
  }

  if (c.applyMode === "dates") {
    const dates = c.dates;
    if (!Array.isArray(dates) || dates.length === 0) {
      return { ok: false, error: "Add at least one date." };
    }
    if (!dates.every((d) => typeof d === "string" && isRealDateKey(d))) {
      return { ok: false, error: "Invalid date data." };
    }
    return {
      ok: true,
      value: { windows, applyMode: "dates", dates: dates as string[] },
    };
  }

  return { ok: false, error: "Invalid apply mode." };
}

/**
 * Expand a validated pattern into its date keys. Weekday matching uses the
 * Monday-first (getUTCDay()+6)%7 rule on a UTC-noon anchor and ISO string
 * comparison for the range walk. getUTCDay (not getDay): this runs on the
 * client too, and a device at UTC+13/+14 would read the noon-UTC anchor as
 * the NEXT local day, shifting every weekday by one against the server.
 * On the UTC server the result is identical to the original action.
 */
export function expandPatternDates(input: SlotPatternInput): string[] {
  if (input.applyMode === "dates") return [...(input.dates ?? [])];
  const weekdays = input.weekdays ?? [];
  const dates: string[] = [];
  if (!input.fromDate || !input.toDate) return dates;
  for (
    let dateKey = input.fromDate;
    dateKey <= input.toDate;
    dateKey = addDaysToDateKey(dateKey, 1)
  ) {
    const d = new Date(`${dateKey}T12:00:00Z`);
    if (weekdays.includes((d.getUTCDay() + 6) % 7)) {
      dates.push(dateKey);
    }
  }
  return dates;
}

/** Date count for the live preview in weekdays mode (web + mobile builders). */
export function countDatesInRange(
  from: string,
  to: string,
  weekdays: number[],
): number {
  if (!from || !to || to < from || weekdays.length === 0) return 0;
  return expandPatternDates({
    windows: [],
    applyMode: "weekdays",
    weekdays,
    fromDate: from,
    toDate: to,
  }).length;
}

/** Total slots a pattern creates — the "Creates N slots" preview AND what the
 *  server inserts come from this same expansion, so they cannot disagree. */
export function countPatternSlots(input: SlotPatternInput): number {
  return input.windows.length * expandPatternDates(input).length;
}
