import { describe, it, expect } from "vitest";
import {
  sanitizeBioLinkUrl,
  parseBioPageSettings,
  visibleModules,
  isModuleVisible,
  countBlocksByType,
  canAddBlock,
  isFeatureBlock,
  isGoodsBlock,
  preserveGoodsDestinationOnSave,
  BIO_FEATURE_BLOCK_TYPES,
  BIO_BLOCK_TYPES,
  BIO_BLOCK_META,
  BIO_GOODS_DESTINATIONS,
  DEFAULT_BIO_PAGE,
  MAX_BOOKING_POLICY,
  MAX_HEADLINE,
  MAX_TEXT,
  MAX_BLOCKS_PER_TYPE,
  sanitizeImageUrl,
  sanitizeHostedGalleryImageUrl,
  MAX_GALLERY_IMAGES,
  MAX_GALLERY_CAPTION,
  type BioGoodsBlock,
} from "../bio-page-settings";

describe("sanitizeBioLinkUrl", () => {
  it("accepts https and http URLs", () => {
    expect(sanitizeBioLinkUrl("https://instagram.com/artist")).toBe(
      "https://instagram.com/artist",
    );
    expect(sanitizeBioLinkUrl("http://example.com/")).toBe(
      "http://example.com/",
    );
  });

  it("prepends https:// to bare domains", () => {
    expect(sanitizeBioLinkUrl("instagram.com/artist")).toBe(
      "https://instagram.com/artist",
    );
  });

  it("accepts a well-formed mailto address", () => {
    expect(sanitizeBioLinkUrl("mailto:hi@artist.com")).toBe(
      "mailto:hi@artist.com",
    );
  });

  it("rejects malformed mailto", () => {
    expect(sanitizeBioLinkUrl("mailto:not-an-email")).toBeNull();
  });

  it("treats a bare email address as mailto, not https", () => {
    expect(sanitizeBioLinkUrl("hi@artist.com")).toBe("mailto:hi@artist.com");
    expect(sanitizeBioLinkUrl("  hi@artist.com  ")).toBe(
      "mailto:hi@artist.com",
    );
  });

  it("does not mistake a bare domain for an email", () => {
    expect(sanitizeBioLinkUrl("artist.com")).toBe("https://artist.com/");
  });

  it("rejects unsafe schemes", () => {
    expect(sanitizeBioLinkUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeBioLinkUrl("  javascript:alert(1)")).toBeNull();
    expect(sanitizeBioLinkUrl("JavaScript:alert(1)")).toBeNull();
    expect(sanitizeBioLinkUrl("data:text/html,<script>")).toBeNull();
    expect(sanitizeBioLinkUrl("file:///etc/passwd")).toBeNull();
    expect(sanitizeBioLinkUrl("ftp://example.com")).toBeNull();
  });

  it("rejects empty / non-string input", () => {
    expect(sanitizeBioLinkUrl("")).toBeNull();
    expect(sanitizeBioLinkUrl("   ")).toBeNull();
    expect(sanitizeBioLinkUrl(null)).toBeNull();
    expect(sanitizeBioLinkUrl(42)).toBeNull();
  });
});

