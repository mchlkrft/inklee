import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import {
  verifyOAuthState,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchInstagramUser,
  fetchInstagramMedia,
} from "@/lib/instagram";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const baseRedirect = `${appUrl}/flash/instagram`;

  if (oauthError || !code || !state) {
    return NextResponse.redirect(`${baseRedirect}?error=denied`);
  }

  const artistId = verifyOAuthState(state);
  if (!artistId) {
    return NextResponse.redirect(`${baseRedirect}?error=state`);
  }

  try {
    const shortToken = await exchangeCodeForToken(code);
    const longToken = await exchangeForLongLivedToken(shortToken.access_token);
    const igUser = await fetchInstagramUser(longToken.access_token);

    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + longToken.expires_in * 1000,
    ).toISOString();

    await serviceClient.from("instagram_accounts").upsert(
      {
        artist_id: artistId,
        instagram_user_id: igUser.id,
        username: igUser.username,
        access_token: longToken.access_token,
        token_expires_at: expiresAt,
        connected: true,
        last_sync_at: now,
        updated_at: now,
      },
      { onConflict: "artist_id" },
    );

    const media = await fetchInstagramMedia(longToken.access_token, 50);
    if (media.length > 0) {
      await serviceClient.from("instagram_posts").upsert(
        media.map((m) => ({
          artist_id: artistId,
          instagram_media_id: m.id,
          media_type: m.media_type,
          media_url: m.media_url ?? null,
          thumbnail_url: m.thumbnail_url ?? null,
          permalink: m.permalink,
          caption: m.caption ?? null,
          posted_at: m.timestamp ? new Date(m.timestamp).toISOString() : null,
          synced_at: now,
        })),
        { onConflict: "artist_id,instagram_media_id" },
      );
    }

    return NextResponse.redirect(`${baseRedirect}?connected=1`);
  } catch (err) {
    console.error("[instagram/callback]", err);
    return NextResponse.redirect(`${baseRedirect}?error=exchange`);
  }
}
