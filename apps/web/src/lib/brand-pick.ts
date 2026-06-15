// Picked once at module load in the browser — shared across all components
// so logo color and loader color always match. Changes on hard reload.
//
// Palette reduced 2026-05-25 from 6 colours (blue / bone / green / mustard /
// red / rosa) to 3 (bone / mustard / rosa). Founder rule: keep the random
// rotation tight on-brand. Charcoal stays the manual choice for light-
// background surfaces via `SiteLogo` and isn't part of this rotation.

const COLORS = ["bone", "mustard", "rosa"] as const;
export type BrandColor = (typeof COLORS)[number];

let _color: BrandColor | null = null;

export function getBrandColor(): BrandColor {
  if (!_color) _color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return _color;
}
