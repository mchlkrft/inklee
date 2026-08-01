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

// Two families of block. CONTENT blocks (headline/text/link) carry their own
// text and are unlimited-ish per type. FEATURE blocks (Plus build P2b) carry
// NO content: they surface data the artist already maintains elsewhere, so a
// feature block is just presence + position, and it renders nothing when the
// underlying data is empty. That is why they cap at ONE each: two "available
// flash" sections on one page is never what an artist means.
export type BioBlockType =
  | "headline"
  | "text"
  | "link"
  | "booking_form"
  | "goods"
  | "guest_spots"
  | "flash"
  | "books_status"
  | "featured_collection"
  | "image_gallery";

/** Blocks that render the artist's existing data and hold no content. */
export const BIO_FEATURE_BLOCK_TYPES = [
  "booking_form",
  "goods",
  "guest_spots",
  "flash",
  "books_status",
] as const;
export type BioFeatureBlockType = (typeof BIO_FEATURE_BLOCK_TYPES)[number];

export function isFeatureBlockType(v: unknown): v is BioFeatureBlockType {
  return (
    typeof v === "string" &&
    (BIO_FEATURE_BLOCK_TYPES as readonly string[]).includes(v)
  );
}

// A THIRD family, and the only one that carries a reference rather than
// content: `featured_collection` names one shop collection to surface on the
// Hub (Plus build P5d). It is not a FEATURE block, because those are pure
// presence and cap at one; several featured collections on one Hub is a
// reasonable thing to want ("Prints" and "Winter drop" both up top). What is
// never meant is the SAME collection twice, so the parser dedupes on
// collectionId rather than capping the type at one.
export function isReferenceBlockType(v: unknown): v is "featured_collection" {
  return v === "featured_collection";
}

// A FOURTH family: MEDIA blocks carry their own uploaded content (images), like
// the content blocks but richer, and unlike feature/reference blocks they hold
// no external reference. `image_gallery` is the first (Plus build, Stage 3). It
// is a Plus RICH BLOCK: the hub stays free, but the rich blocks are gated by the
// `rich_content_blocks` entitlement (founder ruling FD1, 2026-08-01, SUPERSEDES
// the earlier `appearance_custom` gate), enforced at render + the editor, not
// in this pure parser.
export function isMediaBlockType(v: unknown): v is "image_gallery" {
  return v === "image_gallery";
}

export const BIO_BLOCK_TYPES: readonly BioBlockType[] = [
  "headline",
  "text",
  "link",
  ...BIO_FEATURE_BLOCK_TYPES,
  "featured_collection",
  "image_gallery",
];

/** Editor labels for each block type (shared by the web + app editors). */
export const BIO_BLOCK_META: Record<
  BioBlockType,
  { label: string; addLabel: string }
