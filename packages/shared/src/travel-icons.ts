// The inklee icon library keys for trips + studios — shared by the web picker,
// the mobile picker and every validator, so the two platforms cannot drift.
// Keys are SEMANTIC and stable; the artwork lives in ./inklee-icon-art (one
// source of truth for both render maps: apps/web/src/components/travel-icon.tsx
// and apps/mobile/src/components/TravelIcon.tsx).
// Pure module: no zod (it ships in the RN bundle), no Intl.
//
// History: these were lucide "travel" stand-ins (plane/pin/compass/…) until the
// founder's custom Inklee tattoo-badge set landed (2026-06-17). The names below
// stay "travel*" to avoid churning ~14 import sites; the concept is now the
// inklee icon set. Old stored keys (plane, pin, …) are unknown to the new set,
// so they sanitise to NULL on the next save and render the caller's fallback
// glyph in the meantime (reads are permissive, writes are sanitised).

export const TRAVEL_ICON_KEYS = [
  "panther",
  "web",
  "cobra",
  "dice",
  "skull",
  "sacred-heart",
  "om",
  "devil",
  "gentleman",
  "pinup",
  "piston-skull",
  "rose",
  "eagle-head",
  "winged-panther",
  "handshake",
  "dagger",
  "chalice",
  "moth",
  "dragon",
  "mermaid",
  "swallow",
  "eagle",
  "speed-skull",
  "weeping-heart",
  "cherub",
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

// Curated brand palette for the artist-chosen icon color: bone, mustard, rosa,
// cobalt, red, green, charcoal. Bone rejoined the palette when the tile
// background became customizable (a bone mark reads on the dark backgrounds;
// the picker preview makes bone-on-bone obvious). NULL = no choice → the
// owner's default color below. Both platforms render the same hex.
export const TRAVEL_ICON_COLORS = [
  "#e5e1d5",
  "#e9b22b",
  "#db88b9",
  "#0b3d9f",
  "#cf2e2c",
  "#105f2d",
  "#1e1e1e",
] as const;

export type TravelIconColor = (typeof TRAVEL_ICON_COLORS)[number];

// The same brand palette for the icon TILE background. NULL = no choice →
// DEFAULT_ICON_BG (bone, the tile's historic fixed color).
export const TRAVEL_ICON_BG_COLORS = [
  "#e5e1d5",
  "#e9b22b",
  "#db88b9",
  "#0b3d9f",
  "#cf2e2c",
  "#105f2d",
  "#1e1e1e",
] as const;

export type TravelIconBg = (typeof TRAVEL_ICON_BG_COLORS)[number];

/** Tile background when the artist makes no choice: bone, on both platforms
 *  and in both themes. */
export const DEFAULT_ICON_BG = "#e5e1d5";

/** Icon color when the artist makes no choice, per owner (founder defaults):
 *  trips mark charcoal on the bone tile, studios mark red. One source for the
 *  web + mobile pickers and the card renderers. */
export const DEFAULT_TRIP_ICON_COLOR = "#1e1e1e";
export const DEFAULT_STUDIO_ICON_COLOR = "#cf2e2c";

/** A random icon from the library, for pre-filling a NEW trip/studio so the
 *  default is a real inklee mark rather than the generic fallback glyph. */
export function randomTravelIconKey(): TravelIconKey {
  return TRAVEL_ICON_KEYS[Math.floor(Math.random() * TRAVEL_ICON_KEYS.length)];
}

/** Write guard for the icon color: a value outside the palette saves as NULL
 *  (default color). Case-insensitive so "#E9B22B" matches. */
export function sanitizeTravelIconColor(value: unknown): TravelIconColor | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  return (TRAVEL_ICON_COLORS as readonly string[]).includes(lower)
    ? (lower as TravelIconColor)
    : null;
}

/** Write guard for the tile background: a value outside the palette saves as
 *  NULL (bone). Case-insensitive, like the icon color guard. */
export function sanitizeTravelIconBg(value: unknown): TravelIconBg | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  return (TRAVEL_ICON_BG_COLORS as readonly string[]).includes(lower)
    ? (lower as TravelIconBg)
    : null;
}
