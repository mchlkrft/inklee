import { describe, it, expect, vi, beforeEach } from "vitest";

// saveShopCheckoutEnabledAction (decision S2, Plus build C5): the writer for
// settings.features.shop_checkout. Round-trips through the real parseFeatures
// (not mocked), so goods_module / checkout_addons survive untouched.

const { getUser, revalidatePath } = vi.hoisted(() => ({
  getUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

let existingRow: { settings?: unknown } | null = null;
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

import { saveShopCheckoutEnabledAction } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "artist1" } } });
  existingRow = { settings: {} };
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
    existingRow = { settings: {} };
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
