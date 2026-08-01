import { describe, it, expect } from "vitest";
import {
  parseSurfaceContentSettings,
  resolveSurfaceContent,
  parseFeaturedCollectionIds,
  DEFAULT_SURFACE_CONTENT,
  MAX_INTRO_TEXT,
  MAX_FEATURED_COLLECTIONS,
  isSurfaceContentSurface,
  SURFACE_CONTENT_SURFACES,
  type SurfaceContentSettings,
} from "@inklee/shared/surface-content";

const HOSTED =
  "https://project-ref.supabase.co/storage/v1/object/public/logos/artist/hero.webp";
const EXTERNAL = "https://evil.example.com/hero.jpg";

describe("isSurfaceContentSurface", () => {
  it("accepts the shop surface", () => {
    expect(isSurfaceContentSurface("shop")).toBe(true);
  });

  it("rejects every other appearance surface (FD10 scope: no renderer yet)", () => {
    expect(isSurfaceContentSurface("hub")).toBe(false);
    expect(isSurfaceContentSurface("bookingForm")).toBe(false);
    expect(isSurfaceContentSurface("largeProject")).toBe(false);
    expect(isSurfaceContentSurface("guestSpots")).toBe(false);
  });

  it("rejects garbage", () => {
    expect(isSurfaceContentSurface(null)).toBe(false);
    expect(isSurfaceContentSurface(42)).toBe(false);
    expect(isSurfaceContentSurface(undefined)).toBe(false);
  });
});

describe("SURFACE_CONTENT_SURFACES", () => {
  it("is exactly ['shop'] (pins the deliberate scope, not an accident of iteration order)", () => {
    expect(SURFACE_CONTENT_SURFACES).toEqual(["shop"]);
  });
});

describe("parseSurfaceContentSettings — round trip", () => {
  it("parses a fully populated shop entry", () => {
    const raw = {
      shop: {
        heroMediaUrl: HOSTED,
        introText: "  Fresh prints every month.  ",
        featuredCollectionIds: ["col-1", "col-2"],
      },
    };
    const parsed = parseSurfaceContentSettings(raw);
    expect(parsed.shop).toEqual({
      heroMediaUrl: HOSTED,
      introText: "Fresh prints every month.",
      featuredCollectionIds: ["col-1", "col-2"],
    });
  });

  it("returns an empty object for null/undefined/non-object input", () => {
    expect(parseSurfaceContentSettings(null)).toEqual({});
    expect(parseSurfaceContentSettings(undefined)).toEqual({});
    expect(parseSurfaceContentSettings("nonsense")).toEqual({});
    expect(parseSurfaceContentSettings(42)).toEqual({});
  });

  it("omits a surface whose entry parses to every field empty (no on-disk distinction between 'never configured' and 'configured empty')", () => {
    const parsed = parseSurfaceContentSettings({
      shop: { heroMediaUrl: null, introText: "", featuredCollectionIds: [] },
    });
    expect(parsed.shop).toBeUndefined();
  });

  it("drops an unrecognised surface key rather than throwing", () => {
    const parsed = parseSurfaceContentSettings({
      guestSpots: { introText: "Should never appear — no renderer" },
      hub: { introText: "Hub has its own content system" },
    } as unknown);
    expect(parsed).toEqual({});
  });
});

describe("parseSurfaceContentSettings — hostile input", () => {
  it("never throws on arrays, functions, symbols, or deeply malformed shapes", () => {
    expect(() => parseSurfaceContentSettings([1, 2, 3])).not.toThrow();
    expect(() =>
      parseSurfaceContentSettings({ shop: "not an object" }),
    ).not.toThrow();
    expect(() => parseSurfaceContentSettings({ shop: 42 })).not.toThrow();
    expect(() => parseSurfaceContentSettings({ shop: null })).not.toThrow();
    expect(() => parseSurfaceContentSettings({ shop: [] })).not.toThrow();
  });

  it("a non-object shop entry parses to the all-default (omitted) shape", () => {
    expect(parseSurfaceContentSettings({ shop: "garbage" })).toEqual({});
    expect(parseSurfaceContentSettings({ shop: 42 })).toEqual({});
  });

  it("drops a non-string introText rather than coercing it", () => {
    const parsed = parseSurfaceContentSettings({
      shop: { introText: 12345, featuredCollectionIds: ["x"] },
    });
    expect(parsed.shop?.introText).toBeNull();
  });

  it("caps introText length rather than rejecting the whole entry", () => {
    const long = "a".repeat(MAX_INTRO_TEXT + 50);
    const parsed = parseSurfaceContentSettings({ shop: { introText: long } });
    expect(parsed.shop?.introText).toHaveLength(MAX_INTRO_TEXT);
  });

  it("an all-whitespace introText normalises to null, not an empty string", () => {
    const parsed = parseSurfaceContentSettings({
      shop: { introText: "   ", featuredCollectionIds: ["x"] },
    });
    expect(parsed.shop?.introText).toBeNull();
  });

  it("drops non-string entries from featuredCollectionIds without failing the array", () => {
    const parsed = parseSurfaceContentSettings({
      shop: { featuredCollectionIds: ["col-1", 42, null, {}, "col-2"] },
    });
    expect(parsed.shop?.featuredCollectionIds).toEqual(["col-1", "col-2"]);
  });

  it("a non-array featuredCollectionIds parses to an empty list", () => {
    expect(parseFeaturedCollectionIds("col-1")).toEqual([]);
    expect(parseFeaturedCollectionIds({ id: "col-1" })).toEqual([]);
    expect(parseFeaturedCollectionIds(null)).toEqual([]);
  });
});

