import { describe, it, expect, vi, beforeEach } from "vitest";

// saveShopVisibilityAction (decision S2, Plus build C5): the writer for
// `hidden: ["shop"]`, which was readable everywhere but had NO writer before
// this slice. Same round-trip shape as saveBookingPolicyAction: read the
// current bio_page, toggle only the "shop" key, write back through the real
// shared parser (not mocked — the parser's own preservation behaviour is
// exactly what this test pins).

const { getUser, revalidatePath } = vi.hoisted(() => ({
  getUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

let existingRow: { slug?: string; settings?: unknown } | null = null;
let updatePayload: Record<string, unknown> | null = null;
let updateFilters: Record<string, unknown> = {};
let updateError: { message: string } | null = null;

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/server/slots", () => ({ fileNoSlotsWarning: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: existingRow }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return {
            eq: (col: string, val: unknown) => {
              updateFilters[col] = val;
              return Promise.resolve({ error: updateError });
            },
          };
        },
      };
    },
  }),
}));

import { saveShopVisibilityAction } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "artist1" } } });
  existingRow = { slug: "mika", settings: {} };
  updatePayload = null;
  updateFilters = {};
  updateError = null;
});

describe("saveShopVisibilityAction", () => {
  it("hides the shop: adds 'shop' to hidden, preserving everything else in bio_page", async () => {
    existingRow = {
      slug: "mika",
      settings: {
        bio_page: {
          blocks: [],
          bookingPolicy: "Deposit required.",
          socials: [],
          hidden: ["policy"],
        },
        cover_color: "rosa",
      },
    };

    const r = await saveShopVisibilityAction(false);
    expect(r).toEqual({ success: true });

    const settings = updatePayload!.settings as Record<string, unknown>;
    // Other top-level settings keys survive untouched.
    expect(settings.cover_color).toBe("rosa");
    const bio = settings.bio_page as {
      hidden: string[];
      bookingPolicy: string;
    };
    // "policy" was already hidden and must still be — this fails if the write
    // clobbers `hidden` instead of merging into it.
    expect(bio.hidden.sort()).toEqual(["policy", "shop"]);
    expect(bio.bookingPolicy).toBe("Deposit required.");
    expect(updateFilters.id).toBe("artist1");
  });

  it("shows the shop: removes 'shop' from hidden, idempotent when already visible", async () => {
    existingRow = {
      slug: "mika",
      settings: {
        bio_page: {
          blocks: [],
          bookingPolicy: null,
          socials: [],
          hidden: ["shop"],
        },
      },
    };
    const r = await saveShopVisibilityAction(true);
    expect(r).toEqual({ success: true });
    const bio = (updatePayload!.settings as Record<string, unknown>)
      .bio_page as { hidden: string[] };
    expect(bio.hidden).toEqual([]);

    // Calling it again with nothing to remove must not error or re-add it.
    existingRow = {
      slug: "mika",
      settings: {
        bio_page: { blocks: [], bookingPolicy: null, socials: [], hidden: [] },
      },
    };
    const r2 = await saveShopVisibilityAction(true);
    expect(r2).toEqual({ success: true });
    const bio2 = (updatePayload!.settings as Record<string, unknown>)
      .bio_page as { hidden: string[] };
    expect(bio2.hidden).toEqual([]);
  });

  it("requires authentication and never reaches the database", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await saveShopVisibilityAction(false);
    expect(r).toEqual({ error: "Not authenticated." });
    expect(updatePayload).toBeNull();
  });

  it("surfaces a database error instead of a false success", async () => {
    updateError = { message: "connection reset" };
    const r = await saveShopVisibilityAction(false);
    expect(r).toEqual({ error: "connection reset" });
  });
});
