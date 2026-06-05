// Per-artist Bio Page configuration. Stored in `profiles.settings.bio_page`
// JSONB so no migration is needed — same pattern as `deposit_defaults`,
// dashboard widgets, and cover image / colour (Slice 72).
//
// The Bio Page evolves the public artist page from "just a booking form" into a
// tattoo-native bio page. Booking stays the primary conversion; these optional
// modules render BELOW the booking section. Shop is an architectural slot here
// and renders real products from Slice 73 onward (until then it renders null).

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

export type BioPageSettings = {
  bookingPolicy: string | null;
  customLinks: BioCustomLink[];
  /** Modules the artist has explicitly hidden from the public page. */
  hidden: BioModuleKey[];
};

export const DEFAULT_BIO_PAGE: BioPageSettings = {
  bookingPolicy: null,
  customLinks: [],
  hidden: [],
};

export const MAX_BOOKING_POLICY = 1000;
export const MAX_LINK_LABEL = 60;
export const MAX_LINKS = 12;

const MODULE_KEYS = new Set<BioModuleKey>(BIO_MODULE_ORDER);

function isBioModuleKey(v: unknown): v is BioModuleKey {
  return typeof v === "string" && MODULE_KEYS.has(v as BioModuleKey);
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
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) ? `mailto:${addr}` : null;
  }

  // Prepend https:// only when there is no scheme at all. A value that already
  // carries a scheme (including javascript:/data:) is left for URL() to judge,
  // so we never accidentally turn `javascript:alert(1)` into a valid URL.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(v);
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

export function parseBioPageSettings(raw: unknown): BioPageSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_BIO_PAGE };
  const obj = raw as Record<string, unknown>;

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

  return { bookingPolicy, customLinks, hidden };
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
