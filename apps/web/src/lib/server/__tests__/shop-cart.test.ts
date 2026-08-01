import { describe, it, expect, vi, beforeEach } from "vitest";

// FD5 seller-scoped carts (founder ruling, 2026-08-01). The catalog/bundle
// resolution is MOCKED here (fetchSellableCatalogRows / resolveBundleLines
// are goods-checkout.ts's own exports, already unit-tested there against the
// real compositor) — this file is about the CART's own logic: dedupe,
// quantity caps, ownership, and the display resolver's live re-check.

const {
  mockServiceClient,
  mockIsGoodsCommerceEnabled,
  mockFetchSellableCatalogRows,
  mockResolveBundleLines,
  flags,
} = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
  mockIsGoodsCommerceEnabled: vi.fn(),
  mockFetchSellableCatalogRows: vi.fn(),
  mockResolveBundleLines: vi.fn(),
  flags: { goodsCommerce: true },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: mockServiceClient }));
vi.mock("@/lib/features", () => ({
  isGoodsCommerceEnabled: () => mockIsGoodsCommerceEnabled(),
}));
vi.mock("@/lib/server/goods-checkout", () => ({
  fetchSellableCatalogRows: (...a: unknown[]) =>
    mockFetchSellableCatalogRows(...a),
  resolveBundleLines: (...a: unknown[]) => mockResolveBundleLines(...a),
}));

import {
  addProductToCart,
  addBundleToCart,
  updateCartItemQuantity,
  removeCartItem,
  getCartForDisplay,
  resolveCartSelectionsForCheckout,
} from "@/lib/server/shop-cart";

// ---------------------------------------------------------------------------
// Recording Supabase double, same shape as goods-checkout.test.ts's own
// (queue-based replies keyed by "table:verb", chain call recording).

type Reply = { data?: unknown; error?: unknown };
type QueuedReplies = Record<string, Reply[]>;
let replies: QueuedReplies = {};
function queue(key: string, ...rs: Reply[]) {
  replies[key] = [...(replies[key] ?? []), ...rs];
}
function nextReply(key: string): Reply {
  const q = replies[key];
  if (q && q.length > 0) return q.shift() as Reply;
  return { data: null, error: null };
}

type RecordedOp = {
  table: string;
  verb: string;
  payload: unknown;
  filters: Record<string, unknown>;
  isFilters: Record<string, unknown>;
  inFilters: Record<string, unknown>;
};
let ops: RecordedOp[] = [];

function newOp(table: string, verb: string, payload: unknown): RecordedOp {
  const op: RecordedOp = {
    table,
    verb,
    payload,
    filters: {},
    isFilters: {},
    inFilters: {},
  };
  ops.push(op);
  return op;
}

function makeChain(op: RecordedOp) {
  const key = `${op.table}:${op.verb}`;
  const chain = {
    eq: (column: string, value: unknown) => {
      op.filters[column] = value;
      return chain;
    },
    is: (column: string, value: unknown) => {
      op.isFilters[column] = value;
      return chain;
    },
    in: (column: string, values: unknown) => {
      op.inFilters[column] = values;
      return chain;
    },
    order: () => chain,
    select: () => chain,
    single: () => Promise.resolve(nextReply(key)),
    maybeSingle: () => Promise.resolve(nextReply(key)),
    then: (onF?: (v: Reply) => unknown, onR?: (r: unknown) => unknown) =>
      Promise.resolve(nextReply(key)).then(onF, onR),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  replies = {};
  flags.goodsCommerce = true;
  mockIsGoodsCommerceEnabled.mockImplementation(() => flags.goodsCommerce);
  mockServiceClient.from.mockImplementation((table: string) => ({
    select: () => makeChain(newOp(table, "select", null)),
    insert: (payload: unknown) => makeChain(newOp(table, "insert", payload)),
    update: (payload: unknown) => makeChain(newOp(table, "update", payload)),
    delete: () => makeChain(newOp(table, "delete", null)),
  }));
});

function opsFor(table: string, verb: string): RecordedOp[] {
  return ops.filter((o) => o.table === table && o.verb === verb);
}

const PRODUCT_NO_VARIANT = {
  id: "p1",
  title: "Print",
  price_amount: 30,
  currency: "eur",
  status: "active",
  quantity: 10,
  available_from: null,
  preorder: false,
  product_variants: [],
};

