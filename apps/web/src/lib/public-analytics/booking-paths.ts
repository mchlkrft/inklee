/**
 * Booking-page detection for the public analytics collector. Pure and
 * client-safe.
 *
 * An artist booking page is:
 * - the root (or any path) of an artist subdomain like mikey.inkl.ee
 *   (excluding the apex inkl.ee redirect host and the *.l.inkl.ee hub), where
 *   the subdomain label is a valid, non-reserved slug, or
 * - a single-segment path on the main hosts whose segment is a valid,
 *   non-reserved slug (the [slug] catch-all).
 *
 * Reserved slugs are the single source of truth: every shippable top-level
 * route is reserved before it ships, so a reserved name can never be an artist
 * slug (and marketing SEO pages are reserved). This makes the check exact
 * rather than a heuristic, and it also keeps unknown-slug 404s out.
 */

import { isReservedSlug, isValidSlugFormat } from "@inklee/shared/slug";

function isArtistSlug(candidate: string): boolean {
  const slug = candidate.toLowerCase();
  return isValidSlugFormat(slug) && !isReservedSlug(slug);
}

export function isBookingPagePath(pathname: string, hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host.endsWith(".l.inkl.ee")) return false; // link hub pages
  if (host !== "inkl.ee" && host.endsWith(".inkl.ee")) {
    // Artist subdomain: the label must be a real slug (dead/typo subdomains
    // resolve here too but are not booking pages).
    return isArtistSlug(host.split(".")[0]);
  }
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  return isArtistSlug(segments[0]);
}
