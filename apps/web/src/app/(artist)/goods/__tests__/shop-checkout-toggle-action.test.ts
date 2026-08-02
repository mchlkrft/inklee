import { describe, it, expect, vi, beforeEach } from "vitest";

// saveShopCheckoutEnabledAction (decision S2, Plus build C5): the writer for
// settings.features.shop_checkout. Round-trips through the real parseFeatures
// (not mocked), so goods_module / checkout_addons survive untouched.

const { getUser, revalidatePath } = vi.hoisted(() => ({
  getUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

let existingRow: { settings?: unknown } | null = null;
let existingRowError: { message: string } | null = null;
let updatePayload: Record<string, unknown> | null = null;
let updateFilters: Record<string, unknown> = {};
let updateError: { message: string } | null = null;

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: existingRow, error: existingRowError }),
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

import { saveShopCheckoutEnabledAction } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "artist1" } } });
  existingRow = { settings: {} };
  existingRowError = null;
  updatePayload = null;
  updateFilters = {};
  updateError = null;
});

describe("saveShopCheckoutEnabledAction", () => {
  it("turns shop_checkout off while preserving the other feature flags", async () => {
    existingRow = {
      settings: { features: { goods_module: true, checkout_addons: false } },
    };
    const r = await saveShopCheckoutEnabledAction(false);
    expect(r).toEqual({ success: true });

    const features = (updatePayload!.settings as Record<string, unknown>)
      .features as Record<string, boolean>;
    expect(features).toEqual({
      goods_module: true,
      checkout_addons: false,
      shop_checkout: false,
    });
    expect(updateFilters.id).toBe("artist1");
  });

  it("turns shop_checkout on from a profile that never set any feature flags", async () => {
    // C1.1 counsel prerequisite: complete seller data, or the toggle refuses
    // to turn on regardless of the feature-flag round-trip under test here.
    existingRow = {
      settings: {},
      seller_trading_name: "Mika Ink Studio",
      seller_address: "12 Ink Street, Berlin, Germany",
      seller_contact: "mika@example.com",
    } as { settings?: unknown };
    const r = await saveShopCheckoutEnabledAction(true);
    expect(r).toEqual({ success: true });
    const features = (updatePayload!.settings as Record<string, unknown>)
      .features as Record<string, boolean>;
    // Defaults for the untouched keys, not just the one being set.
    expect(features).toEqual({
      goods_module: true,
      checkout_addons: true,
      shop_checkout: true,
    });
  });

  // C1.1 counsel prerequisite, the actual gate under test in this file: an
  // artist with no seller data cannot turn the toggle on, even though the
  // feature-flag round-trip itself would otherwise succeed.
  it("refuses to turn shop_checkout on when seller data is incomplete", async () => {
    existingRow = { settings: {} };
    const r = await saveShopCheckoutEnabledAction(true);
    expect(r).toEqual({
      error:
        "Add your seller name, address and contact before turning this on.",
    });
    expect(updatePayload).toBeNull();
  });

  // M3: a failed read must never fall through to the merge-and-write below.
  // Before the fix, the discarded error let `current` default to `{}` and
  // the write replaced the ENTIRE settings blob with just `features`,
  // destroying bio_page, booking settings and theme on any transient read
  // failure. `existingRow` here carries a rich settings blob precisely so a
  // regression can be seen concretely: if the guard were removed, this test
  // would start observing `updatePayload.settings` collapse to
  // `{ features: {...} }` with `bio_page` gone, not merely a different
  // return value.
  it("refuses the write and does not wipe settings when the profile read fails", async () => {
    existingRow = {
      settings: {
        bio_page: { blocks: [{ type: "text" }], socials: [] },
        features: { goods_module: true },
      },
    };
    existingRowError = { message: "connection reset" };

    const r = await saveShopCheckoutEnabledAction(false);

    expect(r).toEqual({
      error: "Could not load your account settings. Please try again.",
    });
    // The actual consequence under test: no write was ever sent, so the real
    // settings row (bio_page, other features) cannot have been clobbered.
    expect(updatePayload).toBeNull();
  });

  // Distinction control: a successful read (no error) with a rich existing
  // settings blob still merges correctly and leaves bio_page untouched. This
  // is what proves the guard above refuses ONLY on a genuine read failure,
  // not on every read that happens to return non-empty settings.
  it("preserves an existing settings blob (bio_page, other features) when the read succeeds", async () => {
    existingRow = {
      settings: {
        bio_page: { blocks: [{ type: "text" }], socials: [] },
        features: { goods_module: true },
      },
      seller_trading_name: "Mika Ink Studio",
      seller_address: "12 Ink Street, Berlin, Germany",
      seller_contact: "mika@example.com",
    } as { settings?: unknown };

    const r = await saveShopCheckoutEnabledAction(true);

    expect(r).toEqual({ success: true });
    const settings = updatePayload!.settings as Record<string, unknown>;
    expect(settings.bio_page).toEqual({
      blocks: [{ type: "text" }],
      socials: [],
    });
    expect(settings.features).toEqual({
      goods_module: true,
      checkout_addons: true,
      shop_checkout: true,
    });
  });

  it("requires authentication and never reaches the database", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await saveShopCheckoutEnabledAction(false);
    expect(r).toEqual({ error: "Not authenticated." });
    expect(updatePayload).toBeNull();
  });

  it("surfaces a database error instead of a false success", async () => {
    updateError = { message: "connection reset" };
    const r = await saveShopCheckoutEnabledAction(false);
    expect(r).toEqual({ error: "connection reset" });
  });
});
