// Per-artist Bio Page / Inklee Hub configuration. Stored in
// `profiles.settings.bio_page` JSONB (no migration needed, same pattern as
// deposit_defaults / dashboard widgets / cover image).
//
// Two surfaces consume this ONE module (the source of truth, per the web<->app
// alignment rule): the web public render + web editor, and — from the Hub work
// (ME-11) — the native app editor via a mobile API route. The booking page is
// untouched; the Inklee Hub is an additive standalone surface at /<slug>/hub.
//
// The Hub body is an ORDERED, MIXED list of `blocks` (headline / text / link)
// the artist arranges freely (like the booking-form field editor), up to 10 of
// each type. Socials are a fixed icon row that always renders above the blocks.
// Legacy rows that stored a single `headline` + `text` + `customLinks[]` are
// read transparently by synthesizing blocks from them, so live data needs no
// migration; the new shape is written back on the next save.

export type BioModuleKey = "links" | "policy" | "shop";

/** Optional modules rendered below the booking section, in this fixed order. */
export const BIO_MODULE_ORDER: readonly BioModuleKey[] = [
  "links",
  "policy",
  "shop",
];

export type BioBlockType = "headline" | "text" | "link";

export const BIO_BLOCK_TYPES: readonly BioBlockType[] = [
  "headline",
  "text",
  "link",
];

/** Editor labels for each block type (shared by the web + app editors). */
export const BIO_BLOCK_META: Record<
  BioBlockType,
  { label: string; addLabel: string }
> = {
  headline: { label: "Headline", addLabel: "Add headline" },
  text: { label: "Text", addLabel: "Add text" },
  link: { label: "Link", addLabel: "Add link" },
};

export type BioHeadlineBlock = { id: string; type: "headline"; text: string };
export type BioTextBlock = { id: string; type: "text"; text: string };
export type BioLinkBlock = {
  id: string;
  type: "link";
  label: string;
  url: string;
  isActive: boolean;
};

/** One arrangeable item on the Hub body. */
export type BioBlock = BioHeadlineBlock | BioTextBlock | BioLinkBlock;

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
  /** Ordered, mixed blocks (headline / text / link) the artist arranges. */
  blocks: BioBlock[];
  bookingPolicy: string | null;
  /** Social icon row for the Hub, FIXED above the blocks. One entry per platform. */
  socials: BioSocial[];
  /** Modules the artist has explicitly hidden from the public page. */
  hidden: BioModuleKey[];
};

export const DEFAULT_BIO_PAGE: BioPageSettings = {
  blocks: [],
  bookingPolicy: null,
  socials: [],
  hidden: [],
};

export const MAX_HEADLINE = 80;
export const MAX_TEXT = 500;
export const MAX_BOOKING_POLICY = 1000;
export const MAX_LINK_LABEL = 60;
/** Up to 10 of each block type (headlines / texts / links). */
export const MAX_BLOCKS_PER_TYPE = 10;
export const MAX_SOCIALS = BIO_SOCIAL_PLATFORMS.length;

const MODULE_KEYS = new Set<BioModuleKey>(BIO_MODULE_ORDER);
const SOCIAL_KEYS = new Set<BioSocialPlatform>(BIO_SOCIAL_PLATFORMS);
const BLOCK_TYPES = new Set<BioBlockType>(BIO_BLOCK_TYPES);

/** A simple "looks like an email" check (one @, a dotted domain). Used for both
 *  mailto: addresses and bare email input that should become a mailto link. */
const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isBioModuleKey(v: unknown): v is BioModuleKey {
  return typeof v === "string" && MODULE_KEYS.has(v as BioModuleKey);
}

function isBioSocialPlatform(v: unknown): v is BioSocialPlatform {
  return typeof v === "string" && SOCIAL_KEYS.has(v as BioSocialPlatform);
}

