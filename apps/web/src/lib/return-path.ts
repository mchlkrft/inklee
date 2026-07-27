// Return-target sanitizer for post-auth redirects (go-live plan S2: the map's
// sign-in walls carry the intended action as ?next=). Open-redirect hardened:
// only a same-origin RELATIVE path survives; anything absolute,
// protocol-relative, backslashed, control-charactered, or oversized falls
// back to null and the caller uses its default destination.
const MAX_RETURN_PATH_LENGTH = 512;

export function sanitizeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (path.length === 0 || path.length > MAX_RETURN_PATH_LENGTH) return null;
  // Must be a rooted relative path: "/x..." but never "//host" (protocol
  // relative) or "/\" tricks; no scheme, no whitespace, no control chars.
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  if (/[\\\s\0-\x1f]/.test(path)) return null;
  return path;
}