const PRODUCT_WITH_VARIANT = {
  id: "p2",
  title: "Tee",
  price_amount: 25,
  currency: "eur",
  status: "active",
  quantity: null,
  available_from: null,
  preorder: false,
  product_variants: [
    {
      id: "v1",
      name: "Medium",
      price_amount_override: null,
      stock_quantity: 3,
      status: "active",
      sort_order: 0,
    },
  ],
};

describe("addProductToCart", () => {
  it("ADD TO CART: inserts a new line when none exists yet", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([PRODUCT_NO_VARIANT]);
    queue("shop_carts:select", { data: { id: "cart1" } }); // findOrCreateCart
    queue("shop_cart_items:select", { data: null }); // no existing line

    const result = await addProductToCart({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p1",
      variantId: null,
      quantity: 2,
    });

    expect(result).toEqual({ ok: true });
    const insert = opsFor("shop_cart_items", "insert");
    expect(insert).toHaveLength(1);
    expect(insert[0].payload).toMatchObject({
      cart_id: "cart1",
      artist_id: "artist1",
      kind: "product",
      product_id: "p1",
      variant_id: null,
      quantity: 2,
    });
  });

  it("CART QUANTITY CHANGES via re-add: increments an existing line rather than duplicating it", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([PRODUCT_NO_VARIANT]);
    queue("shop_carts:select", { data: { id: "cart1" } });
    queue("shop_cart_items:select", { data: { id: "item1", quantity: 2 } });

    const result = await addProductToCart({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p1",
      variantId: null,
      quantity: 3,
    });

    expect(result).toEqual({ ok: true });
    const update = opsFor("shop_cart_items", "update");
    expect(update).toHaveLength(1);
    expect(update[0].payload).toMatchObject({ quantity: 5 });
    expect(update[0].filters).toMatchObject({ id: "item1" });
  });

  it("VARIANT SELECTION: requires a variant when the product has active ones", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([PRODUCT_WITH_VARIANT]);
    const result = await addProductToCart({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p2",
      variantId: null,
      quantity: 1,
    });
    expect(result).toEqual({ ok: false, error: "Choose an option first." });
  });

  it("VARIANT SELECTION: refuses an unknown variant id for the product", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([PRODUCT_WITH_VARIANT]);
    const result = await addProductToCart({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p2",
      variantId: "not-a-real-variant",
      quantity: 1,
    });
    expect(result).toEqual({
      ok: false,
      error: "That option isn't available right now.",
    });
  });

  it("INVENTORY CHANGES: refuses a quantity above tracked stock", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([PRODUCT_WITH_VARIANT]);
    queue("shop_carts:select", { data: { id: "cart1" } });
    queue("shop_cart_items:select", { data: null });
    const result = await addProductToCart({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p2",
      variantId: "v1",
      quantity: 5, // stock is 3
    });
    expect(result).toEqual({ ok: false, error: "Only 3 left." });
  });

  it("UNAVAILABLE OR ARCHIVED PRODUCTS: refuses a product missing from the sellable catalog", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([]); // archived/hidden/deleted
    const result = await addProductToCart({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p1",
      variantId: null,
      quantity: 1,
    });
    expect(result).toEqual({
      ok: false,
      error: "This item is no longer available.",
    });
  });

  it("caps a single add at MAX_ADDON_QUANTITY", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([PRODUCT_NO_VARIANT]);
    const result = await addProductToCart({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p1",
      variantId: null,
      quantity: 11,
    });
    expect(result.ok).toBe(false);
  });

  it("fails closed when the park switch is off", async () => {
    flags.goodsCommerce = false;
    const result = await addProductToCart({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p1",
      variantId: null,
      quantity: 1,
    });
    expect(result.ok).toBe(false);
    expect(mockFetchSellableCatalogRows).not.toHaveBeenCalled();
  });
});

