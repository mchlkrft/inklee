import { describe, it, expect } from "vitest";

import {
  studioSlugify,
  studioSlugCandidates,
  isValidStudioSlug,
  studioPageIndexability,
  studioPageRenderable,
  STUDIO_SLUG_MAX_LENGTH,
} from "@inklee/shared/studio-page";
import { RESERVED_SLUGS } from "@inklee/shared/slug";
import { localBusinessSchema, breadcrumbListSchema } from "@/lib/jsonld";

/**
 * Go-live plan S2b gates (founder decision D1: claimed studio entity pages in
 * v1). The eight-condition indexability gate comes from the ratified SEO
 * strategy; these tests are what stops an unclaimed, unpublished, stale or
 * incomplete studio from ever minting an indexable page, and what stops the
 * JSON-LD from carrying anything the strategy forbids.
 */

const PASSING = {
  claimStatus: "claimed",
  moderationStatus: "approved",
  possiblyClosed: false,
  hasOpenDuplicate: false,
  publicationStatus: "published",
  publishReady: true,
  hasDescription: true,
  hasPlace: true,
  publicSurfaceReady: true,
};

describe("studioPageIndexability (the eight-condition gate)", () => {
  it("passes only when every condition holds", () => {
    const result = studioPageIndexability(PASSING);
    expect(result.indexable).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it.each([
    ["not_claimed", { claimStatus: "unclaimed" }],
    ["not_claimed", { claimStatus: "claim_pending" }],
    ["not_published", { publicationStatus: "draft" }],
    ["not_published", { publicationStatus: "suspended" }],
    ["not_approved", { moderationStatus: "pending" }],
    ["not_approved", { moderationStatus: "hidden" }],
    ["not_approved", { moderationStatus: "removed" }],
    ["possibly_closed", { possiblyClosed: true }],
    ["open_duplicate", { hasOpenDuplicate: true }],
    ["publish_gate_incomplete", { publishReady: false }],
    ["no_description", { hasDescription: false }],
    ["no_place", { hasPlace: false }],
    ["public_surface_dark", { publicSurfaceReady: false }],
  ])("blocks with %s", (blocker, override) => {
    const result = studioPageIndexability({ ...PASSING, ...override });
    expect(result.indexable).toBe(false);
    expect(result.blockers).toContain(blocker);
  });

  it("is dark by construction while the public surface is off", () => {
    // Every other condition passing must still not produce an indexable page
    // before the flip.
    expect(
      studioPageIndexability({ ...PASSING, publicSurfaceReady: false })
        .indexable,
    ).toBe(false);
  });
});

describe("studioPageRenderable (404 vs thin page)", () => {
  it("renders only for claimed + published + approved", () => {
    expect(
      studioPageRenderable({
        claimStatus: "claimed",
        moderationStatus: "approved",
        publicationStatus: "published",
      }),
    ).toBe(true);
  });

  it("refuses anything unclaimed, unpublished, or unapproved", () => {
    expect(
      studioPageRenderable({
        claimStatus: "unclaimed",
        moderationStatus: "approved",
        publicationStatus: "published",
      }),
    ).toBe(false);
    expect(
      studioPageRenderable({
        claimStatus: "claimed",
        moderationStatus: "approved",
        publicationStatus: "draft",
      }),
    ).toBe(false);
    expect(
      studioPageRenderable({
        claimStatus: "claimed",
        moderationStatus: "hidden",
        publicationStatus: "published",
      }),
    ).toBe(false);
  });

  it("is stricter than indexability: a renderable page can still be noindex", () => {
    const stale = { ...PASSING, possiblyClosed: true };
    expect(studioPageIndexability(stale).indexable).toBe(false);
    expect(
      studioPageRenderable({
        claimStatus: stale.claimStatus,
        moderationStatus: stale.moderationStatus,
        publicationStatus: stale.publicationStatus,
      }),
    ).toBe(true);
  });
});

describe("studio slug minting", () => {
  it("kebab-cases names, folding accents and sharp s", () => {
    expect(studioSlugify("Black Needle")).toBe("black-needle");
    expect(studioSlugify("Café Noir")).toBe("cafe-noir");
    expect(studioSlugify("Größe Tattoo")).toBe("grosse-tattoo");
    expect(studioSlugify("  Ink   &   Steel  ")).toBe("ink-steel");
  });

  it("keeps the format rule that a slug starts with a letter", () => {
    expect(studioSlugify("13 Needles")).toBe("studio-13-needles");
  });

  it("returns null when nothing usable survives", () => {
    expect(studioSlugify("!!!")).toBeNull();
    expect(studioSlugify("")).toBeNull();
    expect(studioSlugify("刺青")).toBeNull();
  });

  it("never mints a reserved or malformed slug", () => {
    expect(isValidStudioSlug("studios")).toBe(false);
    expect(isValidStudioSlug("map")).toBe(false);
    expect(isValidStudioSlug("admin")).toBe(false);
    expect(isValidStudioSlug("-leading")).toBe(false);
    expect(isValidStudioSlug("double--dash")).toBe(false);
    expect(isValidStudioSlug("a")).toBe(false);
    expect(isValidStudioSlug("a".repeat(STUDIO_SLUG_MAX_LENGTH + 1))).toBe(
      false,
    );
    expect(isValidStudioSlug("black-needle")).toBe(true);
  });

  it("offers city then numeric disambiguators, all valid", () => {
    const candidates = studioSlugCandidates("Black Needle", "Berlin");
    expect(candidates[0]).toBe("black-needle");
    expect(candidates[1]).toBe("black-needle-berlin");
    expect(candidates[2]).toBe("black-needle-2");
    for (const c of candidates) expect(isValidStudioSlug(c)).toBe(true);
  });

  it("drops candidates that collide with the reserved list", () => {
    // A studio literally called "Map" must not take /studios/map.
    const candidates = studioSlugCandidates("Map", "Berlin");
    expect(candidates).not.toContain("map");
    expect(candidates.every((c) => !RESERVED_SLUGS.has(c))).toBe(true);
  });

  it("produces no candidates for an unusable name (caller falls back)", () => {
    expect(studioSlugCandidates("!!!", null)).toEqual([]);
  });
});

describe("studio JSON-LD constraints", () => {
  const base = {
    name: "Black Needle",
    url: "https://inklee.app/studios/black-needle",
    description: "A private studio in Berlin.",
    city: "Berlin",
    country: "DE",
    streetAddress: null,
    geo: null,
    images: [] as string[],
    sameAs: [] as string[],
  };

  it("never emits ratings, reviews, or opening hours", () => {
    const schema = localBusinessSchema({
      ...base,
      streetAddress: "Somestrasse 1",
      geo: { lat: 52.52, lng: 13.405 },
      images: ["https://inklee.app/api/studio-media/s1/a.webp"],
      sameAs: ["https://example.com"],
    });
    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain("aggregateRating");
    expect(serialized).not.toContain("review");
    expect(serialized).not.toContain("openingHours");
    expect(serialized).not.toContain("priceRange");
  });

  it("omits geo entirely when the caller withholds it (approximate studios)", () => {
    const schema = localBusinessSchema(base);
    expect(schema.geo).toBeUndefined();
    expect(JSON.stringify(schema)).not.toContain("GeoCoordinates");
  });

  it("omits an address block when there is nothing public to put in it", () => {
    const schema = localBusinessSchema({
      ...base,
      city: null,
      country: null,
    });
    expect(schema.address).toBeUndefined();
  });

  it("marks the entity as a tattoo parlor with its canonical url", () => {
    const schema = localBusinessSchema(base);
    expect(schema["@type"]).toBe("TattooParlor");
    expect(schema.url).toBe(base.url);
  });

  it("builds an ordered breadcrumb from the map to the studio", () => {
    const schema = breadcrumbListSchema([
      { name: "Tattoo map", url: "https://inklee.app/map" },
      { name: "Black Needle", url: base.url },
    ]);
    const items = schema.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0].position).toBe(1);
    expect(items[1].position).toBe(2);
    expect(items[1].item).toBe(base.url);
  });
});
