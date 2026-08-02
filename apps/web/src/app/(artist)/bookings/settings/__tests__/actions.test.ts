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
let readError: { message: string } | null = null;

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/server/slots", () => ({ fileNoSlotsWarning: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        // saveShopVisibilityAction (and its siblings in this file) now read
        // `slug` separately from `settings` — the latter goes through
        // updateProfileSettings, which uses `.maybeSingle()` (a genuinely
        // absent row is not an error, distinct from a real read failure).
        // Both selects hit the SAME mocked `existingRow` fixture regardless
        // of which columns were actually requested, since this mock (like
        // the original) does not model column projection.
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: existingRow, error: readError }),
            maybeSingle: () =>
              Promise.resolve({ data: existingRow, error: readError }),
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

import { saveShopVisibilityAction, toggleBooksOpenAction } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "artist1" } } });
  existingRow = { slug: "mika", settings: {} };
  updatePayload = null;
  updateFilters = {};
  updateError = null;
  readError = null;
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

  it("mechanism-wide sweep fix: refuses instead of writing when the settings read fails, never touching bio_page from a collapsed base", async () => {
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
    readError = { message: "connection reset" };

    const r = await saveShopVisibilityAction(false);

    expect(r).toEqual({
      error: "Could not read your current settings. Please try again.",
    });
    // The whole point of the fix: no write at all, not a write from `{}`.
    expect(updatePayload).toBeNull();
  });

  it("surfaces a database error instead of a false success", async () => {
    updateError = { message: "connection reset" };
    const r = await saveShopVisibilityAction(false);
    expect(r).toEqual({ error: "connection reset" });
  });
});

// Mechanism-wide sweep structural fix, integration-level pin (books_open is
// the natural example: parseBooksSettings(undefined) defaults it to `true`,
// so a failed read used to be able to silently REOPEN a closed artist's
// books as a side effect of toggling it CLOSED, since the collapsed `{}`
// base would resolve `books_open` to its default the moment ANOTHER save on
// this table hit a transient read blip). This suite proves sibling keys
// inside books_settings AND top-level settings keys outside it both survive
// a real toggle, and that a failed read now refuses instead of writing from
// a collapsed base.
describe("toggleBooksOpenAction", () => {
  it("preserves sibling books_settings keys (booking_cap, form_appearance) AND top-level settings keys (cover_color) when toggling books_open", async () => {
    existingRow = {
      slug: "mika",
      settings: {
        books_settings: {
          books_open: true,
          booking_cap: 5,
          booking_opens_at: null,
          booking_window_ends_at: null,
          books_closed_message: null,
          form_appearance: "light",
        },
        cover_color: "rosa",
      },
    };

    const r = await toggleBooksOpenAction(false);

    expect(r).toEqual({ success: true });
    const settings = updatePayload!.settings as Record<string, unknown>;
    // Sibling OUTSIDE books_settings entirely.
    expect(settings.cover_color).toBe("rosa");
    const books = settings.books_settings as Record<string, unknown>;
    expect(books.books_open).toBe(false);
    // Siblings INSIDE books_settings the toggle itself never touches.
    expect(books.booking_cap).toBe(5);
    expect(books.form_appearance).toBe("light");
  });

  it("mechanism-wide sweep fix: refuses instead of writing when the settings read fails — no write from a collapsed base that would default books_open back to true", async () => {
    existingRow = {
      slug: "mika",
      settings: {
        books_settings: { books_open: true, booking_cap: 5 },
      },
    };
    readError = { message: "connection reset" };

    const r = await toggleBooksOpenAction(false);

    expect(r).toEqual({
      error: "Could not read your current settings. Please try again.",
    });
    expect(updatePayload).toBeNull();
  });
});