describe("parseBioPageSettings", () => {
  it("returns defaults for empty / invalid input", () => {
    expect(parseBioPageSettings(null)).toEqual(DEFAULT_BIO_PAGE);
    expect(parseBioPageSettings(undefined)).toEqual(DEFAULT_BIO_PAGE);
    expect(parseBioPageSettings("nope")).toEqual(DEFAULT_BIO_PAGE);
    expect(parseBioPageSettings({})).toEqual(DEFAULT_BIO_PAGE);
  });

  it("trims and caps the booking policy", () => {
    expect(
      parseBioPageSettings({ bookingPolicy: "  hi  " }).bookingPolicy,
    ).toBe("hi");
    const long = "x".repeat(MAX_BOOKING_POLICY + 50);
    expect(
      parseBioPageSettings({ bookingPolicy: long }).bookingPolicy?.length,
    ).toBe(MAX_BOOKING_POLICY);
    expect(
      parseBioPageSettings({ bookingPolicy: "   " }).bookingPolicy,
    ).toBeNull();
  });

  it("parses headline / text / link blocks in order", () => {
    const result = parseBioPageSettings({
      blocks: [
        { id: "h1", type: "headline", text: "  Fine-line tattoos  " },
        { id: "t1", type: "text", text: "Booking this season." },
        { id: "l1", type: "link", label: "IG", url: "instagram.com/x" },
      ],
    });
    expect(result.blocks).toEqual([
      { id: "h1", type: "headline", text: "Fine-line tattoos" },
      { id: "t1", type: "text", text: "Booking this season." },
      {
        id: "l1",
        type: "link",
        label: "IG",
        url: "https://instagram.com/x",
        isActive: true,
      },
    ]);
  });

  it("caps headline / text length and drops empty ones", () => {
    const result = parseBioPageSettings({
      blocks: [
        { type: "headline", text: "x".repeat(MAX_HEADLINE + 20) },
        { type: "text", text: "y".repeat(MAX_TEXT + 20) },
        { type: "headline", text: "   " },
        { type: "text", text: "" },
      ],
    });
    expect(result.blocks).toHaveLength(2);
    expect((result.blocks[0] as { text: string }).text.length).toBe(
      MAX_HEADLINE,
    );
    expect((result.blocks[1] as { text: string }).text.length).toBe(MAX_TEXT);
  });

  it("drops link blocks with unsafe URLs, falls back to the URL as label", () => {
    const result = parseBioPageSettings({
      blocks: [
        { type: "link", label: "evil", url: "javascript:alert(1)" },
        { type: "link", url: "https://x.com" },
        { type: "link", label: "Site", url: "site.com", isActive: false },
      ],
    });
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toMatchObject({
      type: "link",
      label: "https://x.com/",
      url: "https://x.com/",
      isActive: true,
    });
    expect(result.blocks[1]).toMatchObject({
      type: "link",
      label: "Site",
      url: "https://site.com/",
      isActive: false,
    });
  });

  it("drops unknown block types", () => {
    const result = parseBioPageSettings({
      blocks: [
        { type: "shop", text: "nope" },
        { type: "headline", text: "ok" },
      ],
    });
    expect(result.blocks).toEqual([
      { id: "headline-1", type: "headline", text: "ok" },
    ]);
  });

  it("caps each block type at MAX_BLOCKS_PER_TYPE independently", () => {
    const blocks = [
      ...Array.from({ length: MAX_BLOCKS_PER_TYPE + 3 }, (_, i) => ({
        type: "headline",
        text: `h${i}`,
      })),
      ...Array.from({ length: MAX_BLOCKS_PER_TYPE + 3 }, (_, i) => ({
        type: "link",
        url: `https://x${i}.com`,
      })),
    ];
    const counts = countBlocksByType(parseBioPageSettings({ blocks }).blocks);
    expect(counts.headline).toBe(MAX_BLOCKS_PER_TYPE);
    expect(counts.link).toBe(MAX_BLOCKS_PER_TYPE);
  });

  it("reassigns duplicate block ids so emitted ids are unique", () => {
    const result = parseBioPageSettings({
      blocks: [
        { id: "dup", type: "headline", text: "first" },
        { id: "dup", type: "text", text: "second" },
        // explicit id colliding with the first block's positional fallback
        { id: "headline-0", type: "link", url: "https://x.com" },
      ],
    });
    const ids = result.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(result.blocks).toHaveLength(3);
  });

  it("synthesizes blocks from the legacy headline / text / customLinks shape", () => {
    const result = parseBioPageSettings({
      headline: "Legacy headline",
      text: "Legacy text",
      customLinks: [
        { id: "a", label: "IG", url: "instagram.com/x", isActive: true },
        { id: "b", label: "evil", url: "javascript:alert(1)" }, // dropped
      ],
    });
    expect(result.blocks).toEqual([
      { id: "headline-0", type: "headline", text: "Legacy headline" },
      { id: "text-1", type: "text", text: "Legacy text" },
      {
        id: "a",
        type: "link",
        label: "IG",
        url: "https://instagram.com/x",
        isActive: true,
      },
    ]);
  });

  it("prefers an explicit blocks array over legacy fields", () => {
    const result = parseBioPageSettings({
      headline: "Legacy",
      blocks: [{ type: "headline", text: "New" }],
    });
    expect(result.blocks).toEqual([
      { id: "headline-0", type: "headline", text: "New" },
    ]);
  });

  it("preserves booking policy + hidden when only blocks change", () => {
    const current = parseBioPageSettings({
      bookingPolicy: "Deposits are non-refundable.",
      hidden: ["policy", "shop"],
    });
    // Mirrors the Link Hub save: spread current, override only hub fields.
    const next = parseBioPageSettings({
      ...current,
      blocks: [{ type: "headline", text: "New headline" }],
    });
    expect(next.bookingPolicy).toBe("Deposits are non-refundable.");
    expect(next.hidden).toEqual(["policy", "shop"]);
    expect(next.blocks).toEqual([
      { id: "headline-0", type: "headline", text: "New headline" },
    ]);
  });

  it("keeps only known module keys in hidden and dedupes", () => {
    expect(
      parseBioPageSettings({ hidden: ["links", "links", "bogus", "shop"] })
        .hidden,
    ).toEqual(["links", "shop"]);
  });

  it("defaults socials to an empty array", () => {
    expect(parseBioPageSettings({}).socials).toEqual([]);
  });

  it("parses valid socials, sanitizes URLs, and drops unknown platforms", () => {
    const result = parseBioPageSettings({
      socials: [
        { platform: "instagram", url: "instagram.com/jane" },
        { platform: "email", url: "mailto:hi@jane.com" },
        { platform: "myspace", url: "https://myspace.com/jane" }, // unknown → drop
        { platform: "tiktok", url: "javascript:alert(1)" }, // unsafe → drop
      ],
    });
    expect(result.socials).toEqual([
      { platform: "instagram", url: "https://instagram.com/jane" },
      { platform: "email", url: "mailto:hi@jane.com" },
    ]);
  });

  it("turns a bare email social into a mailto link", () => {
    const result = parseBioPageSettings({
      socials: [{ platform: "email", url: "hi@jane.com" }],
    });
    expect(result.socials).toEqual([
      { platform: "email", url: "mailto:hi@jane.com" },
    ]);
  });

  it("keeps only the first entry per platform", () => {
    const result = parseBioPageSettings({
      socials: [
        { platform: "x", url: "https://x.com/a" },
        { platform: "x", url: "https://x.com/b" },
      ],
    });
    expect(result.socials).toEqual([{ platform: "x", url: "https://x.com/a" }]);
  });
});

