// Presentation helpers for the travel/guest-spot screens.
import {
  VISIBILITY_LABELS,
  VISIBILITY_MODES,
} from "@inklee/shared/studio-validation";
import { formatShortDate } from "./date";

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
