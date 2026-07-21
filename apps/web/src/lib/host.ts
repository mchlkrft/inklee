import { isReservedSlug, isValidSlugFormat } from "./slug";

/** Hosts that serve the marketing site + the authenticated app shell. */
const APP_HOSTS = new Set(["inklee.app", "www.inklee.app"]);

/** Apex hosts of the public-bio short domain. These currently redirect
 *  to inklee.app via vercel.json rules — middleware never sees them as
 *  artist subdomains. */
const SHORTLINK_APEX_HOSTS = new Set(["inkl.ee", "www.inkl.ee"]);

/** Suffix that, when present on a host, marks it as a candidate artist
 *  subdomain on the public-bio domain. */
const SHORTLINK_DOMAIN_SUFFIX = ".inkl.ee";

/** Suffix marking the Link Hub sub-subdomain (`l` = "Linklee"):
 *  `<slug>.l.inkl.ee`. Must be checked BEFORE SHORTLINK_DOMAIN_SUFFIX since it
 *  also ends in `.inkl.ee`. Requires a separate `*.l.inkl.ee` wildcard cert. */
const HUB_DOMAIN_SUFFIX = ".l.inkl.ee";

/** Local-dev hosts that resolve to the dev server with no subdomain. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Subdomain-aware local-dev suffix. `name.localhost` resolves to
 *  127.0.0.1 in every modern browser without /etc/hosts edits, so we
 *  treat *.localhost the same way as *.inkl.ee in production. */
const LOCAL_SUFFIX = ".localhost";

/** Dev counterpart of HUB_DOMAIN_SUFFIX: `<slug>.l.localhost` resolves to
 *  127.0.0.1 in modern browsers, so the Link Hub subdomain is testable locally
 *  exactly like the booking subdomain. Checked before LOCAL_SUFFIX. */
const HUB_LOCAL_SUFFIX = ".l.localhost";

/** Vercel preview deployments. We do NOT do subdomain artist routing
 *  on previews — the preview host itself looks like *.vercel.app, and
 *  we'd never reach a name.vercel.app form anyway. */
const PREVIEW_SUFFIX = ".vercel.app";

/** A normalized routing decision derived purely from the request host.
 *
 *  Slug-format and reserved-list checks happen at this boundary so the
 *  middleware can branch on a discriminated union without re-running
 *  validation. Whether a (format-valid, non-reserved) slug actually
 *  corresponds to a real profile row is a downstream concern. */
export type HostRouting =
  /** inklee.app or www.inklee.app — the marketing + app surface. */
  | { kind: "marketing"; host: string }
  /** inkl.ee or www.inkl.ee — short-domain apex. */
  | { kind: "shortlink-apex"; host: string }
  /** name.inkl.ee where `name` is a format-valid, non-reserved slug.
   *  Slug existence is not verified here — caller must DB-check before
   *  rendering. */
  | { kind: "artist-subdomain"; host: string; slug: string }
  /** name.l.inkl.ee — the artist's Link Hub. Same slug rules + downstream
   *  DB-check as artist-subdomain; rewrites to /<slug>/hub. */
  | { kind: "hub-subdomain"; host: string; slug: string }
  /** name.inkl.ee where `name` is a reserved infrastructure label
   *  (app, admin, api, ...). Caller decides whether to redirect to
   *  inklee.app, return 404, or serve a service-specific endpoint. */
  | { kind: "shortlink-reserved-subdomain"; host: string; name: string }
  /** name.inkl.ee where `name` does not pass slug format rules (too
   *  short, contains invalid characters, nested subdomain). */
  | { kind: "shortlink-invalid-subdomain"; host: string; attempted: string }
  /** localhost / 127.0.0.1 / *.localhost. `slug` is populated only when
   *  the host is name.localhost AND name is format-valid + non-reserved.
   *  This is the local-dev counterpart to artist-subdomain. */
  | { kind: "local"; host: string; slug: string | null }
  /** *.vercel.app preview deployment. */
  | { kind: "preview"; host: string }
  /** Anything we don't recognize — unrelated domain, malformed host,
   *  empty input. */
  | { kind: "unknown"; host: string };