describe("countBlocksByType / canAddBlock", () => {
  it("counts per type and gates adds at the cap", () => {
    const blocks = parseBioPageSettings({
      blocks: [
        { type: "headline", text: "a" },
        { type: "headline", text: "b" },
        { type: "link", url: "https://x.com" },
      ],
    }).blocks;
    // The map is exhaustive over BIO_BLOCK_TYPES, which now includes the
    // feature blocks (P2b), so assert the counted types rather than pinning
    // the full key set here (the exhaustiveness is covered separately).
    expect(countBlocksByType(blocks)).toMatchObject({
      headline: 2,
      text: 0,
      link: 1,
    });
    expect(Object.keys(countBlocksByType(blocks)).sort()).toEqual(
      [...BIO_BLOCK_TYPES].sort(),
    );
    expect(canAddBlock(blocks, "headline")).toBe(true);
    expect(canAddBlock(blocks, "text")).toBe(true);

    const maxed = parseBioPageSettings({
      blocks: Array.from({ length: MAX_BLOCKS_PER_TYPE }, () => ({
        type: "link",
        url: "https://x.com",
      })),
    }).blocks;
    // Same URL dedupe? No dedupe on links — all kept up to the cap.
    expect(canAddBlock(maxed, "link")).toBe(false);
  });
});

describe("visibleModules / isModuleVisible", () => {
  it("returns all modules in order when nothing is hidden", () => {
    expect(visibleModules(DEFAULT_BIO_PAGE)).toEqual([
      "links",
      "policy",
      "shop",
    ]);
  });

  it("filters hidden modules but preserves order", () => {
    const s = parseBioPageSettings({ hidden: ["policy"] });
    expect(visibleModules(s)).toEqual(["links", "shop"]);
    expect(isModuleVisible(s, "policy")).toBe(false);
    expect(isModuleVisible(s, "links")).toBe(true);
  });
});

