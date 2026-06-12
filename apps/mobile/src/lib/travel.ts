// Presentation + cache helpers for the travel/guest-spot screens.
import type { QueryClient } from "@tanstack/react-query";
import {
  VISIBILITY_LABELS,
  VISIBILITY_MODES,
} from "@inklee/shared/studio-validation";
import { localDateKey } from "@inklee/shared/date-utils";
import { invalidateByPathPrefix } from "./api";
import { formatShortDate } from "./date";

// Every /travel view PLUS /home: the dashboard guest-spots widget renders trip
// titles and studio names, so a trip/leg/studio change must refresh it too.
// (The screens used to carry two same-named copies of this helper, and the
// studios one had silently dropped /home — studio renames left Home stale.)
export function invalidateTravel(client: QueryClient): Promise<void> {
  return invalidateByPathPrefix(client, ["/travel", "/home"]);
}

export const VISIBILITY_OPTIONS = VISIBILITY_MODES.map((value) => ({
  value,
  label: VISIBILITY_LABELS[value],
}));

export function visibilityLabel(mode: string): string {
  return (VISIBILITY_LABELS as Record<string, string>)[mode] ?? mode;
}

/** "Aug 1 – Aug 5" (or a single date when start === end). */
export function formatDateRange(startsOn: string, endsOn: string): string {
  if (startsOn === endsOn) return formatShortDate(startsOn);
  return `${formatShortDate(startsOn)} – ${formatShortDate(endsOn)}`;
}

// Two date ranges overlap when each starts on or before the other ends. Pure
// date-key string compare (tz-safe, YYYY-MM-DD sorts lexically) — the same logic
// web's trip-manager uses. Overlapping stops are allowed (an artist can work
// several studios at once), but the client can't tell which studio applies, so
// we surface a notice.
export function rangesOverlap(
  ranges: { startsOn: string; endsOn: string }[],
): boolean {
  return ranges.some((a, i) =>
    ranges.some(
      (b, j) => i !== j && a.startsOn <= b.endsOn && b.startsOn <= a.endsOn,
    ),
  );
}

/** A leg is "active" when today's local date-key falls within its range. */
export function legIsActive(startsOn: string, endsOn: string): boolean {
  const today = localDateKey();
  return startsOn <= today && endsOn >= today;
}
