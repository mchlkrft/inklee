/**
 * Date-range resolution for the Growth cockpit. Pure (no IO) so range math,
 * previous-period comparison, and timezone bucketing are unit-testable.
 *
 * Ranges are half-open [from, to). "Previous period" is the equal-length
 * window immediately before `from`. All day boundaries are computed in the
 * reporting timezone so a Berlin admin's "today" never shifts under UTC.
 */

export type GrowthRangeKey =
  | "7"
  | "30"
  | "90"
  | "365"
  | "month"
  | "prev-month"
  | "all"
  | "custom";

export type ResolvedRange = {
  key: GrowthRangeKey;
  label: string;
  from: Date;
  to: Date;
  previousFrom: Date | null;
  previousTo: Date | null;
  /** Suggested series bucket for the window length. */
  bucket: "day" | "week" | "month";
};

/** Earliest date the product has data for (first prod signup 2026-04-19). */
export const GROWTH_EPOCH = new Date("2026-04-01T00:00:00Z");

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date (2026-13-45 is digit-shaped but invalid and
 *  would make Intl throw downstream). */
export function isValidDayKey(key: string): boolean {
  if (!DATE_KEY_RE.test(key)) return false;
  const parsed = new Date(`${key}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key
  );
}

// Intl.DateTimeFormat construction is expensive and the instances are
// stateless for format(): cache one per timezone (cohort grids call this
// thousands of times per render).
const dayKeyFormats = new Map<string, Intl.DateTimeFormat>();

/** YYYY-MM-DD of `date` in `timeZone` (en-CA locale formats exactly that). */
export function dayKeyInTimeZone(date: Date, timeZone: string): string {
  let format = dayKeyFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayKeyFormats.set(timeZone, format);
  }
  return format.format(date);
}

/** UTC instant of local midnight starting the given YYYY-MM-DD in timeZone. */
export function startOfDayInTimeZone(dayKey: string, timeZone: string): Date {
  // Initial guess: midnight UTC of that date, then correct by the zone offset
  // (two passes handle DST edges: the second pass re-derives the offset at the
  // corrected instant).
  let guess = new Date(`${dayKey}T00:00:00Z`);
  for (let i = 0; i < 2; i++) {
    const localKey = dayKeyInTimeZone(guess, timeZone);
    if (localKey === dayKey) {
      const hour = parseInt(
        new Intl.DateTimeFormat("en-GB", {
          timeZone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(guess),
        10,
      );
      if (hour === 0) return guess;
      guess = new Date(guess.getTime() - hour * 3_600_000);
    } else if (localKey < dayKey) {
      guess = new Date(guess.getTime() + 24 * 3_600_000);
    } else {
      guess = new Date(guess.getTime() - 24 * 3_600_000);
    }
  }
  return guess;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function monthBounds(
  now: Date,
  timeZone: string,
  monthsBack: number,
): { from: Date; to: Date } {
  const todayKey = dayKeyInTimeZone(now, timeZone);
  const [y, m] = todayKey.split("-").map((v) => parseInt(v, 10));
  const target = new Date(Date.UTC(y, m - 1 - monthsBack, 1));
  const next = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 1),
  );
  const fromKey = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const toKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return {
    from: startOfDayInTimeZone(fromKey, timeZone),
    to: startOfDayInTimeZone(toKey, timeZone),
  };
}

function bucketFor(from: Date, to: Date): "day" | "week" | "month" {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days <= 45) return "day";
  if (days <= 200) return "week";
  return "month";
}

/**
 * Resolve ?range= (+ optional ?from=&to= for custom) into concrete bounds.
 * Unknown values fall back to the 30-day view. `now` is injectable for tests.
 */
export function resolveGrowthRange(
  params: { range?: string; from?: string; to?: string },
  timeZone: string,
  now: Date = new Date(),
): ResolvedRange {
  const raw = params.range ?? "30";

  if (
    raw === "custom" &&
    params.from &&
    params.to &&
    isValidDayKey(params.from) &&
    isValidDayKey(params.to) &&
    params.from <= params.to
  ) {
    const from = startOfDayInTimeZone(params.from, timeZone);
    // Inclusive end date in the UI, exclusive bound internally.
    const to = startOfDayInTimeZone(params.to, timeZone);
    const toExclusive = addDays(to, 1);
    const spanMs = toExclusive.getTime() - from.getTime();
    return {
      key: "custom",
      label: `${params.from} to ${params.to}`,
      from,
      to: toExclusive,
      previousFrom: new Date(from.getTime() - spanMs),
      previousTo: from,
      bucket: bucketFor(from, toExclusive),
    };
  }

  if (raw === "month" || raw === "prev-month") {
    const back = raw === "month" ? 0 : 1;
    const { from, to } = monthBounds(now, timeZone, back);
    const prev = monthBounds(now, timeZone, back + 1);
    return {
      key: raw,
      label: raw === "month" ? "This month" : "Last month",
      from,
      to,
      previousFrom: prev.from,
      previousTo: prev.to,
      bucket: "day",
    };
  }

  if (raw === "all") {
    return {
      key: "all",
      label: "All time",
      from: GROWTH_EPOCH,
      to: now,
      previousFrom: null,
      previousTo: null,
      bucket: "month",
    };
  }

  const days =
    raw === "7" || raw === "90" || raw === "365" ? parseInt(raw, 10) : 30;
  const key: GrowthRangeKey =
    raw === "7" || raw === "90" || raw === "365"
      ? (raw as GrowthRangeKey)
      : "30";
  // Anchor to the start of tomorrow in the reporting timezone so "last 7 days"
  // includes all of today and never shifts mid-day.
  const endKey = dayKeyInTimeZone(now, timeZone);
  const to = addDays(startOfDayInTimeZone(endKey, timeZone), 1);
  const from = addDays(to, -days);
  return {
    key,
    label: `Last ${days} days`,
    from,
    to,
    previousFrom: addDays(from, -days),
    previousTo: from,
    bucket: bucketFor(from, to),
  };
}