describe("addBundleToCart", () => {
  it("ADD TO CART (bundle): inserts through resolveBundleLines' verdict", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([]);
    mockResolveBundleLines.mockResolvedValue({
      ok: true,
      lines: [{ bundleId: "b1", unitAmount: 40, totalMinor: 4000 }],
    });
    queue("shop_carts:select", { data: { id: "cart1" } });
    queue("shop_cart_items:select", { data: null });

    const result = await addBundleToCart({
      guestTokenHash: "hash1",
      artistId: "artist1",
      bundleId: "b1",
      quantity: 1,
    });
    expect(result).toEqual({ ok: true });
    const insert = opsFor("shop_cart_items", "insert");
    expect(insert[0].payload).toMatchObject({
      kind: "bundle",
      bundle_id: "b1",
      quantity: 1,
    });
  });

  it("refuses a bundle resolveBundleLines rejects (reuses the SAME verdict as checkout)", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([]);
    mockResolveBundleLines.mockResolvedValue({
      ok: false,
      error: "Not enough stock for that bundle.",
    });
    const result = await addBundleToCart({
      guestTokenHash: "hash1",
      artistId: "artist1",
      bundleId: "b1",
      quantity: 1,
    });
    expect(result).toEqual({
      ok: false,
      error: "Not enough stock for that bundle.",
    });
  });
});

describe("updateCartItemQuantity / removeCartItem", () => {
  it("CART QUANTITY CHANGES: updates quantity for an owned item", async () => {
    queue("shop_cart_items:select", {
      data: { id: "item1", cart_id: "cart1", quantity: 2 },
    });
    queue("shop_carts:select", { data: { id: "cart1" } }); // ownership check

    const result = await updateCartItemQuantity({
      guestTokenHash: "hash1",
      cartItemId: "item1",
      quantity: 4,
    });
    expect(result).toEqual({ ok: true });
    const update = opsFor("shop_cart_items", "update");
    expect(update[0].payload).toMatchObject({ quantity: 4 });
  });

  it("CART QUANTITY CHANGES: quantity 0 removes the line", async () => {
    queue("shop_cart_items:select", {
      data: { id: "item1", cart_id: "cart1", quantity: 2 },
    });
    queue("shop_carts:select", { data: { id: "cart1" } });

    const result = await updateCartItemQuantity({
      guestTokenHash: "hash1",
      cartItemId: "item1",
      quantity: 0,
    });
    expect(result).toEqual({ ok: true });
    expect(opsFor("shop_cart_items", "delete")).toHaveLength(1);
  });

  it("SELLER/GUEST BOUNDARY: refuses a mutation on an item belonging to a DIFFERENT guest's cart", async () => {
    queue("shop_cart_items:select", {
      data: { id: "item1", cart_id: "cart1", quantity: 2 },
    });
    // The cart lookup filters on THIS caller's guest_token_hash; a mismatch
    // resolves to no row (RLS/service-layer ownership check, not a DB RLS
    // policy — carts have none, per 0141 — but the SAME refusal shape).
    queue("shop_carts:select", { data: null });

    const result = await updateCartItemQuantity({
      guestTokenHash: "someone-elses-hash",
      cartItemId: "item1",
      quantity: 1,
    });
    expect(result).toEqual({
      ok: false,
      error: "That item isn't in your cart.",
    });
    expect(opsFor("shop_cart_items", "update")).toHaveLength(0);
  });

  it("removeCartItem refuses ownership mismatch the same way", async () => {
    queue("shop_cart_items:select", {
      data: { id: "item1", cart_id: "cart1", quantity: 2 },
    });
    queue("shop_carts:select", { data: null });
    const result = await removeCartItem({
      guestTokenHash: "someone-elses-hash",
      cartItemId: "item1",
    });
    expect(result).toEqual({
      ok: false,
      error: "That item isn't in your cart.",
    });
    expect(opsFor("shop_cart_items", "delete")).toHaveLength(0);
  });
});