/** Lowercase the host and strip any `:port` suffix. Returns "" for
 *  null/undefined/empty input. Pure — no DNS or URL parsing. */
function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.toLowerCase().split(":")[0] ?? "";
}

/** Parse a raw Host header into a routing decision.
 *
 *  Order matters: APP_HOSTS and SHORTLINK_APEX_HOSTS are matched before
 *  the .inkl.ee subdomain branch — otherwise www.inkl.ee would be
 *  parsed as a "reserved subdomain" instead of the canonical apex
 *  redirect target. Same idea for LOCAL_HOSTS before *.localhost. */
export function parseHost(rawHost: string | null | undefined): HostRouting {
  const host = normalizeHost(rawHost);
  if (!host) return { kind: "unknown", host: "" };

  if (APP_HOSTS.has(host)) return { kind: "marketing", host };
  if (SHORTLINK_APEX_HOSTS.has(host)) return { kind: "shortlink-apex", host };

  // Link Hub sub-subdomain (<slug>.l.inkl.ee) — must be tested before the
  // single-label .inkl.ee branch, which would otherwise read it as a nested
  // (invalid) subdomain.
  if (host.endsWith(HUB_DOMAIN_SUFFIX)) {
    const sub = host.slice(0, -HUB_DOMAIN_SUFFIX.length);
    if (
      sub &&
      !sub.includes(".") &&
      !isReservedSlug(sub) &&
      isValidSlugFormat(sub)
    ) {
      return { kind: "hub-subdomain", host, slug: sub };
    }
    // Empty / nested / reserved / bad-format → bounce to marketing like any
    // other unusable inkl.ee host.
    return { kind: "shortlink-invalid-subdomain", host, attempted: sub };
  }

  if (host.endsWith(SHORTLINK_DOMAIN_SUFFIX)) {
    const sub = host.slice(0, -SHORTLINK_DOMAIN_SUFFIX.length);
    if (!sub || sub.includes(".")) {
      // Empty or nested (a.b.inkl.ee) — not a supported artist subdomain.
      return { kind: "shortlink-invalid-subdomain", host, attempted: sub };
    }
    if (isReservedSlug(sub)) {
      return { kind: "shortlink-reserved-subdomain", host, name: sub };
    }
    if (isValidSlugFormat(sub)) {
      return { kind: "artist-subdomain", host, slug: sub };
    }
    return { kind: "shortlink-invalid-subdomain", host, attempted: sub };
  }

  if (LOCAL_HOSTS.has(host)) return { kind: "local", host, slug: null };

  // Link Hub dev subdomain (<slug>.l.localhost) — before the .localhost branch.
  if (host.endsWith(HUB_LOCAL_SUFFIX)) {
    const sub = host.slice(0, -HUB_LOCAL_SUFFIX.length);
    if (
      sub &&
      !sub.includes(".") &&
      isValidSlugFormat(sub) &&
      !isReservedSlug(sub)
    ) {
      return { kind: "hub-subdomain", host, slug: sub };
    }
    return { kind: "local", host, slug: null };
  }

  if (host.endsWith(LOCAL_SUFFIX)) {
    const sub = host.slice(0, -LOCAL_SUFFIX.length);
    if (
      sub &&
      !sub.includes(".") &&
      isValidSlugFormat(sub) &&
      !isReservedSlug(sub)
    ) {
      return { kind: "local", host, slug: sub };
    }
    return { kind: "local", host, slug: null };
  }

  if (host.endsWith(PREVIEW_SUFFIX)) return { kind: "preview", host };

  return { kind: "unknown", host };
}

/** Where this request should ultimately be served, given its parsed host
 *  and request URL. The middleware translates this into a NextResponse;
 *  keeping the decision pure lets us unit-test it without standing up a
 *  Next.js test runtime. */
