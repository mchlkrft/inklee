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
  WavesHorizontal,
  Zap,
} from "lucide-react-native";
import type { LucideIcon } from "@/lib/icon-types";
import type { TravelIconKey } from "@inklee/shared/travel-icons";

// Render map for the inklee travel icon library (trips + studios, artist-side
// only). Lucide stand-ins today — when the founder's custom SVGs land, ONLY
// this file changes; the stored keys (@inklee/shared/travel-icons) stay.
const GLYPHS: Record<TravelIconKey, LucideIcon> = {
  plane: Plane,
  pin: MapPin,
  compass: Compass,
  anchor: Anchor,
  mountain: Mountain,
  sun: Sun,
  palm: TreePalm,
  wave: WavesHorizontal,
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
  size = 16,
  color,
}: {
  icon: string | null | undefined;
  fallback: LucideIcon;
  size?: number;
  color: string;
}) {
  const Glyph = travelIconGlyph(icon, fallback);
  return <Glyph size={size} color={color} />;
}
