// The inklee icon library keys for trips + studios — shared by the web picker,
// the mobile picker and every validator, so the two platforms cannot drift.
// Keys are SEMANTIC and stable: the founder's custom SVGs replace the per-
// platform render maps (apps/web/src/components/travel-icon.tsx and
// apps/mobile/src/components/TravelIcon.tsx) later with zero data changes.
// Pure module: no zod (it ships in the RN bundle), no Intl.

export const TRAVEL_ICON_KEYS = [
  "plane",
  "pin",
  "compass",
  "anchor",
  "mountain",
  "sun",
  "palm",
  "wave",
  "snowflake",
  "moon",
  "lightning",
  "skull",
] as const;

export type TravelIconKey = (typeof TRAVEL_ICON_KEYS)[number];

/** Write guard: anything outside the library saves as NULL (no icon). Reads
 *  stay permissive — an unknown key from a newer build renders the fallback
 *  glyph, never an error. */
export function sanitizeTravelIcon(value: unknown): TravelIconKey | null {
  return typeof value === "string" &&
    (TRAVEL_ICON_KEYS as readonly string[]).includes(value)
    ? (value as TravelIconKey)
    : null;
}
