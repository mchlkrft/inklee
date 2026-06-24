// One source for "is this a safe external URL to render as an href / open
// natively". Accepts ONLY http(s), normalized through the URL parser, so a
// customer-supplied value can never smuggle a javascript:, data:, mailto:,
// tel:, app-deep-link or protocol-relative scheme into an artist-facing link
// sink. Returns the normalized URL string, or null for anything unsafe/junk.
// Pure module (no zod), so the RN bundle can import it too.
export function sanitizeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null; // not absolute / unparseable (incl. protocol-relative "//x")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}
