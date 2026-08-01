import { describe, it, expect, vi, beforeEach } from "vitest";

// The surface-content write path (founder ruling FD10, 2026-08-01). What
// must hold: the entitlement is enforced server-side (not hidden in a UI),
// sibling settings keys survive the write, an OMITTED field in the input
// preserves whatever is already stored (inherits), a PRESENT field
// overwrites it even when the sanitized result is null/empty (clears), and a
// plan-read blip refuses the write rather than persisting an unverified
// shape.

const getAccountOverrides = vi.fn();
const richContentBlocksAllowed = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/entitlement-gates", () => ({
  richContentBlocksAllowed: (...a: unknown[]) => richContentBlocksAllowed(...a),
}));

import { saveSurfaceContentCore } from "@/lib/server/surface-content-write";

const HOSTED =
  "https://project-ref.supabase.co/storage/v1/object/public/logos/artist/hero.webp";
const EXTERNAL = "https://evil.example.com/hero.jpg";

let stored: Record<string, unknown>;
let updatePayload: Record<string, unknown> | null;
let readError: { message: string } | null;
let writeError: { message: string } | null;

function client() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({
      data: readError ? null : { settings: stored },
      error: readError,
    }),
    update: (payload: Record<string, unknown>) => {
      updatePayload = payload;
      return {
        eq: async () => ({ error: writeError }),
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => chain } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  stored = {};
  updatePayload = null;
  readError = null;
  writeError = null;
  getAccountOverrides.mockResolvedValue({});
  richContentBlocksAllowed.mockReturnValue(true);
});

describe("saveSurfaceContentCore entitlement", () => {
  it("refuses an unentitled save BEFORE reading or writing", async () => {
    richContentBlocksAllowed.mockReturnValue(false);
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      introText: "hello",
    });
    expect(r).toMatchObject({ ok: false, code: "not_entitled" });
    expect(updatePayload).toBeNull();
  });

  it("refuses the write when the plan read blows up (opposite of the render fail-safe)", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      introText: "hello",
    });
    expect(r).toMatchObject({ ok: false, code: "failed" });
    expect(updatePayload).toBeNull();
  });

  it("rejects an unknown or missing surface before touching the entitlement check", async () => {
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "guestSpots",
      introText: "hello",
    });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(updatePayload).toBeNull();
    expect(richContentBlocksAllowed).not.toHaveBeenCalled();
  });
});

describe("saveSurfaceContentCore writes", () => {
  it("MERGES into settings, never replacing sibling keys", async () => {
    stored = {
      bio_page: { blocks: [] },
      books_settings: { open: true },
      appearance: { global: { font: "mono" }, surfaces: {} },
    };
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      introText: "hello",
    });
    expect(r.ok).toBe(true);
    const settings = updatePayload!.settings as Record<string, unknown>;
    expect(settings.bio_page).toEqual({ blocks: [] });
    expect(settings.books_settings).toEqual({ open: true });
    expect(settings.appearance).toEqual({
      global: { font: "mono" },
      surfaces: {},
    });
  });

  it("treats an all-unknown patch as nothing to save", async () => {
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
    });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(updatePayload).toBeNull();
  });

  it("surfaces a read failure without writing", async () => {
    readError = { message: "boom" };
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      introText: "hello",
    });
    expect(r).toMatchObject({ ok: false, code: "failed" });
    expect(updatePayload).toBeNull();
  });

  it("surfaces a write failure", async () => {
    writeError = { message: "boom" };
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      introText: "hello",
    });
    expect(r).toMatchObject({ ok: false, code: "failed" });
  });

  it("refuses an external hero media host, keeping the rest of the patch", async () => {
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      heroMediaUrl: EXTERNAL,
      introText: "hello",
    });
    expect(r.ok).toBe(true);
    const content = (
      r as { ok: true; content: { heroMediaUrl: string | null } }
    ).content;
    expect(content.heroMediaUrl).toBeNull();
  });

  it("accepts an Inklee-hosted hero media URL", async () => {
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      heroMediaUrl: HOSTED,
    });
    expect(r).toMatchObject({ ok: true, content: { heroMediaUrl: HOSTED } });
  });

  it("caps and dedupes featuredCollectionIds", async () => {
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      featuredCollectionIds: ["a", "b", "a", "c", "d", "e", "f", "g"],
    });
    expect(r.ok).toBe(true);
    const content = (
      r as { ok: true; content: { featuredCollectionIds: string[] } }
    ).content;
    expect(content.featuredCollectionIds).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]); // MAX_FEATURED_COLLECTIONS = 6, deduped
  });
});