function isBioBlockType(v: unknown): v is BioBlockType {
  return typeof v === "string" && BLOCK_TYPES.has(v as BioBlockType);
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

function blockId(raw: Record<string, unknown>, fallback: string): string {
  return typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : fallback;
}

/** Parse one block; returns null to DROP it (empty headline/text, unsafe URL,
 *  or an unknown type). The index gives a stable fallback id for legacy rows. */
function parseOneBlock(raw: unknown, index: number): BioBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isBioBlockType(o.type)) return null;

  if (o.type === "headline" || o.type === "text") {
    const max = o.type === "headline" ? MAX_HEADLINE : MAX_TEXT;
    const text =
      typeof o.text === "string" ? o.text.trim().slice(0, max) : "";
    if (!text) return null; // an empty headline/text is nothing to render
    return { id: blockId(o, `${o.type}-${index}`), type: o.type, text };
  }

  // link
  const url = sanitizeBioLinkUrl(o.url);
  if (!url) return null; // unsafe / invalid URL → drop the whole link
  const label =
    typeof o.label === "string" && o.label.trim()
      ? o.label.trim().slice(0, MAX_LINK_LABEL)
      : url;
  const isActive = typeof o.isActive === "boolean" ? o.isActive : true;
  return { id: blockId(o, `link-${index}`), type: "link", label, url, isActive };
}

/** Build raw block objects from the legacy { headline, text, customLinks }
 *  shape so pre-blocks rows render without a migration. Order matches the old
 *  public layout: headline, then text, then the links. */
function legacyToRawBlocks(obj: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  if (typeof obj.headline === "string" && obj.headline.trim()) {
    out.push({ type: "headline", text: obj.headline });
  }
  if (typeof obj.text === "string" && obj.text.trim()) {
    out.push({ type: "text", text: obj.text });
  }
  if (Array.isArray(obj.customLinks)) {
    for (const l of obj.customLinks) {
      if (l && typeof l === "object") out.push({ ...l, type: "link" });
    }
  }
  return out;
}

/** Parse + cap the ordered block list. Caps are PER TYPE (10 headlines, 10
 *  texts, 10 links); extras of a type past the cap are dropped, order preserved. */
function parseBlocks(obj: Record<string, unknown>): BioBlock[] {
  const source = Array.isArray(obj.blocks)
    ? obj.blocks
    : legacyToRawBlocks(obj);
  const counts: Record<BioBlockType, number> = {
    headline: 0,
    text: 0,
    link: 0,
  };
  // The id drives React keys AND identity-based edit/remove in both editors, so
  // a duplicate id (two equal explicit ids, or an explicit id equal to another
  // block's positional fallback) would corrupt the wrong row. The parser is the
  // single guarantor of unique ids for all three surfaces, so enforce it here
  // (mirrors parseSocials' per-platform dedupe).
  const seenIds = new Set<string>();
  const out: BioBlock[] = [];
  source.forEach((raw, index) => {
    const block = parseOneBlock(raw, index);
    if (!block) return;
    if (counts[block.type] >= MAX_BLOCKS_PER_TYPE) return;
    counts[block.type] += 1;
    let id = block.id;
    if (seenIds.has(id)) id = `${block.type}-${index}`;
    while (seenIds.has(id)) id = `${block.type}-${index}-${seenIds.size}`;
    seenIds.add(id);
    out.push(id === block.id ? block : ({ ...block, id } as BioBlock));
  });
  return out;
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

  const bookingPolicy =
    typeof obj.bookingPolicy === "string" && obj.bookingPolicy.trim()
      ? obj.bookingPolicy.trim().slice(0, MAX_BOOKING_POLICY)
      : null;

  const hidden: BioModuleKey[] = Array.isArray(obj.hidden)
    ? [...new Set(obj.hidden.filter(isBioModuleKey))]
    : [];

  const blocks = parseBlocks(obj);
  const socials = parseSocials(obj.socials);

  return { blocks, bookingPolicy, socials, hidden };
}

/** Count blocks of each type — drives the editor's per-type "Add" caps. */
export function countBlocksByType(
  blocks: BioBlock[],
): Record<BioBlockType, number> {
  const counts: Record<BioBlockType, number> = {
    headline: 0,
    text: 0,
    link: 0,
  };
  for (const b of blocks) counts[b.type] += 1;
  return counts;
}

/** Whether another block of `type` may be added (under the per-type cap). */
export function canAddBlock(blocks: BioBlock[], type: BioBlockType): boolean {
  return countBlocksByType(blocks)[type] < MAX_BLOCKS_PER_TYPE;
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