describe("feature blocks (Plus build P2b)", () => {
  it("parses each feature block with no content payload", () => {
    for (const type of BIO_FEATURE_BLOCK_TYPES) {
      const { blocks } = parseBioPageSettings({ blocks: [{ type }] });
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe(type);
      expect(blocks[0]).not.toHaveProperty("text");
      expect(blocks[0]).not.toHaveProperty("url");
    }
  });

  it("caps feature blocks at ONE each, enforced in the PARSER", () => {
    // Not just the editor: a stale client or a hand-edited payload must not be
    // able to store two shop sections. The FIRST block's own destination is
    // the one kept (FD8): capping does not fall back to the parser default.
    const { blocks } = parseBioPageSettings({
      blocks: [
        { type: "goods", destination: "booking_page" },
        { type: "goods", destination: "standalone_shop" },
        { type: "goods" },
      ],
    });
    expect(blocks).toHaveLength(1);
    expect(canAddBlock(blocks, "goods")).toBe(false);
    expect((blocks[0] as BioGoodsBlock).destination).toBe("booking_page");
  });

  it("still allows ten content blocks per type", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      type: "link",
      label: `L${i}`,
      url: "https://example.com",
    }));
    expect(parseBioPageSettings({ blocks: many }).blocks).toHaveLength(10);
  });

  it("mixes feature and content blocks in the artist's order", () => {
    const { blocks } = parseBioPageSettings({
      blocks: [
        { type: "books_status" },
        { type: "headline", text: "Shop" },
        { type: "goods" },
      ],
    });
    expect(blocks.map((b) => b.type)).toEqual([
      "books_status",
      "headline",
      "goods",
    ]);
  });

  it("gives every block type editor copy", () => {
    for (const type of BIO_BLOCK_TYPES) {
      expect(BIO_BLOCK_META[type].label.length).toBeGreaterThan(0);
      expect(BIO_BLOCK_META[type].addLabel.length).toBeGreaterThan(0);
    }
  });

  it("narrows with isFeatureBlock, keeping union access on the else branch", () => {
    const { blocks } = parseBioPageSettings({
      blocks: [
        { type: "flash" },
        { type: "goods" },
        { type: "link", label: "x", url: "https://example.com" },
      ],
    });
    // "goods" is EXCLUDED from isFeatureBlock (FD8: it carries a field, so it
    // is narrowed separately with isGoodsBlock) — a real behaviour change
    // from before FD8, when isFeatureBlock covered all five types.
    const feature = blocks.filter(isFeatureBlock);
    expect(feature).toHaveLength(1);
    expect(feature[0].type).toBe("flash");
    expect(blocks.filter(isGoodsBlock)).toHaveLength(1);
  });

  it("drops an unknown block type", () => {
    expect(
      parseBioPageSettings({ blocks: [{ type: "carousel" }] }).blocks,
    ).toHaveLength(0);
  });
});

describe("goods block destination (founder ruling FD8, 2026-08-01)", () => {
  const parseGoods = (raw: Record<string, unknown>) =>
    parseBioPageSettings({ blocks: [{ type: "goods", ...raw }] })
      .blocks[0] as BioGoodsBlock;

  it("round-trips an explicit valid destination", () => {
    expect(parseGoods({ destination: "standalone_shop" }).destination).toBe(
      "standalone_shop",
    );
    expect(parseGoods({ destination: "booking_page" }).destination).toBe(
      "booking_page",
    );
  });

  it("falls back an unrecognised (present but invalid) value to the ruling's default", () => {
    expect(parseGoods({ destination: "carrier_pigeon" }).destination).toBe(
      "standalone_shop",
    );
    expect(parseGoods({ destination: 42 }).destination).toBe("standalone_shop");
    expect(parseGoods({ destination: null }).destination).toBe(
      "standalone_shop",
    );
  });

  it("follows the documented rule for a genuinely MISSING key: booking_page, not the ruling's plain default", () => {
    // Preserves today's honest behaviour for a legacy row that predates this
    // field, rather than the ruling's "standalone_shop for new configs"
    // default — see parseGoodsDestination's own comment for why a missing
    // key cannot be told apart from a genuinely new block, and why
    // "booking_page" is the one outcome that cannot regress a live page.
    expect(parseGoods({}).destination).toBe("booking_page");
  });

  it("does not have a destination key when the type is anything else", () => {
    const { blocks } = parseBioPageSettings({
      blocks: [{ type: "flash" }],
    });
    expect(blocks[0]).not.toHaveProperty("destination");
  });

  it("still enforces the one-goods-block cap with destinations attached", () => {
    const { blocks } = parseBioPageSettings({
      blocks: BIO_GOODS_DESTINATIONS.map((destination) => ({
        type: "goods",
        destination,
      })),
    });
    expect(blocks).toHaveLength(1);
    expect(canAddBlock(blocks, "goods")).toBe(false);
  });
});

