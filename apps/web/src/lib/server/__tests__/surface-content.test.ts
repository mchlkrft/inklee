import { describe, it, expect, vi, beforeEach } from "vitest";

// The server surface-content resolver's entitlement boundary (founder ruling
// FD10, 2026-08-01). What must hold: a plan-read blip fails SAFE to the
// default (empty) content rather than 500ing a public page, and a downgrade
// PRESERVES the stored configuration (only render hides it, D2's gallery
// posture) so a later re-upgrade sees it again.

const getAccountOverrides = vi.fn();
const richContentBlocksAllowed = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/entitlement-gates", () => ({
  richContentBlocksAllowed: (...a: unknown[]) => richContentBlocksAllowed(...a),
}));

import { resolvedSurfaceContent } from "@/lib/server/surface-content";

const HOSTED =
  "https://project-ref.supabase.co/storage/v1/object/public/logos/artist/hero.webp";

const CONFIGURED = {
  surface_content: {
    shop: {
      heroMediaUrl: HOSTED,
      introText: "Fresh drops every Friday.",
      featuredCollectionIds: ["col-1", "col-2"],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getAccountOverrides.mockResolvedValue({});
});

describe("resolvedSurfaceContent entitlement boundary", () => {
  it("entitled: the full stored content resolves", async () => {
    richContentBlocksAllowed.mockReturnValue(true);
    const content = await resolvedSurfaceContent(
      "artist-1",
      CONFIGURED,
      "shop",
    );
    expect(content).toEqual({
      heroMediaUrl: HOSTED,
      introText: "Fresh drops every Friday.",
      featuredCollectionIds: ["col-1", "col-2"],
    });
  });

  it("NOT entitled: renders the all-default (empty) content, never a partial view", async () => {
    richContentBlocksAllowed.mockReturnValue(false);
    const content = await resolvedSurfaceContent(
      "artist-1",
      CONFIGURED,
      "shop",
    );
    expect(content).toEqual({
      heroMediaUrl: null,
      introText: null,
      featuredCollectionIds: [],
    });
  });

  it("a plan-read failure fails SAFE to the default view (never throws)", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    await expect(
      resolvedSurfaceContent("artist-1", CONFIGURED, "shop"),
    ).resolves.toEqual({
      heroMediaUrl: null,
      introText: null,
      featuredCollectionIds: [],
    });
  });

  it("an unconfigured artist resolves to the default on either tier", async () => {
    for (const entitled of [true, false]) {
      richContentBlocksAllowed.mockReturnValue(entitled);
      const content = await resolvedSurfaceContent("artist-1", {}, "shop");
      expect(content).toEqual({
        heroMediaUrl: null,
        introText: null,
        featuredCollectionIds: [],
      });
    }
  });

  it("null/undefined settings never throw", async () => {
    richContentBlocksAllowed.mockReturnValue(true);
    await expect(
      resolvedSurfaceContent("artist-1", null, "shop"),
    ).resolves.toEqual({
      heroMediaUrl: null,
      introText: null,
      featuredCollectionIds: [],
    });
    await expect(
      resolvedSurfaceContent("artist-1", undefined, "shop"),
    ).resolves.toEqual({
      heroMediaUrl: null,
      introText: null,
      featuredCollectionIds: [],
    });
  });
});

describe("downgrade preserves stored content, hides Plus additions", () => {
  it("a downgrade-then-reupgrade round trip sees the SAME stored content again", async () => {
    richContentBlocksAllowed.mockReturnValue(false);
    const hidden = await resolvedSurfaceContent("artist-1", CONFIGURED, "shop");
    expect(hidden.introText).toBeNull();

    richContentBlocksAllowed.mockReturnValue(true);
    const restored = await resolvedSurfaceContent(
      "artist-1",
      CONFIGURED,
      "shop",
    );
    // The SAME settings object passed both times: nothing was mutated or
    // deleted while unentitled, so the re-upgrade sees the full record back.
    expect(restored.introText).toBe("Fresh drops every Friday.");
    expect(restored.featuredCollectionIds).toEqual(["col-1", "col-2"]);
    expect(restored.heroMediaUrl).toBe(HOSTED);
  });
});
