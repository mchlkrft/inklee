import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateOAuthState, buildOAuthUrl } from "@/lib/instagram";

export const runtime = "nodejs";

// GET /instagram/start — auto-start the Instagram OAuth for the signed-in
// artist. The mobile connect handoff (magic link -> /auth/confirm -> here)
// establishes a cookie session first, so this redirect goes straight into the
// Instagram authorize screen and the existing (unchanged) callback binds the
// connection to the correct artist via its cookie AUTH-01 check. This is
// connectInstagramAction expressed as a route handler so a GET redirect chain
// can reach it; the web "Connect Instagram" button still uses the action.
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }
  return NextResponse.redirect(buildOAuthUrl(generateOAuthState(user.id)));
}
