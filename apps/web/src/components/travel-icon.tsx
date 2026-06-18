import { createElement } from "react";
import type { LucideIcon } from "lucide-react";
import { INKLEE_ICON_ART } from "@inklee/shared/inklee-icon-art";

// Render map for the inklee icon library (trips + studios, artist-side only).
// Known keys render the founder's custom tattoo-badge SVG — single-colour line
// art tinted via the ambient CSS text color (fill=currentColor). Unknown/null
// keys fall back to the caller's lucide glyph (reads are permissive; only writes
// are sanitised). Artwork + the mobile twin share @inklee/shared/inklee-icon-art.

export function TravelIcon({
  icon,
  fallback,
  className,
  color,
}: {
  icon: string | null | undefined;
  fallback: LucideIcon;
  className?: string;
  /** Optional explicit color (hex). When set, overrides the ambient text color
   *  so the artist's chosen icon color shows; absent = inherit currentColor. */
  color?: string | null;
}) {
  const style = color ? { color } : undefined;
  const art = icon ? INKLEE_ICON_ART[icon] : undefined;
  if (art) {
    return (
      <svg
        viewBox={art.viewBox}
        fill="currentColor"
        className={className}
        style={style}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: art.inner }}
      />
    );
  }
  // createElement, not JSX: the glyph is SELECTED (never created during render),
  // but the static-components lint rule can't tell.
  return createElement(fallback, { className, style });
}