describe("preserveGoodsDestinationOnSave (FD8 wire-safety)", () => {
  const goods = (
    destination: "standalone_shop" | "booking_page",
  ): BioGoodsBlock => ({
    id: "g1",
    type: "goods",
    destination,
  });

  it("keeps the stored destination when the client omits the key (old-client resave)", () => {
    const raw = [{ id: "g1", type: "goods" }]; // no destination key at all
    const parsed = [goods("booking_page")]; // what the bare parser resolved it to
    const current = [goods("standalone_shop")]; // what was actually stored
    const result = preserveGoodsDestinationOnSave(raw, parsed, current);
    expect((result[0] as BioGoodsBlock).destination).toBe("standalone_shop");
  });

  it("uses the freshly parsed value when the client sends an explicit destination", () => {
    const raw = [{ id: "g1", type: "goods", destination: "booking_page" }];
    const parsed = [goods("booking_page")];
    const current = [goods("standalone_shop")];
    const result = preserveGoodsDestinationOnSave(raw, parsed, current);
    expect((result[0] as BioGoodsBlock).destination).toBe("booking_page");
  });

  it("leaves the parser's default alone when there is nothing stored yet (genuinely new)", () => {
    const raw = [{ id: "g1", type: "goods" }];
    const parsed = [goods("booking_page")];
    const result = preserveGoodsDestinationOnSave(raw, parsed, []);
    expect((result[0] as BioGoodsBlock).destination).toBe("booking_page");
  });

  it("is a no-op when there is no goods block in the save at all", () => {
    const raw = [{ id: "h1", type: "headline", text: "hi" }];
    const parsed = parseBioPageSettings({ blocks: raw }).blocks;
    const result = preserveGoodsDestinationOnSave(raw, parsed, []);
    expect(result).toEqual(parsed);
  });
});

describe("featured_collection blocks (P5d)", () => {
  const parse = (blocks: unknown[]) => parseBioPageSettings({ blocks }).blocks;

  it("keeps a block that names a collection", () => {
    const blocks = parse([{ type: "featured_collection", collectionId: "c1" }]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "featured_collection",
      collectionId: "c1",
    });
  });

  // A block naming nothing is not an empty section, it is a broken one.
  it("drops a block with no collection id", () => {
    expect(parse([{ type: "featured_collection" }])).toHaveLength(0);
    expect(
      parse([{ type: "featured_collection", collectionId: "   " }]),
    ).toHaveLength(0);
    expect(
      parse([{ type: "featured_collection", collectionId: 42 }]),
    ).toHaveLength(0);
  });

  it("trims the id rather than storing whitespace", () => {
    const blocks = parse([
      { type: "featured_collection", collectionId: "  c1  " },
    ]);
    expect(blocks[0]).toMatchObject({ collectionId: "c1" });
  });

  // The type cap alone would allow ten blocks all pointing at the same
  // collection, which renders that section ten times.
  it("keeps only the FIRST block per collection", () => {
    const blocks = parse([
      { type: "featured_collection", collectionId: "c1" },
      { type: "featured_collection", collectionId: "c2" },
      { type: "featured_collection", collectionId: "c1" },
    ]);
    expect(
      blocks.map((b) => (b as { collectionId: string }).collectionId),
    ).toEqual(["c1", "c2"]);
  });

  it("allows several DIFFERENT collections, unlike the content-free blocks", () => {
    const blocks = parse([
      { type: "featured_collection", collectionId: "c1" },
      { type: "featured_collection", collectionId: "c2" },
      { type: "featured_collection", collectionId: "c3" },
    ]);
    expect(blocks).toHaveLength(3);
  });

  // A stale reference is NOT resolved away here: this parser is pure and has
  // no database, and dropping on a failed lookup would let a transient read
  // error delete the artist's saved block. The renderer drops it instead.
  it("keeps a reference the parser cannot verify", () => {
    const blocks = parse([
      { type: "featured_collection", collectionId: "deleted-collection" },
    ]);
    expect(blocks).toHaveLength(1);
  });

  it("gives each block a unique id even when ids collide", () => {
    const blocks = parse([
      { id: "same", type: "featured_collection", collectionId: "c1" },
      { id: "same", type: "featured_collection", collectionId: "c2" },
    ]);
    expect(blocks[0].id).not.toBe(blocks[1].id);
  });
});

