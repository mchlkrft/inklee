// Shared constants for the travel map (page legend + map client). Pure module so
// both the server page and the client component can import it.

export const BRAND = {
  mustard: "#e9b22b",
  cobalt: "#0b3d9f",
  charcoal: "#1e1e1e",
  bone: "#e5e1d5",
} as const;

// Muted grey for already-travelled (past) journey stops + the travelled line.
export const PAST_GREY = "#8a8a8a";

// CARTO Voyager: a Google-like, OSM-based vector basemap, free for use, no key.
export const VOYAGER_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

// Readable text on a pin/badge background: charcoal on the light mustard (white
// fails contrast there), white otherwise.
export function onPinText(bg: string): string {
  return bg.toLowerCase() === BRAND.mustard.toLowerCase()
    ? BRAND.charcoal
    : "#ffffff";
}