describe("parseFeaturedCollectionIds — dedupe and cap", () => {
  it("dedupes, keeping first occurrence order", () => {
    expect(
      parseFeaturedCollectionIds(["col-1", "col-2", "col-1", "col-3"]),
    ).toEqual(["col-1", "col-2", "col-3"]);
  });

  it("caps at MAX_FEATURED_COLLECTIONS", () => {
    const many = Array.from(
      { length: MAX_FEATURED_COLLECTIONS + 5 },
      (_, i) => `col-${i}`,
    );
    const parsed = parseFeaturedCollectionIds(many);
    expect(parsed).toHaveLength(MAX_FEATURED_COLLECTIONS);
    expect(parsed).toEqual(many.slice(0, MAX_FEATURED_COLLECTIONS));
  });

  it("trims whitespace and drops blank entries", () => {
    expect(parseFeaturedCollectionIds([" col-1 ", "", "   ", "col-2"])).toEqual(
      ["col-1", "col-2"],
    );
  });
});

describe("hero media URL restriction (FD4 posture reused)", () => {
  it("accepts an Inklee-hosted logos-bucket URL", () => {
    const parsed = parseSurfaceContentSettings({
      shop: { heroMediaUrl: HOSTED },
    });
    expect(parsed.shop?.heroMediaUrl).toBe(HOSTED);
  });

  it("refuses an external host — never renders from an arbitrary third-party URL", () => {
    const parsed = parseSurfaceContentSettings({
      shop: { heroMediaUrl: EXTERNAL, introText: "kept" },
    });
    expect(parsed.shop?.heroMediaUrl).toBeNull();
    // The rest of the entry survives — one bad field doesn't drop the block.
    expect(parsed.shop?.introText).toBe("kept");
  });

  it("refuses a supabase.co host outside the logos bucket's public path", () => {
    // heroMediaUrl is the only field set, and it's rejected, so the whole
    // entry parses to all-default and is omitted (not stored as an explicit
    // null) — same rule the javascript:/data: cases below pin.
    const parsed = parseSurfaceContentSettings({
      shop: {
        heroMediaUrl:
          "https://project-ref.supabase.co/storage/v1/object/public/other-bucket/x.webp",
        introText: "kept",
      },
    });
    expect(parsed.shop?.heroMediaUrl).toBeNull();
    expect(parsed.shop?.introText).toBe("kept");
  });

  it("refuses javascript: and data: schemes", () => {
    expect(
      parseSurfaceContentSettings({
        shop: { heroMediaUrl: "javascript:alert(1)" },
      }).shop,
    ).toBeUndefined();
    expect(
      parseSurfaceContentSettings({
        shop: { heroMediaUrl: "data:image/png;base64,AAAA" },
      }).shop,
    ).toBeUndefined();
  });
});

describe("resolveSurfaceContent", () => {
  it("returns the stored entry when present", () => {
    const settings: SurfaceContentSettings = {
      shop: {
        heroMediaUrl: HOSTED,
        introText: "hello",
        featuredCollectionIds: ["col-1"],
      },
    };
    expect(resolveSurfaceContent(settings, "shop")).toEqual(settings.shop);
  });

  it("returns DEFAULT_SURFACE_CONTENT when nothing is stored for the surface", () => {
    expect(resolveSurfaceContent({}, "shop")).toEqual(DEFAULT_SURFACE_CONTENT);
  });

  it("does not mutate DEFAULT_SURFACE_CONTENT across calls (fresh object each time)", () => {
    const a = resolveSurfaceContent({}, "shop");
    a.featuredCollectionIds.push("mutated");
    const b = resolveSurfaceContent({}, "shop");
    expect(b.featuredCollectionIds).toEqual([]);
  });
});
