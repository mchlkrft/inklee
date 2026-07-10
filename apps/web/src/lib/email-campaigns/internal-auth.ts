// Timing-safe Bearer check for the internal Control Tower read endpoints and the lifecycle
// cron. A plain !== on the Authorization header leaks a byte-position timing signal; hashing
// both sides first makes the comparison constant-time regardless of input length, with no
// early-exit and no length oracle. Fail-closed: a missing secret or header never matches.
// (The dispatch WRITE path uses the stronger signed-body HMAC in webhook-signature.ts.)
import { createHash, timingSafeEqual } from "crypto";

export function bearerMatches(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authorization) return false;
  const a = createHash("sha256").update(authorization).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}
