import { createElement } from "react";
import {
  Anchor,
  Compass,
  MapPin,
  Moon,
  Mountain,
  Plane,
  Skull,
  Snowflake,
  Sun,
  TreePalm,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { TravelIconKey } from "@inklee/shared/travel-icons";

// Render map for the inklee travel icon library (trips + studios, artist-side
// only). Lucide stand-ins today — when the founder's custom SVGs land, ONLY
// this file (and the mobile twin) changes; the stored keys stay.
const GLYPHS: Record<TravelIconKey, LucideIcon> = {
  plane: Plane,
  pin: MapPin,
  compass: Compass,
  anchor: Anchor,
  mountain: Mountain,
  sun: Sun,
  palm: TreePalm,
  wave: Waves,
  snowflake: Snowflake,
  moon: Moon,
  lightning: Zap,
  skull: Skull,
};

/** Resolve a stored icon key to its glyph. Unknown/null keys fall back to the
 *  caller's default (reads are permissive; only writes are sanitized). */
export function travelIconGlyph(
  key: string | null | undefined,
  fallback: LucideIcon,
): LucideIcon {
  if (!key) return fallback;
  return GLYPHS[key as TravelIconKey] ?? fallback;
}

export function TravelIcon({
  icon,
  fallback,
  className,
}: {
  icon: string | null | undefined;
  fallback: LucideIcon;
  className?: string;
}) {
  // createElement, not JSX: the glyph is SELECTED from a static map (never
  // created during render), but the static-components lint rule can't tell.
  return createElement(travelIconGlyph(icon, fallback), { className });
}
