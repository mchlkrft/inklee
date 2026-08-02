import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// GOODS-DISC-001: getAddonProducts previously never selected `custom_made`
// from `products`, so `computeAddonLines`' `customMade` was silently `false`
// for every add-on line regardless of the artist's actual flag — the
// exemption claim could never fire on this checkout. Named failure mode:
// drop `custom_made` from the select string, or drop the
// `customMade: p.custom_made === true` mapping line, and the assertions
// below fail.

const { mockServiceClient } = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: mockServiceClient }));

import { getAddonProducts } from "@/lib/addon-products";

type Reply = { data: unknown; error?: unknown };

function fakeClient(replies: Record<string, Reply>) {
  return (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      single: () =>
        Promise.resolve(replies[table] ?? { data: null, error: null }),
      then: (
        onFulfilled?: (v: Reply) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) =>
        Promise.resolve(replies[table] ?? { data: null, error: null }).then(
          onFulfilled,
          onRejected,
        ),
    };
    return builder;
  };
}

const CHARGE_READY_ARTIST = {
  settings: {},
  stripe_account_status: "active",
  stripe_charges_enabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GOODS_COMMERCE_ENABLED", "true");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAddonProducts: custom_made pass-through (GOODS-DISC-001)", () => {
  it("maps customMade: true for a product flagged custom-made", async () => {
    mockServiceClient.from.mockImplementation(
      fakeClient({
        profiles: { data: CHARGE_READY_ARTIST },
        products: {
          data: [
            {
              id: "p1",
              title: "Portrait commission",
              image_url: null,
              price_amount: 40,
              currency: "eur",
              status: "active",
              is_checkout_addon: true,
              quantity: null,
              custom_made: true,
              product_variants: [],
            },
          ],
        },
      }),
    );

    const rows = await getAddonProducts("artist_1");
    expect(rows).toHaveLength(1);
    expect(rows[0].customMade).toBe(true);
  });

  it("maps customMade: false for an unflagged product", async () => {
    mockServiceClient.from.mockImplementation(
      fakeClient({
        profiles: { data: CHARGE_READY_ARTIST },
        products: {
          data: [
            {
              id: "p2",
              title: "Studio shirt",
              image_url: null,
              price_amount: 30,
              currency: "eur",
              status: "active",
              is_checkout_addon: true,
              quantity: null,
              custom_made: false,
              product_variants: [],
            },
          ],
        },
      }),
    );

    const rows = await getAddonProducts("artist_1");
    expect(rows[0].customMade).toBe(false);
  });

  it("defaults to customMade: false when the column is null (pre-C1.2 rows)", async () => {
    mockServiceClient.from.mockImplementation(
      fakeClient({
        profiles: { data: CHARGE_READY_ARTIST },
        products: {
          data: [
            {
              id: "p3",
              title: "A4 print",
              image_url: null,
              price_amount: 15,
              currency: "eur",
              status: "active",
              is_checkout_addon: true,
              quantity: 5,
              custom_made: null,
              product_variants: [],
            },
          ],
        },
      }),
    );

    const rows = await getAddonProducts("artist_1");
    expect(rows[0].customMade).toBe(false);
  });
});

describe("getAddonProducts drop gate (payable path)", () => {
  // 2026-08-02. available_from and preorder were selected and mapped by the
  // INTEREST read but not by this PAYABLE one, so computeAddonLines saw null
  // and productAvailability could never refuse an undropped product on the
  // appointment add-on checkout - while the SAME product was correctly refused
  // on the standalone shop. Same shape as SHOP-DROP-001 (bundles): a column
  // omitted from a SELECT makes a downstream gate silently pass, which no test
  // of the gate itself can catch.
  //
  // FAILS IF either column is dropped from the select string or from the
  // mapping: availableFrom comes back null and the drop time is lost.
  it("carries availableFrom and preorder through to the compositor", async () => {
    mockServiceClient.from.mockImplementation(
      fakeClient({
        profiles: { data: CHARGE_READY_ARTIST },
        products: {
          data: [
            {
              id: "p_drop",
              title: "Future drop",
              image_url: null,
              price_amount: 20,
              currency: "eur",
              status: "active",
              is_checkout_addon: true,
              quantity: 5,
              custom_made: false,
              available_from: "9999-01-01T00:00:00.000Z",
              preorder: false,
              product_variants: [],
            },
          ],
        },
      }),
    );

    const products = await getAddonProducts("artist_1");
    expect(products).toHaveLength(1);
    expect(products[0].availableFrom).toBe("9999-01-01T00:00:00.000Z");
    expect(products[0].preorder).toBe(false);
  });
});
