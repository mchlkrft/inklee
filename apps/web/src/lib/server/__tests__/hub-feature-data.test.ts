import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";

// loadHubFeatureData (Plus build P2b, extended by C5's decisions S3/S4).
// canUseGoods / isModuleVisible / parseBioPageSettings are pure and used for
// REAL here — the thing under test is how loadHubFeatureData COMBINES them,
// not their own logic (already covered by features.test.ts and
// bio-page-settings.test.ts). Only the IO (serviceClient, the collections
// helper) is mocked.

const { mockCollections } = vi.hoisted(() => ({
  mockCollections: vi.fn(),
}));

vi.mock("server-only", () => ({}));

// The standalone_shop destination is bounded by the platform park switch
// (supervisor fix on the FD8 slice: "available" must mean a visitor can land
// on it, and the standalone route 404s while the switch is off). These tests
// exercise the artist-facing conditions, so the switch is turned ON for the
// suite and restored after; the OFF case is pinned in goods-visibility.test.ts
// and goods-visibility-summary.test.ts.
const REAL_GOODS_FLAG = process.env.GOODS_COMMERCE_ENABLED;
beforeAll(() => {
  process.env.GOODS_COMMERCE_ENABLED = "true";
});
afterAll(() => {
  if (REAL_GOODS_FLAG === undefined) delete process.env.GOODS_COMMERCE_ENABLED;
  else process.env.GOODS_COMMERCE_ENABLED = REAL_GOODS_FLAG;
});
vi.mock("../collections", () => ({
  publicCollectionsForArtist: (...a: unknown[]) => mockCollections(...a),
}));

type Reply = { data?: unknown; error?: unknown };
let repliesByTable: Record<string, Reply> = {};
let calls: { table: string; filters: Record<string, unknown> }[] = [];

function makeChain(table: string) {
  const rec = { table, filters: {} as Record<string, unknown> };
  calls.push(rec);
  const chain = {
    eq: (col: string, val: unknown) => {
      rec.filters[col] = val;
      return chain;
    },
    in: (col: string, val: unknown) => {
      rec.filters[`in:${col}`] = val;
      return chain;
    },
    gte: (col: string, val: unknown) => {
      rec.filters[`gte:${col}`] = val;
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    then: (onF?: (v: Reply) => unknown, onR?: (r: unknown) => unknown) =>
      Promise.resolve(repliesByTable[table] ?? { data: [] }).then(onF, onR),
  };
  return chain;
}

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => ({ select: () => makeChain(table) }),
  },
}));

import { loadHubFeatureData } from "../hub-feature-data";

beforeEach(() => {
  vi.clearAllMocks();
  repliesByTable = {};
  calls = [];
  mockCollections.mockResolvedValue({ collections: [], memberships: [] });
});

const BASE_INPUT = {
  artistId: "a1",
  bookingUrl: "https://inkl.ee/mika",
  standaloneShopUrl: "https://inkl.ee/mika/shop/checkout",
  timezone: "Europe/Berlin",
};

