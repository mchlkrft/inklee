// Per-artist Bio Page / Inklee Hub configuration. Stored in
// `profiles.settings.bio_page` JSONB (no migration needed, same pattern as
// deposit_defaults / dashboard widgets / cover image).
//
// Two surfaces consume this ONE module (the source of truth, per the web<->app
// alignment rule): the web public render + web editor, and — from the Hub work
// (ME-11) — the native app editor via a mobile API route. The booking page is
// untouched; the Inklee Hub is an additive standalone surface at /<slug>/hub.

export type BioModuleKey = "links" | "policy" | "shop";

/** Optional modules rendered below the booking section, in this fixed order. */
export const BIO_MODULE_ORDER: readonly BioModuleKey[] = [
  "links",
  "policy",
  "shop",
];

export type BioCustomLink = {
  id: string;
  label: string;
  url: string;
  isActive: boolean;
};

/** Social platforms shown as the Hub's icon row. Keys map to a lucide icon on
 *  web (lucide-react) and app (lucide-react-native) so the rendering stays in
 *  sync; "website" / "email" are the catch-alls. */
export type BioSocialPlatform =
  | "instagram"
  | "tiktok"
  | "x"
  | "facebook"
  | "youtube"
  | "threads"
  | "pinterest"
  | "website"
  | "email";

export const BIO_SOCIAL_PLATFORMS: readonly BioSocialPlatform[] = [
  "instagram",
  "tiktok",
  "x",
  "facebook",
  "youtube",
  "threads",
  "pinterest",
  "website",
  "email",
];

export type BioSocial = {
  platform: BioSocialPlatform;
  /** Sanitized http(s) URL (or mailto: for email). */
  url: string;
};

/** Display labels for each platform — shared by the web + app editors and used
 *  as the accessible name on the Hub's icon row. Icon GLYPHS are app-specific
 *  (web: simple-icons; app: Ionicons logos), so they live in each app, not here. */
export const BIO_SOCIAL_META: Record<BioSocialPlatform, { label: string }> = {
  instagram: { label: "Instagram" },
  tiktok: { label: "TikTok" },
  x: { label: "X" },
  facebook: { label: "Facebook" },
  youtube: { label: "YouTube" },
  threads: { label: "Threads" },
  pinterest: { label: "Pinterest" },
  website: { label: "Website" },
  email: { label: "Email" },
};

export type BioPageSettings = {
  /** Optional Link Hub heading shown under the artist's name. */
  headline: string | null;
  /** Optional Link Hub description; the Hub falls back to the profile bio when null. */
  text: string | null;
  bookingPolicy: string | null;
  customLinks: BioCustomLink[];
  /** Social icon row for the Hub. At most one entry per platform. */
  socials: BioSocial[];
  /** Modules the artist has explicitly hidden from the public page. */
  hidden: BioModuleKey[];
};

export const DEFAULT_BIO_PAGE: BioPageSettings = {
  headline: null,
  text: null,
  bookingPolicy: null,
  customLinks: [],
  socials: [],
  hidden: [],
};

export const MAX_HEADLINE = 80;
export const MAX_TEXT = 500;
export const MAX_BOOKING_POLICY = 1000;
export const MAX_LINK_LABEL = 60;
export const MAX_LINKS = 12;
export const MAX_SOCIALS = BIO_SOCIAL_PLATFORMS.length;

const MODULE_KEYS = new Set<BioModuleKey>(BIO_MODULE_ORDER);
const SOCIAL_KEYS = new Set<BioSocialPlatform>(BIO_SOCIAL_PLATFORMS);

/** A simple "looks like an email" check (one @, a dotted domain). Used for both
 *  mailto: addresses and bare email input that should become a mailto link. */
const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isBioModuleKey(v: unknown): v is BioModuleKey {
  return typeof v === "string" && MODULE_KEYS.has(v as BioModuleKey);
}

