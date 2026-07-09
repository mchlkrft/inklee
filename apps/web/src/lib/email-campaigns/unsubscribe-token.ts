// Per-artist unsubscribe tokens. Only the sha256 of the token is persisted in
// email_unsubscribe_tokens (the pervasive Inklee magic-link idiom — waitlist.ts,
// bookings.ts, reminders); the raw token only ever lives in an email's List-Unsubscribe
// URL. The token must be STABLE per artist so every email an artist has ever received
// carries a link that keeps working — a hard requirement for CAN-SPAM / RFC 8058 one-click
// unsubscribe (an old email's link must not rot when a newer campaign is sent).
//
// DEVIATION (documented): storing only the hash makes a random token non-reusable — given
// only sha256(token) you cannot reproduce token, so a random token would rotate on every
// send and break older links. To keep the URL stable AND store only the hash, the token is
// DERIVED deterministically as HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, "unsubscribe:<artistId>").
// This is server-only, unguessable without the service-role key, stable forever, and needs
// no new secret. The stored hash is the reverse index (raw URL token -> artist). This
// replaces the design's randomBytes generation, which cannot satisfy stable + hash-only.
import "server-only";
import crypto from "crypto";
import { serviceClient } from "@/lib/supabase/service";

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function deriveRawToken(artistId: string): string {
  // Server-only derivation key. The service-role key is always present at runtime and
  // never leaves the server; using it as the HMAC key yields a stable, unguessable token.
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return crypto
    .createHmac("sha256", secret)
    .update(`unsubscribe:${artistId}`)
    .digest("hex");
}

/**
 * Return the RAW unsubscribe token for an artist (stable across calls), ensuring the
 * sha256 reverse-index row exists. Idempotent: the token is deterministic, so the upsert
 * (keyed on token_hash) is a no-op after the first call. Scope defaults to 'all'.
 */
export async function getOrCreateUnsubToken(artistId: string): Promise<string> {
  const rawToken = deriveRawToken(artistId);
  const tokenHash = hashToken(rawToken);
  const { error } = await serviceClient
    .from("email_unsubscribe_tokens")
    .upsert(
      { token_hash: tokenHash, artist_id: artistId, scope: "all" },
      { onConflict: "token_hash", ignoreDuplicates: true },
    );
  if (error) throw error;
  return rawToken;
}

/**
 * Resolve a raw token (from an unsubscribe URL) back to its artist + scope via the stored
 * sha256. Returns null if the token does not match a row.
 */
export async function lookupUnsubToken(
  rawToken: string,
): Promise<{ artistId: string; scope: string } | null> {
  const tokenHash = hashToken(rawToken);
  const { data, error } = await serviceClient
    .from("email_unsubscribe_tokens")
    .select("artist_id, scope")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data) return null;
  return { artistId: data.artist_id, scope: data.scope };
}
