import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth-redirect";
import { recordPublicServerEvent } from "@/lib/public-analytics/record-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const next = safeNextPath(rawNext);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Public registration conversion for OAuth signups: the email path
        // records completion in signUpAction, but a Google account only comes
        // into existence here. "New" = created within the last two minutes
        // (returning OAuth logins pass through this callback too).
        const createdMsAgo = Date.now() - new Date(user.created_at).getTime();
        if (createdMsAgo >= 0 && createdMsAgo < 120_000) {
          await recordPublicServerEvent("artist_signup_completed", {
            headers: request.headers,
            pathname: "/signup",
            props: { method: "google" },
          });
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("slug")
          .eq("id", user.id)
          .single();

        // Only bounce profile-less users to onboarding when the caller did
        // not name an explicit destination. The password-reset flow sends
        // next=/reset-password — an account that never finished onboarding
        // must still reach it, or the new password is silently never set.
        if (!profile && !rawNext) {
          return NextResponse.redirect(`${origin}/onboarding/welcome`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth-failed`);
}
