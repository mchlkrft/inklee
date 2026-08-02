import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { refreshLongLivedToken } from "@/lib/instagram";

export const runtime = "nodejs";

// Meta's Graph API error code for "invalid OAuth access token" — the token
// was revoked, expired past its refresh window, or signed with a rotated app
// secret. This is the ONLY signal treated as evidence the token itself is
// dead. CRON-IGX-001 / same shape as PAY-CONN-001 (cached Connect state
// lying on a broad error class): the previous catch-all marked an account
// disconnected on ANY thrown error, including a 429 or a Meta 5xx outage,
// which would disconnect every account due for refresh during a single
// upstream incident with no way back short of the artist re-running OAuth.
// Meta's rate-limit / throttling errors also use type=OAuthException (codes
// 4, 17, 32, 613), so checking `type` alone would repeat the same mistake —
// only this specific `code` distinguishes a dead token from an outage.
const META_INVALID_TOKEN_CODE = 190;

/**
 * `refreshLongLivedToken` throws `Token refresh failed: ${bodyText}` for any
 * non-2xx HTTP response, and a bare fetch() rejects with an unrelated message
 * for a network/DNS/TLS failure that never reached Meta at all. Only the
 * first case can carry evidence about the token; the prefix check separates
 * "we got an HTTP response and can inspect it" from "we got nothing".
 */
function isMetaTokenInvalid(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const prefix = "Token refresh failed: ";
  if (!err.message.startsWith(prefix)) return false;

  const body = err.message.slice(prefix.length);
  try {
    const parsed = JSON.parse(body) as { error?: { code?: number } };
    return parsed.error?.code === META_INVALID_TOKEN_CODE;
  } catch {
    return false; // unparseable body is not evidence of anything
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Refresh tokens expiring within the next 7 days
  const threshold = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: accounts, error: fetchError } = await serviceClient
    .from("instagram_accounts")
    .select("artist_id, access_token")
    .eq("connected", true)
    .lt("token_expires_at", threshold);

  if (fetchError) {
    Sentry.captureException(fetchError, {
      tags: { route: "cron/instagram-refresh", step: "fetch" },
    });
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ refreshed: 0, failed: 0 });
  }

  let refreshed = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
      const newToken = await refreshLongLivedToken(account.access_token);
      const now = new Date().toISOString();
      const expiresAt = new Date(
        Date.now() + newToken.expires_in * 1000,
      ).toISOString();

      await serviceClient
        .from("instagram_accounts")
        .update({
          access_token: newToken.access_token,
          token_expires_at: expiresAt,
          updated_at: now,
        })
        .eq("artist_id", account.artist_id);

      refreshed++;
    } catch (err) {
      console.error(
        `[instagram-refresh] failed for artist ${account.artist_id}:`,
        err,
      );
      Sentry.captureException(err, {
        tags: { route: "cron/instagram-refresh" },
        extra: { artistId: account.artist_id },
      });

      // Only mark disconnected when the error actually evidences an invalid
      // token (Meta code 190). Everything else — a 429, a 5xx, a network
      // fault — is captured above and the account stays connected so the
      // next tick can retry; recovery is otherwise impossible because the
      // select above filters on connected=true.
      if (isMetaTokenInvalid(err)) {
        await serviceClient
          .from("instagram_accounts")
          .update({ connected: false, updated_at: new Date().toISOString() })
          .eq("artist_id", account.artist_id);
      }

      failed++;
    }
  }

  return NextResponse.json({ refreshed, failed });
}
