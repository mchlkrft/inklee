// Picked once at module load in the browser — shared across all components
// so logo color and loader color always match. Changes on hard reload.

const COLORS = ["blue", "bone", "green", "mustard", "red", "rosa"] as const;
export type BrandColor = (typeof COLORS)[number];

let _color: BrandColor | null = null;

export function getBrandColor(): BrandColor {
  if (!_color) _color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return _color;
}
