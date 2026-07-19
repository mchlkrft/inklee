// Temporary studio signals (Inklee 2.0 Phase 3 follow-on; Q7 resolved
// 2026-07-19). One short-lived typed signal per owner per month. Display:
// a ring on the studio's map marker (zoomed-in only), a map filter toggle,
// and a detail page section; signals expire silently. Watchers get an
// in-app notification, nothing else.

export const STUDIO_SIGNAL_TYPES = [
  "guest_chair_open",
  "flash_day_planned",
  "looking_for_guest_artist",
  "convention_week",
  "walk_in_day",
  "new_resident_artist",
  "studio_relocation",
  "private_room_available",
] as const;
export type StudioSignalType = (typeof STUDIO_SIGNAL_TYPES)[number];

export const STUDIO_SIGNAL_LABELS: Record<StudioSignalType, string> = {
  guest_chair_open: "Guest chair open",
  flash_day_planned: "Flash day planned",
  looking_for_guest_artist: "Looking for a guest artist",
  convention_week: "Convention week",
  walk_in_day: "Walk-in day",
  new_resident_artist: "New resident artist",
  studio_relocation: "Studio relocation",
  private_room_available: "Private room available",
};

/** Every signal lives this long, then silently disappears. */
export const STUDIO_SIGNAL_DURATION_DAYS = 14;

/**
 * The locked posting cap: one signal per owner account per rolling month,
 * counted against creation (withdrawing does not free a repost).
 */
export const STUDIO_SIGNAL_MONTHLY_CAP = 1;
export const STUDIO_SIGNAL_CAP_WINDOW_DAYS = 30;

export function isStudioSignalType(value: string): value is StudioSignalType {
  return (STUDIO_SIGNAL_TYPES as readonly string[]).includes(value);
}

export function signalExpiry(from: Date): Date {
  return new Date(
    from.getTime() + STUDIO_SIGNAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );
}
