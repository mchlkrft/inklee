import { describe, it, expect } from "vitest";
import {
  sanitizeBioLinkUrl,
  parseBioPageSettings,
  visibleModules,
  isModuleVisible,
  countBlocksByType,
  canAddBlock,
  DEFAULT_BIO_PAGE,
  MAX_BOOKING_POLICY,
  MAX_HEADLINE,
  MAX_TEXT,
  MAX_BLOCKS_PER_TYPE,
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
    expect(countBlocksByType(blocks)).toEqual({
      headline: 2,
      text: 0,
      link: 1,
    });
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