describe("sanitizeImageUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(sanitizeImageUrl("https://cdn.inklee/x.jpg")).toBe(
      "https://cdn.inklee/x.jpg",
    );
    expect(sanitizeImageUrl("http://cdn.inklee/x.png")).toBe(
      "http://cdn.inklee/x.png",
    );
  });

  it("rejects bare/relative, mailto, data and javascript URLs (never guesses a scheme)", () => {
    for (const bad of [
      "cdn.inklee/x.jpg", // bare -> NOT prepended (unlike link urls)
      "/uploads/x.jpg",
      "mailto:hi@artist.com",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "",
      "   ",
    ]) {
      expect(sanitizeImageUrl(bad), bad).toBeNull();
    }
  });
});

// image_gallery (Plus build, Stage 3). Parser keeps the block regardless of
// entitlement (that is enforced at render + editor on `rich_content_blocks`,
// founder ruling FD1, 2026-08-01, split off `appearance_custom`); here we
// prove the content sanitization, the caps, and the drop rules. Fixture URLs
// use the real Inklee-hosted shape (founder ruling FD4, 2026-08-01,
// SUPERSEDES GB2: gallery images must be Inklee-hosted, so a `cdn.inklee`-style
// stand-in URL is no longer "safe" — it is exactly what this parser now drops).
const HOSTED = "https://x.supabase.co/storage/v1/object/public/logos/u1/hub";

describe("parseBioPageSettings — image_gallery block", () => {
  function gallery(over: Record<string, unknown> = {}) {
    return {
      blocks: [
        {
          type: "image_gallery",
          images: [{ url: `${HOSTED}/a.jpg` }],
          ...over,
        },
      ],
    };
  }

  it("keeps a gallery with at least one safe image and defaults the layout to grid", () => {
    const { blocks } = parseBioPageSettings(gallery());
    expect(blocks).toHaveLength(1);
    const b = blocks[0];
    expect(b.type).toBe("image_gallery");
    if (b.type === "image_gallery") {
      expect(b.images).toEqual([{ url: `${HOSTED}/a.jpg` }]);
      expect(b.layout).toBe("grid");
    }
  });

  it("keeps a valid carousel layout and normalises an unknown layout to grid", () => {
    expect(
      (
        parseBioPageSettings(gallery({ layout: "carousel" })).blocks[0] as never
      )["layout"],
    ).toBe("carousel");
    expect(
      (parseBioPageSettings(gallery({ layout: "spiral" })).blocks[0] as never)[
        "layout"
      ],
    ).toBe("grid");
  });

  it("drops images with an unsafe/relative url and the whole block when none survive", () => {
    const kept = parseBioPageSettings(
      gallery({
        images: [
          { url: "javascript:alert(1)" },
          { url: "/relative.jpg" },
          { url: `${HOSTED}/ok.jpg` },
        ],
      }),
    ).blocks[0];
    expect((kept as { images: unknown[] }).images).toEqual([
      { url: `${HOSTED}/ok.jpg` },
    ]);

    const dropped = parseBioPageSettings(
      gallery({ images: [{ url: "data:x" }, { url: "nope" }] }),
    ).blocks;
    expect(dropped).toHaveLength(0);

    expect(parseBioPageSettings(gallery({ images: [] })).blocks).toHaveLength(
      0,
    );
  });

  // FD4 (2026-08-01, SUPERSEDES GB2): the permanent free-text URL field is
  // removed from the editor precisely because an external URL must never
  // reach a public gallery. Proves the END-TO-END behaviour through the real
  // parser, not just the unit-level sanitizeHostedGalleryImageUrl below: an
  // otherwise well-formed, absolute https URL is dropped, and a mixed gallery
  // keeps only the hosted image.
  it("drops an otherwise-valid but NON-Inklee-hosted https URL", () => {
    const dropped = parseBioPageSettings(
      gallery({ images: [{ url: "https://cdn.example.com/a.jpg" }] }),
    ).blocks;
    expect(dropped).toHaveLength(0);

    const mixed = parseBioPageSettings(
      gallery({
        images: [
          { url: "https://cdn.example.com/external.jpg" },
          { url: `${HOSTED}/kept.jpg` },
        ],
      }),
    ).blocks[0] as { images: { url: string }[] };
    expect(mixed.images).toEqual([{ url: `${HOSTED}/kept.jpg` }]);
  });

  it("caps images at MAX_GALLERY_IMAGES, order preserved", () => {
    const many = Array.from({ length: MAX_GALLERY_IMAGES + 5 }, (_, i) => ({
      url: `${HOSTED}/${i}.jpg`,
    }));
    const b = parseBioPageSettings(gallery({ images: many })).blocks[0] as {
      images: { url: string }[];
    };
    expect(b.images).toHaveLength(MAX_GALLERY_IMAGES);
    expect(b.images[0].url).toBe(`${HOSTED}/0.jpg`);
    expect(b.images.at(-1)!.url).toBe(
      `${HOSTED}/${MAX_GALLERY_IMAGES - 1}.jpg`,
    );
  });

  it("trims caption + alt and drops empty ones", () => {
    const b = parseBioPageSettings(
      gallery({
        images: [
          {
            url: `${HOSTED}/a.jpg`,
            caption: "  hello  ",
            alt: "   ",
          },
        ],
      }),
    ).blocks[0] as { images: { caption?: string; alt?: string }[] };
    expect(b.images[0].caption).toBe("hello");
    expect(b.images[0].alt).toBeUndefined();
  });

  it("caps a long caption at MAX_GALLERY_CAPTION", () => {
    const b = parseBioPageSettings(
      gallery({
        images: [{ url: `${HOSTED}/a.jpg`, caption: "x".repeat(500) }],
      }),
    ).blocks[0] as { images: { caption?: string }[] };
    expect(b.images[0].caption).toHaveLength(MAX_GALLERY_CAPTION);
  });

  it("caps gallery blocks at the standard per-type block cap", () => {
    const blocks = Array.from({ length: MAX_BLOCKS_PER_TYPE + 3 }, () => ({
      type: "image_gallery",
      images: [{ url: `${HOSTED}/a.jpg` }],
    }));
    const parsed = parseBioPageSettings({ blocks }).blocks;
    expect(parsed).toHaveLength(MAX_BLOCKS_PER_TYPE);
  });
});

