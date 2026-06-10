import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideHostRouting, parseHost } from "@/lib/host";

const ARTIST_PATHS = [
  "/dashboard",
  "/bookings",
  "/flash",
  "/travel",
  "/settings",
  "/onboarding",
  "/analytics",
  "/goods",
  "/notifications",
  // Defense in depth: /admin also gets the login + AAL2 step-up redirects at the
  // edge. Admin-ness (ADMIN_EMAILS) and the authoritative AAL2 fail-closed check
  // live in lib/admin-guard.ts, which also covers directly-invoked admin actions.
  "/admin",
];

/** Header forwarded to downstream pages so a server component can tell
 *  whether the request arrived via an artist subdomain (name.inkl.ee)
 *  vs the canonical app host. Read via `headers()` in not-found.tsx
 *  and any other component that needs to render differently in the
 *  subdomain context. */
const HOST_ROUTING_HEADER = "x-host-routing";
const ARTIST_SLUG_HEADER = "x-artist-slug";

export async function proxy(request: NextRequest) {
  // Host-based routing runs first. On artist subdomains we rewrite the
  // URL and skip the auth-gate logic entirely — subdomain traffic is
  // strictly public-only, and cookies for the authenticated app live
  // on inklee.app (a different registrable domain) so they don't flow
  // here even if a user tried to attach them.
  const hostRouting = parseHost(request.headers.get("host"));
  const decision = decideHostRouting(hostRouting, request.nextUrl);

  if (decision.action === "redirect") {
    return NextResponse.redirect(decision.url, {
      status: decision.permanent ? 308 : 307,
    });
  }

  if (decision.action === "rewrite-artist") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(HOST_ROUTING_HEADER, "subdomain");
    requestHeaders.set(ARTIST_SLUG_HEADER, decision.slug);

    return NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
  }

  // decision.action === "pass" — fall through to the existing auth-gate
  // flow on the marketing/app host.
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

    // Check profile exists for non-onboarding artist paths. /admin is excluded:
    // admins are gated by ADMIN_EMAILS in admin-guard.ts, not by having an artist
    // profile, so a profile-less admin must not be bounced to onboarding.
    if (!pathname.startsWith("/onboarding") && !pathname.startsWith("/admin")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("slug")
        .eq("id", user.id)
        .single();

      if (!profile) {
        return NextResponse.redirect(
          new URL("/onboarding/welcome", request.url),
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