describe("loadHubFeatureData: goods block destination gate (founder ruling FD8, 2026-08-01, SUPERSEDES S4)", () => {
  it("does not query products when the SELECTED destination is booking_page and the shop teaser is hidden", async () => {
    const result = await loadHubFeatureData({
      ...BASE_INPUT,
      settings: {
        features: { goods_module: true },
        bio_page: { hidden: ["shop"] },
      },
      blocks: [{ id: "g1", type: "goods", destination: "booking_page" }],
    });
    expect(result.productCount).toBe(0);
    expect(result.productThumbs).toEqual([]);
    expect(result.goods).toEqual({ visible: false, href: null });
    // Fails if the FD8/S4 gate is deleted: the goods block would query
    // products (canUseGoods alone is true) even though the surface it
    // deep-links to is hidden, offering a broken link on the Hub.
    expect(calls.find((c) => c.table === "products")).toBeUndefined();
  });

  it("does not query products when destination is booking_page and the goods module itself is off, shop visibility aside", async () => {
    const result = await loadHubFeatureData({
      ...BASE_INPUT,
      settings: { features: { goods_module: false } },
      blocks: [{ id: "g1", type: "goods", destination: "booking_page" }],
    });
    expect(result.productCount).toBe(0);
    expect(result.goods).toEqual({ visible: false, href: null });
    expect(calls.find((c) => c.table === "products")).toBeUndefined();
  });

  it("queries products and links to bookingUrl when destination is booking_page, the module is on, and the teaser is visible", async () => {
    repliesByTable["products"] = {
      data: [{ image_url: "https://x/1.webp", image_urls: null }],
    };
    const result = await loadHubFeatureData({
      ...BASE_INPUT,
      settings: { features: { goods_module: true } }, // hidden absent = visible
      blocks: [{ id: "g1", type: "goods", destination: "booking_page" }],
    });
    expect(result.productCount).toBe(1);
    const productsCall = calls.find((c) => c.table === "products");
    expect(productsCall).toBeDefined();
    expect(productsCall!.filters.is_public_visible).toBe(true);
    expect(result.goods).toEqual({
      visible: true,
      href: BASE_INPUT.bookingUrl,
    });
  });

  it("does not query products when destination is standalone_shop and the artist's shop_checkout toggle is off", async () => {
    const result = await loadHubFeatureData({
      ...BASE_INPUT,
      settings: { features: { shop_checkout: false } },
      blocks: [{ id: "g1", type: "goods", destination: "standalone_shop" }],
    });
    expect(result.productCount).toBe(0);
    expect(result.goods).toEqual({ visible: false, href: null });
    expect(calls.find((c) => c.table === "products")).toBeUndefined();
  });

  it("queries products and links to standaloneShopUrl when destination is standalone_shop and the toggle is on, even with the booking-page teaser hidden", async () => {
    repliesByTable["products"] = {
      data: [{ image_url: "https://x/1.webp", image_urls: null }],
    };
    const result = await loadHubFeatureData({
      ...BASE_INPUT,
      // Booking-page teaser hidden AND goods module irrelevant to this
      // destination — proves the two destinations are independent (FD7's
      // non-cascading model), not just that standalone_shop CAN work.
      settings: { bio_page: { hidden: ["shop"] } },
      blocks: [{ id: "g1", type: "goods", destination: "standalone_shop" }],
    });
    expect(result.productCount).toBe(1);
    expect(calls.find((c) => c.table === "products")).toBeDefined();
    expect(result.goods).toEqual({
      visible: true,
      href: BASE_INPUT.standaloneShopUrl,
    });
  });

  it("is hidden (visible: false) when the destination is available but the artist has no products at all", async () => {
    repliesByTable["products"] = { data: [] };
    const result = await loadHubFeatureData({
      ...BASE_INPUT,
      settings: {},
      blocks: [{ id: "g1", type: "goods", destination: "standalone_shop" }],
    });
    expect(result.productCount).toBe(0);
    expect(result.goods.visible).toBe(false);
  });

  it("never re-routes to the other destination's URL when the selected one is unavailable", async () => {
    const result = await loadHubFeatureData({
      ...BASE_INPUT,
      settings: {
        features: { shop_checkout: false }, // standalone_shop unavailable
      },
      blocks: [{ id: "g1", type: "goods", destination: "standalone_shop" }],
    });
    expect(result.goods.href).toBeNull();
    expect(result.goods.href).not.toBe(BASE_INPUT.bookingUrl);
  });
});

describe("loadHubFeatureData: guest_spots trip filter (decision S3)", () => {
  it("reads is_public_visible, not show_on_booking_form", async () => {
    repliesByTable["trips"] = { data: [] };
    await loadHubFeatureData({
      ...BASE_INPUT,
      settings: {},
      blocks: [{ id: "gs1", type: "guest_spots" }],
    });
    const tripsCall = calls.find((c) => c.table === "trips");
    expect(tripsCall).toBeDefined();
    // Exact presence/absence, not a superset check: fails if the column name
    // reverts to show_on_booking_form (the pre-0137 coupling this replaces).
    expect(tripsCall!.filters.is_public_visible).toBe(true);
    expect(tripsCall!.filters.show_on_booking_form).toBeUndefined();
  });

  it("counts only trips with is_public_visible true (via the query filter the mock records)", async () => {
    repliesByTable["trips"] = {
      data: [
        {
          title: "Berlin spring",
          trip_legs: [{ studios: { city: "Berlin", country: "Germany" } }],
        },
      ],
    };
    const result = await loadHubFeatureData({
      ...BASE_INPUT,
      settings: {},
      blocks: [{ id: "gs1", type: "guest_spots" }],
    });
    expect(result.tripCount).toBe(1);
    expect(result.nextTripLabel).toBe("Berlin, Germany");
  });
});