// The pure host+path restriction directly (FD4, 2026-08-01, SUPERSEDES GB2),
// independent of the parser's other rules (caps, caption trimming, etc.).
describe("sanitizeHostedGalleryImageUrl", () => {
  it("accepts a supabase.co host under the logos bucket's public marker", () => {
    expect(sanitizeHostedGalleryImageUrl(`${HOSTED}/a.jpg`)).toBe(
      `${HOSTED}/a.jpg`,
    );
    expect(
      sanitizeHostedGalleryImageUrl(
        "http://project-ref.supabase.co/storage/v1/object/public/logos/x.png",
      ),
    ).toBe(
      "http://project-ref.supabase.co/storage/v1/object/public/logos/x.png",
    );
  });

  it("rejects a well-formed http(s) URL on a non-supabase.co host", () => {
    expect(
      sanitizeHostedGalleryImageUrl("https://cdn.example.com/a.jpg"),
    ).toBeNull();
  });

  it("rejects a supabase.co host missing the logos-bucket public marker", () => {
    // Right host, wrong path shape (a different bucket, or not a storage URL
    // at all) — the host alone is not sufficient.
    expect(
      sanitizeHostedGalleryImageUrl(
        "https://x.supabase.co/storage/v1/object/public/other-bucket/a.jpg",
      ),
    ).toBeNull();
    expect(
      sanitizeHostedGalleryImageUrl(
        "https://x.supabase.co/some/other/path.jpg",
      ),
    ).toBeNull();
  });

  it("rejects a host that merely CONTAINS supabase.co without being a subdomain of it", () => {
    // "notsupabase.co" does not end with ".supabase.co" (no dot boundary);
    // proves the suffix check is anchored, not a bare substring match.
    expect(
      sanitizeHostedGalleryImageUrl(
        "https://notsupabase.co/storage/v1/object/public/logos/a.jpg",
      ),
    ).toBeNull();
  });

  it("still rejects everything the base sanitizeImageUrl rejects (relative, mailto, data, javascript)", () => {
    for (const bad of [
      "cdn.inklee/x.jpg",
      "/uploads/x.jpg",
      "mailto:hi@artist.com",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "",
    ]) {
      expect(sanitizeHostedGalleryImageUrl(bad), bad).toBeNull();
    }
  });
});