> = {
  headline: { label: "Headline", addLabel: "Add headline" },
  text: { label: "Text", addLabel: "Add text" },
  link: { label: "Link", addLabel: "Add link" },
  booking_form: { label: "Booking form", addLabel: "Add booking form" },
  goods: { label: "Shop", addLabel: "Add shop" },
  guest_spots: { label: "Guest spots", addLabel: "Add guest spots" },
  flash: { label: "Flash", addLabel: "Add flash" },
  books_status: { label: "Books status", addLabel: "Add books status" },
  featured_collection: {
    label: "Featured collection",
    addLabel: "Add featured collection",
  },
  image_gallery: { label: "Image gallery", addLabel: "Add image gallery" },
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
/** A content-free block that renders the artist's existing data. */
export type BioFeatureBlock = { id: string; type: BioFeatureBlockType };

/** Names one collection to surface on the Hub. Holds the reference only: the
 *  name, the products and their order are read live, so renaming a collection
 *  or rearranging it is reflected here without touching the Hub. */
export type BioFeaturedCollectionBlock = {
  id: string;
  type: "featured_collection";
  collectionId: string;
};

/** One image in a gallery block. `url` is an absolute http(s) image URL (the
 *  artist's uploaded media); `caption` and `alt` are optional short strings. */
export type BioGalleryImage = {
  url: string;
  caption?: string;
  alt?: string;
};

/** A media block carrying the artist's own uploaded images. A Plus rich block
 *  (gated by `rich_content_blocks` at render + editor, founder ruling FD1,
 *  2026-08-01); the pure parser keeps it regardless of entitlement, exactly
 *  like `featured_collection`. */
export type BioImageGalleryBlock = {
  id: string;
  type: "image_gallery";
  images: BioGalleryImage[];
  /** How the gallery lays out. `grid` is the default; `carousel` is a single
   *  swimlane. Unknown values normalise to `grid`. */
  layout: "grid" | "carousel";
};

export type BioBlock =
  | BioHeadlineBlock
  | BioTextBlock
  | BioLinkBlock
  | BioFeatureBlock
  | BioFeaturedCollectionBlock
  | BioImageGalleryBlock;

/** Narrow a block to the feature family. Takes the BLOCK (not its type) so
 *  callers keep discriminated-union narrowing on the else branch. */
export function isFeatureBlock(block: BioBlock): block is BioFeatureBlock {
  return isFeatureBlockType(block.type);
}

/**
 * SAVE-PATH entitlement gate for the media rich blocks (image_gallery),
 * mirroring the RENDER gate (hub/page.tsx `richBlocksAllowed =
 * richContentBlocksAllowed`). The pure parser keeps gallery blocks regardless of
 * entitlement (so a downgrade never loses stored data); this is where a write is
 * refused for an unentitled artist.
 *
 * For an UNENTITLED artist a NEW or CHANGED gallery block is dropped, but one
 * that already exists UNCHANGED is preserved verbatim. That is decision D2: a
 * downgrade HIDES Plus content rather than deleting it, and an unrelated edit
 * (reordering links, editing a headline) must not strip a saved gallery.
 * "Unchanged" = same stable `id` and deep-equal; both arguments are parser
 * outputs, so key order is stable and JSON.stringify comparison is reliable.
 * Non-media blocks are always kept. Identity function when `entitled`.
 *
 * Shared so the web action and the mobile route enforce identically (one source
 * of truth); each caller phrases its own "N skipped" note from `droppedMedia`.
 */
export function gateMediaBlocksForSave(
  proposed: BioBlock[],
  current: BioBlock[],
  entitled: boolean,
): { blocks: BioBlock[]; droppedMedia: number } {
  if (entitled) return { blocks: proposed, droppedMedia: 0 };
  const unchangedById = new Map(
    current
      .filter((b) => isMediaBlockType(b.type))
      .map((b) => [b.id, JSON.stringify(b)] as const),
  );
  let droppedMedia = 0;
  const blocks = proposed.filter((b) => {
    if (!isMediaBlockType(b.type)) return true;
    if (unchangedById.get(b.id) === JSON.stringify(b)) return true;
    droppedMedia++;
    return false;
  });
  return { blocks, droppedMedia };
}

/** Social platforms shown as the Hub's icon row. Each key maps to a single
 *  brand glyph path in bio-social-icons.ts, rendered identically on web + app;
 *  "website" / "email" are the catch-alls (generic glyph, not a brand mark). */
export type BioSocialPlatform =
  // Social + video
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x"
  | "facebook"
  | "threads"
  | "snapchat"
  | "twitch"
  | "pinterest"
  | "weibo"
  // Music
  | "spotify"
  | "soundcloud"
  // Messaging
  | "telegram"
  | "signal"
  | "line"
  | "viber"
  | "wechat"
  | "kakaotalk"
  // Creator + commerce
  | "patreon"
  | "kofi"
  | "buymeacoffee"
  | "substack"
  | "fourthwall"
  | "gumroad"
  | "etsy"
  | "bigcartel"
  // Catch-alls
  | "website"
  | "email";

// Order here drives the editor's dropdown + add-chip order: mainstream social
// and video first, then music, messaging, creator/commerce, and the catch-alls
// last. The public Hub renders socials in the artist's own saved order, not this.
export const BIO_SOCIAL_PLATFORMS: readonly BioSocialPlatform[] = [
  "instagram",
  "tiktok",
  "youtube",
  "x",
  "facebook",
  "threads",
  "snapchat",
  "twitch",
  "pinterest",
  "weibo",
  "spotify",
  "soundcloud",
  "telegram",
  "signal",
  "line",
  "viber",
  "wechat",
  "kakaotalk",
  "patreon",
  "kofi",
  "buymeacoffee",
  "substack",
  "fourthwall",
  "gumroad",
  "etsy",
  "bigcartel",
  "website",
  "email",
];

export type BioSocial = {
  platform: BioSocialPlatform;
  /** Sanitized http(s) URL (or mailto: for email). */
  url: string;
};

/** Display labels for each platform — shared by the web + app editors and used
 *  as the accessible name on the Hub's icon row. Brand GLYPHS are single-sourced
 *  in bio-social-icons.ts (one 24x24 path per platform), rendered as an <svg> on
 *  web and via react-native-svg on the app; website / email and any platform
 *  without a path fall back to a generic glyph in each renderer. */
export const BIO_SOCIAL_META: Record<BioSocialPlatform, { label: string }> = {
  instagram: { label: "Instagram" },
  tiktok: { label: "TikTok" },
  x: { label: "X" },
  facebook: { label: "Facebook" },
  youtube: { label: "YouTube" },
  threads: { label: "Threads" },
  pinterest: { label: "Pinterest" },
  weibo: { label: "Weibo" },
  spotify: { label: "Spotify" },
  soundcloud: { label: "SoundCloud" },
  snapchat: { label: "Snapchat" },
  twitch: { label: "Twitch" },
  telegram: { label: "Telegram" },
  signal: { label: "Signal" },
  line: { label: "LINE" },
  viber: { label: "Viber" },
  wechat: { label: "WeChat" },
  kakaotalk: { label: "KakaoTalk" },
  patreon: { label: "Patreon" },
  kofi: { label: "Ko-fi" },
  buymeacoffee: { label: "Buy Me a Coffee" },
  substack: { label: "Substack" },
  fourthwall: { label: "Fourthwall" },
  gumroad: { label: "Gumroad" },
  etsy: { label: "Etsy" },
  bigcartel: { label: "Big Cartel" },
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
/** Image gallery block limits. Images past the cap are dropped, order kept. */
export const MAX_GALLERY_IMAGES = 12;
export const MAX_GALLERY_CAPTION = 120;
export const MAX_GALLERY_ALT = 120;
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

/** Allow only absolute http(s) image URLs. Unlike sanitizeBioLinkUrl this
 *  rejects mailto: and never prepends a scheme: an image src must be a real
 *  absolute URL, and a bare/relative value is dropped rather than guessed. This
 *  is what keeps a gallery's <img src> safe on a public page. General-purpose
 *  primitive; gallery images use the stricter `sanitizeHostedGalleryImageUrl`
 *  below, which calls this first. */
export function sanitizeImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

/** The Supabase Storage public-URL marker every Inklee-hosted object uses
 *  (bucket `logos`). Exported so `hub-images.ts` (web, orphan cleanup) reads
 *  the SAME literal rather than keeping a second copy that could quietly
 *  drift from what this gate accepts. */
export const HOSTED_LOGOS_PUBLIC_MARKER = "/storage/v1/object/public/logos/";

/** Allow only an Inklee-HOSTED absolute http(s) image URL: a `supabase.co`
 *  host, under the `logos` bucket's public-object path (founder ruling FD4,
 *  2026-08-01, SUPERSEDES GB2). A public gallery image must never render
 *  from an arbitrary third-party host. Safe to enforce strictly
 *  retroactively: the gallery capability has never been granted, so no
 *  external-URL gallery data exists to break (verified against
 *  `computeLegacyFreeV1Grant`, entitlements.ts).
 *
 *  Trust boundary note: this matches the CSP's existing `img-src
 *  https://*.supabase.co` directive (next.config.ts) — any `*.supabase.co`
 *  subdomain, not only this project's — so it is not a NEW trust boundary,
 *  only this parser catching up to what the page already renders. A
 *  same-project-only check would be strictly tighter but needs an env read,
 *  which this module deliberately has none of (PURE, safe for client
 *  bundles); the actual upload/import pipeline only ever writes to THIS
 *  project's bucket, so this only matters for a hand-crafted save payload
 *  naming a foreign Supabase project's public storage. */
export function sanitizeHostedGalleryImageUrl(raw: unknown): string | null {
  const url = sanitizeImageUrl(raw);
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!parsed.hostname.toLowerCase().endsWith(".supabase.co")) return null;
  if (!parsed.pathname.includes(HOSTED_LOGOS_PUBLIC_MARKER)) return null;
  return url;
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

  // Feature blocks hold no content: presence and position are the whole
  // payload, so there is nothing to sanitize and nothing that can be empty.
  if (isFeatureBlockType(o.type)) {
    return { id: blockId(o, `${o.type}-${index}`), type: o.type };
  }

  // A featured collection is a REFERENCE. A block naming nothing is not an
  // empty section to render, it is a broken one, so it is dropped exactly like
  // an empty headline. Whether the id still resolves to a live collection is
  // deliberately NOT checked here: this parser is pure and has no database, and
  // the renderer already drops a collection it cannot read. Dropping it here on
  // a failed lookup would also mean a transient read error silently deleting
  // the artist's block from their saved settings.
  if (isReferenceBlockType(o.type)) {
    const collectionId =
      typeof o.collectionId === "string" ? o.collectionId.trim() : "";
    if (!collectionId) return null;
    return {
      id: blockId(o, `${o.type}-${index}`),
      type: "featured_collection",
      collectionId,
    };
  }

  // An image gallery carries the artist's own images. Each image is kept only
  // if its url is an Inklee-HOSTED absolute http(s) URL (founder ruling FD4,
  // 2026-08-01, SUPERSEDES GB2: the permanent free-text URL field is removed
  // from the editor, so a gallery image now only ever reaches this parser via
  // the direct-upload or "Import from URL" pipelines, both of which always
  // write to Inklee's own storage — an external URL is dropped, exactly like
  // an unsafe one); captions/alt are trimmed and capped. Images past the cap
  // are dropped, order preserved. A gallery with no valid image is a broken
  // section, so it is dropped exactly like an empty headline. Entitlement is
  // NOT checked here (pure parser, no database): the renderer + editor gate
  // it on `rich_content_blocks` (founder ruling FD1, 2026-08-01), and
  // stripping it here on a downgrade would silently delete the artist's
  // saved work.
  if (isMediaBlockType(o.type)) {
    const rawImages = Array.isArray(o.images) ? o.images : [];
    const images: BioGalleryImage[] = [];
    for (const item of rawImages) {
      if (images.length >= MAX_GALLERY_IMAGES) break;
      if (!item || typeof item !== "object") continue;
      const io = item as Record<string, unknown>;
      const url = sanitizeHostedGalleryImageUrl(io.url);
      if (!url) continue;
      const image: BioGalleryImage = { url };
      if (typeof io.caption === "string" && io.caption.trim()) {
        image.caption = io.caption.trim().slice(0, MAX_GALLERY_CAPTION);
      }
      if (typeof io.alt === "string" && io.alt.trim()) {
        image.alt = io.alt.trim().slice(0, MAX_GALLERY_ALT);
      }
      images.push(image);
    }
    if (images.length === 0) return null;
    const layout = o.layout === "carousel" ? "carousel" : "grid";
    return {
      id: blockId(o, `${o.type}-${index}`),
      type: "image_gallery",
      images,
      layout,
    };
  }

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
  const counts = Object.fromEntries(
    BIO_BLOCK_TYPES.map((k) => [k, 0]),
  ) as Record<BioBlockType, number>;
  // The id drives React keys AND identity-based edit/remove in both editors, so
  // a duplicate id (two equal explicit ids, or an explicit id equal to another
  // block's positional fallback) would corrupt the wrong row. The parser is the
  // single guarantor of unique ids for all three surfaces, so enforce it here
  // (mirrors parseSocials' per-platform dedupe).
  const seenIds = new Set<string>();
  // One block per COLLECTION. The type cap alone would allow ten blocks all
  // pointing at "Prints", which renders the same section ten times.
  const seenCollections = new Set<string>();
  const out: BioBlock[] = [];
  source.forEach((raw, index) => {
    const block = parseOneBlock(raw, index);
    if (!block) return;
    if (block.type === "featured_collection") {
      if (seenCollections.has(block.collectionId)) return;
      seenCollections.add(block.collectionId);
    }
    // The parser is the enforcement point for the cap, not just the editor:
    // a stale client or a hand-edited payload must not be able to store two
    // shop sections.
    if (counts[block.type] >= maxBlocksOfType(block.type)) return;
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
  const counts = Object.fromEntries(
    BIO_BLOCK_TYPES.map((k) => [k, 0]),
  ) as Record<BioBlockType, number>;
  for (const b of blocks) counts[b.type] += 1;
  return counts;
}

/** The per-type cap. Feature blocks cap at ONE: they surface a whole section
 *  of the artist's data, so a second copy is never what someone means, and
 *  duplicates would render the same shop or flash list twice. */
export function maxBlocksOfType(type: BioBlockType): number {
  return isFeatureBlockType(type) ? 1 : MAX_BLOCKS_PER_TYPE;
}

/** Whether another block of `type` may be added (under the per-type cap). */
export function canAddBlock(blocks: BioBlock[], type: BioBlockType): boolean {
  return countBlocksByType(blocks)[type] < maxBlocksOfType(type);
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
