// Standard-Webhooks HMAC verifier for the Control Tower campaign dispatch (write) path.
// Lifted almost verbatim from the production-proven verifyHookSignature in
// api/auth/email-hook/route.ts so there is one audited implementation of this scheme.
// The dispatch endpoint triggers real sends, so it upgrades from the read-only segments
// Bearer to signed-body + replay-window verification. No new npm dependency.
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify a Standard-Webhooks signature over the raw request body.
 * - `secret` is "v1,whsec_<base64>" or "whsec_<base64>"; the key is the base64 decode of the
 *   part after the leading whsec_ (a leading "v1," is tolerated and stripped).
 * - signed content is `${webhook-id}.${webhook-timestamp}.${rawBody}`, HMAC-SHA256, base64.
 * - the webhook-timestamp must be within a 5-minute window (replay hardening).
 * - webhook-signature may carry multiple space-separated "v1,<sig>" signatures; any match wins.
 * Returns false (never throws) on any malformed input — the caller fails closed.
 */
export function verifyDispatchSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  const keyBase64 = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const key = Buffer.from(keyBase64, "base64");

  const msgId = headers.get("webhook-id") ?? "";
  const msgTimestamp = headers.get("webhook-timestamp") ?? "";
  const msgSignature = headers.get("webhook-signature") ?? "";

  // Reject stale/future timestamps. Standard Webhooks sends Unix seconds; a 5-min window
  // tolerates clock skew while bounding replay of a captured dispatch.
  const ts = parseInt(msgTimestamp, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) {
    return false;
  }

  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;
  const computed = createHmac("sha256", key)
    .update(signedContent)
    .digest("base64");

  // webhook-signature may contain multiple sigs: "v1,<sig1> v1,<sig2>"
  return msgSignature.split(" ").some((sig) => {
    const sigValue = sig.replace(/^v1,/, "");
    try {
      return timingSafeEqual(Buffer.from(computed), Buffer.from(sigValue));
    } catch {
      return false;
    }
  });
}
