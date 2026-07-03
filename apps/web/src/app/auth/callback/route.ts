import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth-redirect";

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
