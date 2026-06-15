import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Only same-origin absolute paths are allowed as a post-verify redirect target.
// Blocks an open redirect via a crafted `next` (e.g. "//evil.com" or "/\evil",
// which browsers treat as protocol-relative). Defense-in-depth: callers that
// mint links (e.g. the mobile connect-link endpoint) also allowlist `next`.
function safeNextPath(next: string | null): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return "/dashboard";
  }
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=invalid-link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    console.error("[auth/confirm] verifyOtp failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=link-expired`);
  }

  // Post-signup: check if profile exists
  if (type === "signup") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("slug")
        .eq("id", user.id)
        .single();
      if (!profile) {
        // New artist — start at the intro slides, not mid-wizard.
        return NextResponse.redirect(`${origin}/onboarding/welcome`);
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
