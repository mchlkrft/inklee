/**
 * Reserved slug names — cannot be used as artist slugs.
 *
 * Three categories merged into one Set:
 *   1. Infrastructure / hostnames (www, app, api, mail, cdn, status, ...)
 *      Anything that might be expected to be a service endpoint, or that
 *      conflicts with a Vercel / Cloudflare reserved subdomain.
 *   2. Auth + product routes (login, dashboard, settings, onboarding, ...)
 *      Would shadow real app paths on inklee.app/{slug}.
 *   3. Top-level marketing routes (about, download, dm-chaos, the SEO
 *      pages, ...). The App Router resolves specific routes before the
 *      catch-all /[slug] route, so an artist who picked "dm-chaos" would
 *      be invisible behind the SEO page. Reserving them prevents that
 *      shadow at slug-creation time.
 *
 * When adding a new top-level route in src/app/, add the segment name
 * here BEFORE shipping.
 */
export const RESERVED_SLUGS = new Set([
  // Infrastructure / hostnames (subdomain reservations on *.inkl.ee)
  "www",
  "app",
  "api",
  "admin",
  "auth",
  "mail",
  "email",
  "static",
  "assets",
  "cdn",
  "status",
  "docs",
  "blog",
  "stripe",
  "webhook",
  "dev",
  "staging",
  "test",
  "beta",
  "inklee",

  // Auth + product routes (path reservations on inklee.app)
  "login",
  "logout",
  "signup",
  "signin",
  "onboarding",
  "dashboard",
  "settings",
  "account",
  "billing",
  "pricing",
  "support",
  "help",
  "contact",
  "create",
  "new",
  "studio",
  "studios",
  "flash",
  "booking",
  "bookings",
  "request",
  "requests",
  "calendar",
  "clients",
  "waitlist",
  "analytics",
  "travel",

  // Legal
  "legal",
  "terms",
  "privacy",
  "imprint",
  "impressum",

  // Top-level marketing routes
  "about",
  "download",
  "start",
  "dm-chaos",
  "tattoo-booking-software",
  "tattoo-booking-form",
  "tattoo-deposit-tool",
  "tattoo-artist-waitlist",
  "instagram-booking-link-for-tattoo-artists",
  "guest-spot-booking",
  "guest-spots",
  "best-booking-app-for-tattoo-artists",
  "tattoo-booking-software-vs-calendly",
  "tattoo-booking-software-vs-google-forms",
  "tattoo-booking-software-vs-instagram-dms",
  "resources",

  // Framework sentinel / public root files
  "404",
  "500",
  "favicon",
  "robots",
  "sitemap",
  "public",
  "null",
  "undefined",
]);

/** Slug format: lowercase letters and digits, must start with a letter,
 *  optional single dashes between alphanumeric runs (no double dashes,
 *  no leading/trailing dash). */
export const SLUG_FORMAT_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;

/** True if `s` passes format rules (length + character set + dash placement).
 *  Does NOT check the reserved list — use isReservedSlug for that. */
export function isValidSlugFormat(s: string): boolean {
  if (s.length < SLUG_MIN_LENGTH || s.length > SLUG_MAX_LENGTH) return false;
  return SLUG_FORMAT_REGEX.test(s);
}

/** True if `s` is in the reserved set. Case-sensitive lowercase lookup —
 *  callers should normalize before checking. */
export function isReservedSlug(s: string): boolean {
  return RESERVED_SLUGS.has(s);
}

export function validateSlug(s: string): string | null {
  if (s.length < SLUG_MIN_LENGTH) return "Use at least 3 characters.";
  if (s.length > SLUG_MAX_LENGTH) return "Use at most 30 characters.";
  if (!SLUG_FORMAT_REGEX.test(s))
    return "Use lowercase letters, numbers, and single dashes. Start with a letter.";
  if (RESERVED_SLUGS.has(s)) return "That one is reserved. Try another.";
  return null;
}
