/**
 * Extract the client IP from request headers, parsed the same safe way
 * everywhere. On Vercel `x-forwarded-for` is "<client>, <proxy>, ..." with the
 * real client IP leftmost, so we take only the first entry and trim it. The
 * raw header (used in a couple of older call sites) can be a comma-separated
 * chain, which both pollutes rate-limit keys and is a poor value to hand to
 * Stripe for `tos_acceptance.ip`. Centralized so callers don't diverge.
 *
 * Note: `x-forwarded-for` is ultimately client-influenced; treat the result as
 * best-effort, not a trust boundary. Returns "unknown" when absent.
 */
export function getClientIp(headers: {
  get(name: string): string | null;
}): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