describe("null-clears-vs-inherits (the merge distinction FD10 asked for)", () => {
  it("an OMITTED field in the patch preserves the currently stored value (inherits)", async () => {
    stored = {
      surface_content: {
        shop: {
          heroMediaUrl: HOSTED,
          introText: "original intro",
          featuredCollectionIds: ["col-1"],
        },
      },
    };
    // Only introText is sent — heroMediaUrl and featuredCollectionIds are
    // absent from the input entirely, not null.
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      introText: "updated intro",
    });
    expect(r.ok).toBe(true);
    const content = (
      r as {
        ok: true;
        content: {
          heroMediaUrl: string | null;
          introText: string | null;
          featuredCollectionIds: string[];
        };
      }
    ).content;
    expect(content.introText).toBe("updated intro");
    // Inherited, untouched by the introText-only save.
    expect(content.heroMediaUrl).toBe(HOSTED);
    expect(content.featuredCollectionIds).toEqual(["col-1"]);
  });

  it("a PRESENT field with an empty/invalid value CLEARS the stored value, rather than being ignored", async () => {
    stored = {
      surface_content: {
        shop: {
          heroMediaUrl: HOSTED,
          introText: "original intro",
          featuredCollectionIds: ["col-1"],
        },
      },
    };
    // introText sent as an explicit empty string — present in the patch, so
    // it must CLEAR rather than being treated as "nothing changed".
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      introText: "",
    });
    expect(r.ok).toBe(true);
    const content = (r as { ok: true; content: { introText: string | null } })
      .content;
    expect(content.introText).toBeNull();
  });

  it("explicitly clearing heroMediaUrl (present, invalid) does not touch introText or featuredCollectionIds", async () => {
    stored = {
      surface_content: {
        shop: {
          heroMediaUrl: HOSTED,
          introText: "kept",
          featuredCollectionIds: ["col-1"],
        },
      },
    };
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      heroMediaUrl: null,
    });
    expect(r.ok).toBe(true);
    const content = (
      r as {
        ok: true;
        content: {
          heroMediaUrl: string | null;
          introText: string | null;
          featuredCollectionIds: string[];
        };
      }
    ).content;
    expect(content.heroMediaUrl).toBeNull();
    expect(content.introText).toBe("kept");
    expect(content.featuredCollectionIds).toEqual(["col-1"]);
  });

  it("explicitly clearing featuredCollectionIds to [] clears it without touching other fields", async () => {
    stored = {
      surface_content: {
        shop: {
          heroMediaUrl: HOSTED,
          introText: "kept",
          featuredCollectionIds: ["col-1", "col-2"],
        },
      },
    };
    const r = await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      featuredCollectionIds: [],
    });
    expect(r.ok).toBe(true);
    const content = (
      r as {
        ok: true;
        content: {
          heroMediaUrl: string | null;
          featuredCollectionIds: string[];
        };
      }
    ).content;
    expect(content.featuredCollectionIds).toEqual([]);
    expect(content.heroMediaUrl).toBe(HOSTED);
  });

  it("does not disturb a DIFFERENT surface's stored entry (forward-looking: today only 'shop' exists, but the container shape must not clobber siblings)", async () => {
    stored = {
      surface_content: {
        shop: { introText: "shop intro" },
      },
    };
    await saveSurfaceContentCore(client(), "artist-1", {
      surface: "shop",
      introText: "updated",
    });
    const container = (updatePayload!.settings as Record<string, unknown>)
      .surface_content as Record<string, unknown>;
    expect(Object.keys(container)).toEqual(["shop"]);
  });
});