export type HostRoutingDecision =
  /** No host-level intervention. The middleware proceeds with its
   *  normal auth-gate logic for marketing/local/preview/unknown hosts. */
  | { action: "pass" }
  /** Rewrite the request URL to /<slug><pathname>. The browser URL bar
   *  stays on name.inkl.ee — only the internal route resolution sees
   *  the slug. Search string is preserved verbatim. */
  | { action: "rewrite-artist"; slug: string; pathname: string; search: string }
  /** Permanent redirect to a different host (e.g. www.inkl.ee →
   *  inklee.app). Preserves the requested path + search. */
  | { action: "redirect"; url: string; permanent: boolean };

/** Marketing host we redirect short-domain traffic back to. Lives in the
 *  module instead of an env var because it's a hard-coded brand decision
 *  (changing the apex would be a coordinated rebrand, not a config flip).
 *  The companion publicArtistUrl helper introduced in Slice 71c reads
 *  env vars for the bio domain — that one IS variable. */
const APP_REDIRECT_TARGET = "https://inklee.app";

/** Path namespaces that exist ONLY on the canonical app host:
 *
 *  - /request — the customer portal (/request/[token], /request/submitted),
 *    linked from magic-link emails and the post-submit redirect on the
 *    booking and flash forms.
 *  - the (legal) route group — linked from every public footer, the booking
 *    and flash consent blocks, and the cookie banner.
 *
 *  Well-behaved emitters use apexHref (server components) or a plain <a>
 *  (client leaves like the cookie banner); this list is the safety net
 *  behind them: a stray relative emission on an artist or hub subdomain
 *  would otherwise be rewritten to /<slug>/... and 404. Keep in sync with
 *  the apexHref call sites and the app/(legal) directory. */
const APEX_ONLY_PREFIXES = [
  "/request",
  "/terms",
  "/privacy",
  "/imprint",
  "/acceptable-use",
  "/cookies",
  "/dpa",
  "/subprocessors",
];

/** True when the pathname is inside an apex-only namespace. Segment-exact:
 *  "/request" and "/request/x" match, "/requests" does not. */
