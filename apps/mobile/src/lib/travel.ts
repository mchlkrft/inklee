// Presentation + cache helpers for the travel/guest-spot screens.
import type { QueryClient } from "@tanstack/react-query";
import {
  VISIBILITY_LABELS,
  VISIBILITY_MODES,
} from "@inklee/shared/studio-validation";
import { legIsActive as sharedLegIsActive } from "@inklee/shared/trip-validation";
import { localDateKey } from "@inklee/shared/date-utils";

export { rangesOverlap } from "@inklee/shared/trip-validation";
import { invalidateByPathPrefix } from "./api";
import { formatShortDate } from "./date";

// Every /travel view PLUS /home (the dashboard guest-spots widget renders trip
// titles and studio names) PLUS /calendar (trip legs mark the calendar grid).
// (The screens used to carry two same-named copies of this helper, and the
// studios one had silently dropped /home — studio renames left Home stale.)
export function invalidateTravel(client: QueryClient): Promise<void> {
  return invalidateByPathPrefix(client, ["/travel", "/home", "/calendar"]);
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

/** A leg is "active" when today's local (device) date-key falls within its
 *  range. Thin wrapper over the shared predicate, injecting the device today. */
export function legIsActive(startsOn: string, endsOn: string): boolean {
  return sharedLegIsActive(startsOn, endsOn, localDateKey());
}
