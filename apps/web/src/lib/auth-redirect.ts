/**
 * Only same-origin absolute paths are allowed as a post-auth redirect target.
 * Blocks an open redirect via a crafted `next` (e.g. "//evil.com" or "/\evil",
 * which browsers treat as protocol-relative, or "@evil.com" userinfo tricks).
 * Shared by /auth/confirm and /auth/callback; callers that mint links (e.g.
 * the mobile connect-link endpoint) also allowlist `next`.
 */
export function safeNextPath(next: string | null): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return "/dashboard";
  }
  return next;
}