function isApexOnlyPath(pathname: string): boolean {
  return APEX_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Decide what to do with a parsed host given the request URL. Pure —
 *  no side effects, no DB calls. The caller passes a URL (request.nextUrl
 *  in middleware) and the function reads only pathname + search. */
export function decideHostRouting(
  routing: HostRouting,
  url: { pathname: string; search: string },
): HostRoutingDecision {
  // API routes are host-agnostic app endpoints and must NEVER be prefixed with
  // a slug (a subdomain rewrite of /api/wa/collect -> /<slug>/api/wa/collect
  // 404s the analytics beacon and any other same-origin API call).
  const isApiPath = url.pathname === "/api" || url.pathname.startsWith("/api/");

  // robots.txt is host-scoped by definition: crawlers request it on every
  // host they visit, and in subdomain mode the artist subdomain is the
  // canonical booking URL. Rewriting it to /<slug>/robots.txt would serve
  // an HTML 404, so it passes through to the root app/robots.ts instead.
  // (sitemap.xml intentionally keeps 404ing on subdomains — it lists apex
  // URLs and is only advertised at https://inklee.app/sitemap.xml.)
  const isRobotsPath = url.pathname === "/robots.txt";

  switch (routing.kind) {
    case "marketing":
    case "preview":
    case "unknown":
      return { action: "pass" };

    case "local":
      if (routing.slug && !isApiPath && !isRobotsPath) {
        // Dev counterpart of the subdomain apex-only safety net below:
        // this decision is pure and cannot know the dev origin/port to
        // build a redirect, so serve the apex route on the same origin
        // instead of rewriting it into a guaranteed 404. Prod redirects
        // to the canonical host; both land the visitor on the real page.
        if (isApexOnlyPath(url.pathname)) {
          return { action: "pass" };
        }
        return {
          action: "rewrite-artist",
          slug: routing.slug,
          pathname: prependSlugToPath(routing.slug, url.pathname),
          search: url.search,
        };
      }
      return { action: "pass" };

    case "artist-subdomain":
      if (isApiPath || isRobotsPath) return { action: "pass" };
      // Apex-only namespaces bounce to the canonical host instead of being
      // slug-prefixed into a guaranteed 404. Non-permanent on purpose: if
      // these routes are ever served on subdomains, a cached 308 would
      // fight the change. (The `local` case above serves these via "pass"
      // instead — a pure decision cannot know the dev origin/port needed
      // to build the redirect URL.)
      if (isApexOnlyPath(url.pathname)) {
        return {
          action: "redirect",
          url: `${APP_REDIRECT_TARGET}${url.pathname}${url.search}`,
          permanent: false,
        };
      }
      return {
        action: "rewrite-artist",
        slug: routing.slug,
        pathname: prependSlugToPath(routing.slug, url.pathname),
        search: url.search,
      };

    case "hub-subdomain":
      if (isApiPath || isRobotsPath) return { action: "pass" };
      // Same apex-only safety net as artist-subdomain: <slug>.l.inkl.ee
      // rewrites everything under /<slug>/hub/..., so /request/* and the
      // legal routes could never resolve here either.
      if (isApexOnlyPath(url.pathname)) {
        return {
          action: "redirect",
          url: `${APP_REDIRECT_TARGET}${url.pathname}${url.search}`,
          permanent: false,
        };
      }
      return {
        action: "rewrite-artist",
        slug: routing.slug,
        pathname: prependHubPath(routing.slug, url.pathname),
        search: url.search,
      };

    case "shortlink-apex":
    case "shortlink-reserved-subdomain":
    case "shortlink-invalid-subdomain":
      // Anything on the inkl.ee zone that is not an artist subdomain
      // bounces to the marketing app. Path + search preserved so
      // app.inkl.ee/pricing → inklee.app/pricing works. The Vercel
      // edge rule in vercel.json also covers inkl.ee apex traffic —
      // this branch is the safety net for hosts that route past the
      // edge rule (preview deployments, local hosts-file overrides).
      return {
        action: "redirect",
        url: `${APP_REDIRECT_TARGET}${url.pathname}${url.search}`,
        permanent: true,
      };
  }
}

/** Prepend "/<slug>" to a request pathname, normalizing the bare root.
 *  Always returns a path starting with "/". Exported for tests. */
export function prependSlugToPath(slug: string, pathname: string): string {
  if (pathname === "" || pathname === "/") return `/${slug}`;
  return `/${slug}${pathname}`;
}

/** Prepend "/<slug>/hub" to a request pathname — the Link Hub lives under the
 *  artist's hub route, so `<slug>.l.inkl.ee/` resolves to `/<slug>/hub`.
 *  Exported for tests. */
export function prependHubPath(slug: string, pathname: string): string {
  if (pathname === "" || pathname === "/") return `/${slug}/hub`;
  return `/${slug}/hub${pathname}`;
}

/** Whether an Origin header is an acceptable source for a public
 *  booking/flash/waitlist submission. Accepts the canonical app URL, the
 *  marketing hosts, and any artist subdomain on the public-bio domain (plus
 *  their local-dev equivalents) — the booking form is served on all of them, so
 *  a strict `origin === NEXT_PUBLIC_APP_URL` check would reject every submission
 *  once `*.inkl.ee` subdomain mode is live. An absent Origin is treated as
 *  acceptable (some privacy modes strip it; matches prior behaviour); a
 *  malformed Origin is rejected. */
export function isAllowedBookingOrigin(
  origin: string | null | undefined,
  appUrl: string | null | undefined,
): boolean {
  if (!origin) return true;
  if (appUrl && origin === appUrl) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const routing = parseHost(host);
  return (
    routing.kind === "marketing" ||
    routing.kind === "artist-subdomain" ||
    (routing.kind === "local" && routing.slug !== null)
  );
}
