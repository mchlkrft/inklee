/**
 * Public artist URL helper — single source of truth for the artist's
 * outward-facing booking-page URL.
 *
 * Two output modes, switched purely by env:
 *
 *  1. **Subdomain mode** — `NEXT_PUBLIC_PUBLIC_BIO_DOMAIN` is set to a
 *     bare hostname (e.g. "inkl.ee"). All public URLs are emitted as
 *     `https://<slug>.<bio domain>`, the artist-subdomain shape
 *     introduced in Slice 71. Requires the host parser + middleware
 *     from Slices 71a/71b to be live so requests actually resolve.
 *
 *  2. **Path mode** (fallback) — env var is unset or empty. URLs fall
 *     back to `${NEXT_PUBLIC_APP_URL}/<slug>`, the path-based shape that
 *     shipped before Slice 71. Matches pre-71 behavior exactly when the
 *     env var is unset, so the helper is safe to roll out before DNS is
 *     ready: the bio-domain flag is flipped only after wildcard DNS +
 *     SSL are verified end-to-end (see docs/subdomain-deployment.md
 *     once it lands in Slice 71d).
 *
 * The mode flip is a single env var change — same value in Production
 * and Preview makes the rollback a single env-var unset.
 */

const FALLBACK_APP_URL = "https://inklee.app";

/** Marketing+app origin (inklee.app in prod, http://localhost:3000 in
 *  dev). Used for path-mode URLs and as the no-slug fallback. */
function getAppOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? FALLBACK_APP_URL;
}

/** Bare hostname for the bio short domain when subdomain mode is
 *  enabled, or null when path mode applies. Tolerant of users who set
 *  the env var with a protocol prefix or trailing slash. */
function getBioDomain(): string | null {
  const raw = process.env.NEXT_PUBLIC_PUBLIC_BIO_DOMAIN?.trim();
  if (!raw) return null;
  return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** True when subdomain-style bio URLs are enabled in this environment.
 *  Read by callers that need to know which form is canonical (e.g. the
 *  `<link rel="canonical">` tag on /[slug]/page.tsx). */
export function isBioSubdomainEnabled(): boolean {
  return getBioDomain() !== null;
}

export type PublicArtistUrlOptions = {
  /** Optional sub-path appended verbatim to the artist URL — must start
   *  with "/". Examples: `/waitlist`, `/flash/spider-rose`,
   *  `/flash/days/abc-123`. */
  subpath?: string;
};

/** Build the preferred public URL for an artist slug.
 *
 *  Slug is treated as opaque — no validation is run, because the DB row
 *  is the source of truth: if a profile row exists with this slug, the
 *  URL should resolve. Validation lives at slug-creation time in
 *  `validateSlug` and at host-parsing time in `parseHost`.
 *
 *  An empty or null slug returns the app origin — matches the pre-71
 *  pattern `${appUrl}/${slug ?? ""}` which produced a marketing-home
 *  URL when the slug was missing. Keeping that soft fallback prevents
 *  null-slug surfaces from suddenly emitting `https://./` style URLs. */
export function publicArtistUrl(
  slug: string | null | undefined,
  options: PublicArtistUrlOptions = {},
): string {
  if (!slug) return getAppOrigin();
  const subpath = options.subpath ?? "";
  const bio = getBioDomain();
  if (bio) return `https://${slug}.${bio}${subpath}`;
  return `${getAppOrigin()}/${slug}${subpath}`;
}

/** Host-aware href for an artist-relative link rendered INSIDE a public
 *  artist page (booking, flash, waitlist, hub).
 *
 *  The proxy rewrites `<slug>.inkl.ee/<path>` to the internal `/<slug>/<path>`
 *  route but the browser URL bar stays on the subdomain. A `<Link>` that
 *  hardcodes `/<slug>/<path>` therefore navigates the subdomain to
 *  `<slug>.inkl.ee/<slug>/<path>`, which the proxy rewrites again to
 *  `/<slug>/<slug>/<path>` and 404s. On the subdomain the link must be the
 *  bare subpath; on the apex (`inklee.app/<slug>`) it must keep the slug
 *  prefix. The proxy sets `x-host-routing: subdomain` on every artist
 *  rewrite, so we branch on that.
 *
 *  Server-only (reads `headers()`); await it in the async server component
 *  and pass the resolved string to `<Link href>`. `subpath` must start with
 *  "/" (or be empty for the artist root). */
export async function artistHref(slug: string, subpath = ""): Promise<string> {
  const { headers } = await import("next/headers");
  const isSubdomain = (await headers()).get("x-host-routing") === "subdomain";
  if (isSubdomain) return subpath || "/";
  return `/${slug}${subpath}`;
}

/** The artist's Link Hub URL ("Linklee"). Subdomain mode emits
 *  `https://<slug>.l.<bio domain>` (e.g. ouch370.l.inkl.ee) — reusing the same
 *  NEXT_PUBLIC_PUBLIC_BIO_DOMAIN as the booking subdomain, so it needs only the
 *  extra `*.l.inkl.ee` wildcard cert, no new env. Path mode (env unset) falls
 *  back to `${appUrl}/<slug>/hub`, which always works pre-DNS. */
export function publicHubUrl(slug: string | null | undefined): string {
  if (!slug) return getAppOrigin();
  const bio = getBioDomain();
  if (bio) return `https://${slug}.l.${bio}`;
  return `${getAppOrigin()}/${slug}/hub`;
}
