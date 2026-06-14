// Cover header resolution for the public artist surfaces (booking page + Link
// Hub). One definition so both pages resolve the artist's cover color/image
// identically. Values come from profile.settings.cover_color / cover_image_url.

// Brand-color name → hex. Artists can also pass a raw hex like "#0b3d9f".
const BRAND_COLOR_HEX: Record<string, string> = {
  mustard: "#e9b22b",
  rosa: "#db88b9",
  cobalt: "#0b3d9f",
  red: "#cf2e2c",
  green: "#105f2d",
  charcoal: "#1e1e1e",
  bone: "#e5e1d5",
};

export function resolveCoverColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v in BRAND_COLOR_HEX) return BRAND_COLOR_HEX[v];
  if (/^#[0-9a-f]{3,8}$/.test(v)) return v;
  return null;
}

export function resolveCoverImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  // Permit only https://, http:// (local dev), and protocol-relative URLs.
  // No data: or javascript: URIs.
  if (
    !v.startsWith("https://") &&
    !v.startsWith("http://") &&
    !v.startsWith("//")
  ) {
    return null;
  }
  return v;
}
