import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import {
  verifyOAuthState,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchInstagramUser,
  fetchInstagramMedia,
} from "@/lib/instagram";
import { downloadInstagramThumbnail } from "@/lib/instagram-storage";

// Thumbnail download adds ~5–15s to a 50-post sync; default 10s timeout would clip it.
export const maxDuration = 60;

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
      const previewPaths = await Promise.all(
        media.map((m) => {
          const sourceUrl =
            m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url;
          return sourceUrl
            ? downloadInstagramThumbnail(sourceUrl, artistId, m.id)
            : Promise.resolve(null);
        }),
      );

      await serviceClient.from("instagram_posts").upsert(
        media.map((m, i) => ({
          artist_id: artistId,
          instagram_media_id: m.id,
          media_type: m.media_type,
          media_url: m.media_url ?? null,
          thumbnail_url: m.thumbnail_url ?? null,
          preview_image_path: previewPaths[i],
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
