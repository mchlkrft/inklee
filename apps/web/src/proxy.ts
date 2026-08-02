import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { decideHostRouting, parseHost } from "@/lib/host";
import { resolveMfaStepUp } from "@/lib/mfa-step-up";

const ARTIST_PATHS = [
  "/dashboard",
  "/bookings",
  "/flash",
  "/travel",
  "/settings",
  "/link-hub",
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

    // If user has enrolled TOTP but is only at AAL1, require MFA challenge.
    // MFA-GATE-001: a failed check must never be treated as "no step-up
    // needed" — see resolveMfaStepUp for the three outcomes and the retry.
    if (!pathname.startsWith("/auth/mfa")) {
      const stepUp = await resolveMfaStepUp(() =>
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      );
      if (stepUp === "step-up-required") {
        return NextResponse.redirect(new URL("/auth/mfa", request.url));
      }
      if (stepUp === "unknown") {
        // Fail CLOSED: route to the same challenge page rather than let an
        // indeterminate assurance level reach a gated path. This cannot loop
        // — /auth/mfa is excluded from this gate above, and its own factor
        // lookup (resolve-totp-status.ts) never redirects back here either.
        Sentry.captureMessage("mfa_step_up_check_failed", {
          level: "error",
          tags: { area: "proxy_mfa_gate" },
          extra: { pathname, userId: user.id },
        });
        return NextResponse.redirect(new URL("/auth/mfa", request.url));
      }
    }

    // Check profile exists for non-onboarding artist paths. /admin is excluded:
    // admins are gated by ADMIN_EMAILS in admin-guard.ts, not by having an artist
    // profile, so a profile-less admin must not be bounced to onboarding.
    if (!pathname.startsWith("/onboarding") && !pathname.startsWith("/admin")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("slug, account_status")
        .eq("id", user.id)
        .single();

      if (!profile) {
        return NextResponse.redirect(
          new URL("/onboarding/welcome", request.url),
        );
      }

      // Suspension / archival gate (BM-2.0 slice 1c), piggybacked on the profile
      // read above (no extra query). Defense in depth for the window where a
      // just-suspended account's cookie session is still valid: the Supabase
      // auth ban is the primary gate; this closes the residual window. Only
      // fires on an existing row that is explicitly not "active" (a null profile
      // already bounced to onboarding above, so a transient read error can't
      // trigger a spurious lockout here). /login is not an artist path and does
      // not bounce authed users, so this redirect cannot loop.
      if (profile.account_status !== "active") {
        return NextResponse.redirect(new URL("/login", request.url));
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
