// Brand swatches for the public-page cover header. The SINGLE source for both
// the swatch picker UI (web profile form + mobile profile screen) and the
// server-side sanitizer that decides which stored cover_color values are valid.
// Previously the {id,hex,label} list was copy-pasted into both forms and the
// {id} set + sanitizer was copy-pasted across the web action and mobile-settings.
// Pure + Intl-free. (ME-10 D19)

export const COVER_COLORS = [
  { id: "mustard", hex: "#e9b22b", label: "Mustard" },
  { id: "rosa", hex: "#db88b9", label: "Rosa" },
  { id: "cobalt", hex: "#0b3d9f", label: "Cobalt" },
  { id: "red", hex: "#cf2e2c", label: "Red" },
  { id: "green", hex: "#105f2d", label: "Green" },
] as const;

export type CoverColorId = (typeof COVER_COLORS)[number]["id"];

const COVER_COLOR_IDS: ReadonlySet<string> = new Set(
  COVER_COLORS.map((c) => c.id),
);

const HEX_RE = /^#[0-9a-f]{3,8}$/;

/**
 * Accept a brand swatch id or a raw lowercase #hex; anything else returns null.
 * Never throws and never "fails" a save: an unrecognised value is simply treated
 * as "no cover colour set", matching the prior web + mobile behaviour exactly.
 */
export function sanitizeCoverColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (COVER_COLOR_IDS.has(v)) return v;
  if (HEX_RE.test(v)) return v;
  return null;
}