describe("getCartForDisplay", () => {
  it("returns an empty cart when the guest has none for this artist", async () => {
    queue("shop_carts:select", { data: null });
    const result = await getCartForDisplay("hash1", "artist1");
    expect(result).toEqual({
      cartId: null,
      lines: [],
      totalMinor: 0,
      currency: "eur",
    });
  });

  it("CART TOTALS + STALE-PRICE HANDLING: totals reflect the CURRENT product price, not any cached value", async () => {
    queue("shop_carts:select", { data: { id: "cart1" } });
    queue("shop_cart_items:select", {
      data: [
        {
          id: "item1",
          kind: "product",
          product_id: "p1",
          variant_id: null,
          quantity: 2,
        },
      ],
    });
    // The raw (unfiltered) read: price has moved from 30 (at add-time,
    // never actually stored) to 45 now.
    queue("products:select", {
      data: [
        {
          id: "p1",
          title: "Print",
          price_amount: 45,
          currency: "eur",
          product_variants: [],
        },
      ],
    });
    mockFetchSellableCatalogRows.mockResolvedValue([
      { ...PRODUCT_NO_VARIANT, price_amount: 45 },
    ]);

    const result = await getCartForDisplay("hash1", "artist1");
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      unitAmount: 45,
      quantity: 2,
      lineTotal: 90,
      available: true,
    });
    expect(result.totalMinor).toBe(9000);
  });

  it("UNAVAILABLE OR ARCHIVED PRODUCTS: flags a line whose product fell out of the sellable catalog", async () => {
    queue("shop_carts:select", { data: { id: "cart1" } });
    queue("shop_cart_items:select", {
      data: [
        {
          id: "item1",
          kind: "product",
          product_id: "p1",
          variant_id: null,
          quantity: 1,
        },
      ],
    });
    queue("products:select", {
      data: [
        {
          id: "p1",
          title: "Print",
          price_amount: 30,
          currency: "eur",
          product_variants: [],
        },
      ],
    });
    // Archived/hidden: absent from the SELLABLE catalog even though the raw
    // product row still exists (so the title can still be shown).
    mockFetchSellableCatalogRows.mockResolvedValue([]);

    const result = await getCartForDisplay("hash1", "artist1");
    expect(result.lines[0]).toMatchObject({
      available: false,
      unavailableReason: "This item is no longer available.",
      title: "Print",
    });
    expect(result.totalMinor).toBe(0); // unavailable lines never count toward the total
  });

  it("INVENTORY CHANGES: flags insufficient stock for the requested quantity", async () => {
    queue("shop_carts:select", { data: { id: "cart1" } });
    queue("shop_cart_items:select", {
      data: [
        {
          id: "item1",
          kind: "product",
          product_id: "p2",
          variant_id: "v1",
          quantity: 5,
        },
      ],
    });
    queue("products:select", { data: [{ ...PRODUCT_WITH_VARIANT }] });
    mockFetchSellableCatalogRows.mockResolvedValue([PRODUCT_WITH_VARIANT]); // stock 3

    const result = await getCartForDisplay("hash1", "artist1");
    expect(result.lines[0]).toMatchObject({
      available: false,
      unavailableReason: "Only 3 left.",
    });
  });
});

describe("resolveCartSelectionsForCheckout", () => {
  it("maps cart rows into AddonSelection/BundleSelection for the SAME compositor 'Buy now' uses", async () => {
    queue("shop_carts:select", { data: { id: "cart1", artist_id: "artist1" } });
    queue("shop_cart_items:select", {
      data: [
        {
          kind: "product",
          product_id: "p1",
          variant_id: null,
          quantity: 2,
          artist_id: "artist1",
        },
        {
          kind: "bundle",
          product_id: null,
          variant_id: null,
          bundle_id: "b1",
          quantity: 1,
          artist_id: "artist1",
        },
      ],
    });

    const result = await resolveCartSelectionsForCheckout("hash1", "cart1");
    expect(result).toEqual({
      ok: true,
      cartId: "cart1",
      artistId: "artist1",
      selections: [{ productId: "p1", variantId: null, quantity: 2 }],
      bundles: [{ bundleId: "b1", quantity: 1 }],
    });
  });

  it("returns 'not found' for a cart that does not belong to this guest", async () => {
    queue("shop_carts:select", { data: null });
    const result = await resolveCartSelectionsForCheckout(
      "wrong-hash",
      "cart1",
    );
    expect(result).toEqual({
      ok: false,
      error: "This cart could not be found.",
    });
  });

  it("SELLER BOUNDARY: refuses the ENTIRE checkout if any item's artist_id disagrees with the cart's own — never a partial cart", async () => {
    queue("shop_carts:select", { data: { id: "cart1", artist_id: "artist1" } });
    // This should be schema-impossible (0141's composite FKs); the assertion
    // here is defense-in-depth, proven as a hard refusal of the WHOLE
    // checkout, not a silent drop of the offending line.
    queue("shop_cart_items:select", {
      data: [
        {
          kind: "product",
          product_id: "p1",
          variant_id: null,
          quantity: 1,
          artist_id: "artist1",
        },
        {
          kind: "product",
          product_id: "p9",
          variant_id: null,
          quantity: 1,
          artist_id: "some-other-artist",
        },
      ],
    });

    const result = await resolveCartSelectionsForCheckout("hash1", "cart1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/wrong with your cart/i);
    }
  });
});
