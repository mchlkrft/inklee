import { SvgXml } from "react-native-svg";
import type { LucideIcon } from "@/lib/icon-types";
import { INKLEE_ICON_ART } from "@inklee/shared/inklee-icon-art";

// Render map for the inklee icon library (trips + studios, artist-side only).
// Known keys render the founder's custom tattoo-badge SVG — single-colour line
// art whose fill=currentColor is resolved from the `color` prop. Unknown/null
// keys fall back to the caller's lucide glyph (reads are permissive; only writes
// are sanitised). Artwork + the web twin share @inklee/shared/inklee-icon-art.

// Assemble the shared inner markup into a full <svg> per (key, color). Every
// element inherits `fill` from the root, so baking the resolved colour straight
// onto the root is more robust across react-native-svg versions than relying on
// currentColor resolution. SvgXml re-parses its string each render, so we cache
// the assembled XML (bounded: ~25 keys x a few theme colours).
const xmlCache = new Map<string, string>();
function iconXml(key: string, color: string): string | null {
  const cacheKey = `${key}|${color}`;
  const cached = xmlCache.get(cacheKey);
  if (cached !== undefined) return cached || null;
  const art = INKLEE_ICON_ART[key];
  const xml = art
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.viewBox}" fill="${color}">${art.inner}</svg>`
    : "";
  xmlCache.set(cacheKey, xml);
  return xml || null;
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
  const xml = icon ? iconXml(icon, color) : null;
  if (xml) {
    return <SvgXml xml={xml} width={size} height={size} />;
  }
  const Glyph = fallback;
  return <Glyph size={size} color={color} />;
}
