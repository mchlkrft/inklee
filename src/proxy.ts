import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ARTIST_PATHS = [
  "/dashboard",
  "/bookings",
  "/flash",
  "/travel",
  "/settings",
  "/onboarding",
  "/analytics",
];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { pathname } = request.nextUrl;
  const isArtistPath = ARTIST_PATHS.some((p) => pathname.startsWith(p));

  if (isArtistPath) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // If user has enrolled TOTP but is only at AAL1, require MFA challenge
    if (!pathname.startsWith("/auth/mfa")) {
      try {
        const { data: aal } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.nextLevel === "aal2" && aal?.currentLevel === "aal1") {
          return NextResponse.redirect(new URL("/auth/mfa", request.url));
        }
      } catch {
        // MFA check failed — continue without gating
      }
    }

    // Check profile exists for non-onboarding artist paths
    if (!pathname.startsWith("/onboarding")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("slug")
        .eq("id", user.id)
        .single();

      if (!profile) {
        return NextResponse.redirect(
          new URL("/onboarding/claim-slug", request.url),
        );
      }
    }
  } else {
    // Still refresh session on all other routes
    await supabase.auth.getUser();
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
