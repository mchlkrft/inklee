import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import {
  verifyOAuthState,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchInstagramUser,
} from "@/lib/instagram";
import { syncInstagramMedia } from "@/lib/server/instagram-sync";
import { createClient } from "@/lib/supabase/server";

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

  // AUTH-01: the state is a stateless HMAC (replayable within its 15-min
  // window), so additionally bind the callback to the signed-in artist. The
  // browser completing the OAuth round trip must BE that artist, so a leaked
  // state can't attach an Instagram account to someone else.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== artistId) {
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

    // Cache the artist's recent media (shared with resync + the mobile route).
    // The account is already saved connected, so a sync hiccup must NOT surface
    // as a failed connect: swallow it and let the artist resync from the page.
    try {
      await syncInstagramMedia(artistId);
    } catch (syncErr) {
      console.error("[instagram/callback] post-connect sync failed", syncErr);
    }

    return NextResponse.redirect(`${baseRedirect}?connected=1`);
  } catch (err) {
    console.error("[instagram/callback]", err);
    return NextResponse.redirect(`${baseRedirect}?error=exchange`);
  }
}