function isBioSocialPlatform(v: unknown): v is BioSocialPlatform {
  return typeof v === "string" && SOCIAL_KEYS.has(v as BioSocialPlatform);
}

/**
 * Allow only http(s) and mailto URLs. Reject javascript:, data:, and every
 * other scheme. Bare domains get https:// prepended. Returns a normalised URL
 * string, or null if unsafe or unparseable.
 */
export function sanitizeBioLinkUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;

  // mailto: accept a simple address form only.
  if (v.toLowerCase().startsWith("mailto:")) {
    const addr = v.slice("mailto:".length).trim();
    return SIMPLE_EMAIL_RE.test(addr) ? `mailto:${addr}` : null;
  }

  // A bare email address (no scheme) is a mailto, not a website: without this it
  // gets https:// prepended and becomes https://user@host (a broken link). Backs
  // the Hub editor's "you@email.com" affordance on email links + the email social.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(v);
  if (!hasScheme && SIMPLE_EMAIL_RE.test(v)) return `mailto:${v}`;

  // Prepend https:// only when there is no scheme at all. A value that already
  // carries a scheme (including javascript:/data:) is left for URL() to judge,
  // so we never accidentally turn `javascript:alert(1)` into a valid URL.
  const candidate = hasScheme ? v : `https://${v}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

function parseOneLink(raw: unknown, index: number): BioCustomLink | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const url = sanitizeBioLinkUrl(o.url);
  if (!url) return null; // unsafe / invalid URL → drop the whole link
  const label =
    typeof o.label === "string" && o.label.trim()
      ? o.label.trim().slice(0, MAX_LINK_LABEL)
      : url;
  // Deterministic fallback id so re-parsing legacy rows is stable (the form
  // assigns real UUIDs to new links).
  const id =
    typeof o.id === "string" && o.id.trim() ? o.id.trim() : `link-${index}`;
  const isActive = typeof o.isActive === "boolean" ? o.isActive : true;
  return { id, label, url, isActive };
}

function parseSocials(raw: unknown): BioSocial[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<BioSocialPlatform>();
  const out: BioSocial[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (!isBioSocialPlatform(o.platform) || seen.has(o.platform)) continue;
    const url = sanitizeBioLinkUrl(o.url);
    if (!url) continue; // drop unsafe / invalid
    seen.add(o.platform);
    out.push({ platform: o.platform, url });
    if (out.length >= MAX_SOCIALS) break;
  }
  return out;
}

export function parseBioPageSettings(raw: unknown): BioPageSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_BIO_PAGE };
  const obj = raw as Record<string, unknown>;

  const headline =
    typeof obj.headline === "string" && obj.headline.trim()
      ? obj.headline.trim().slice(0, MAX_HEADLINE)
      : null;

  const text =
    typeof obj.text === "string" && obj.text.trim()
      ? obj.text.trim().slice(0, MAX_TEXT)
      : null;

  const bookingPolicy =
    typeof obj.bookingPolicy === "string" && obj.bookingPolicy.trim()
      ? obj.bookingPolicy.trim().slice(0, MAX_BOOKING_POLICY)
      : null;

  const hidden: BioModuleKey[] = Array.isArray(obj.hidden)
    ? [...new Set(obj.hidden.filter(isBioModuleKey))]
    : [];

  const customLinks: BioCustomLink[] = Array.isArray(obj.customLinks)
    ? obj.customLinks
        .map(parseOneLink)
        .filter((l): l is BioCustomLink => l !== null)
        .slice(0, MAX_LINKS)
    : [];

  const socials = parseSocials(obj.socials);

  return { headline, text, bookingPolicy, customLinks, socials, hidden };
}

export function isModuleVisible(
  settings: BioPageSettings,
  key: BioModuleKey,
): boolean {
  return !settings.hidden.includes(key);
}

/** Ordered module keys to render, minus the ones the artist hid. */
export function visibleModules(settings: BioPageSettings): BioModuleKey[] {
  return BIO_MODULE_ORDER.filter((m) => isModuleVisible(settings, m));
}
