import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { refreshLongLivedToken } from "@/lib/instagram";

export const runtime = "nodejs";

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
      // Token is dead — mark disconnected so artist sees they need to reconnect
      await serviceClient
        .from("instagram_accounts")
        .update({ connected: false, updated_at: new Date().toISOString() })
        .eq("artist_id", account.artist_id);

      failed++;
    }
  }

  return NextResponse.json({ refreshed, failed });
}
