import { describe, it, expect, vi, beforeEach } from "vitest";

// FD5 wishlist (founder ruling, 2026-08-01): cross-artist by design, and
// "move to cart" must land in the CORRECT seller cart, derived from the
// wishlist row itself (never a client-supplied artistId).

const {
  mockServiceClient,
  mockIsGoodsCommerceEnabled,
  mockFetchSellableCatalogRows,
  mockAddProductToCart,
  flags,
} = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
  mockIsGoodsCommerceEnabled: vi.fn(),
  mockFetchSellableCatalogRows: vi.fn(),
  mockAddProductToCart: vi.fn(),
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
}));
vi.mock("@/lib/server/shop-cart", () => ({
  addProductToCart: (...a: unknown[]) => mockAddProductToCart(...a),
}));

import {
  addToWishlist,
  removeFromWishlist,
  removeFromWishlistByProduct,
  listWishlist,
  moveWishlistItemToCart,
  WISHLIST_PRODUCT_SELECT,
} from "@/lib/server/shop-wishlist";

type Reply = { data?: unknown; error?: unknown };
let replies: Record<string, Reply[]> = {};
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
    eq: (c: string, v: unknown) => {
      op.filters[c] = v;
      return chain;
    },
    is: (c: string, v: unknown) => {
      op.isFilters[c] = v;
      return chain;
    },
    in: (c: string, v: unknown) => {
      op.inFilters[c] = v;
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
    delete: () => makeChain(newOp(table, "delete", null)),
  }));
});

function opsFor(table: string, verb: string): RecordedOp[] {
  return ops.filter((o) => o.table === table && o.verb === verb);
}

const PRODUCT = {
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

describe("addToWishlist", () => {
  it("ADD TO WISHLIST: inserts a new entry", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([PRODUCT]);
    queue("shop_wishlist_items:select", { data: null }); // no existing entry

    const result = await addToWishlist({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p1",
      variantId: null,
    });
    expect(result).toEqual({ ok: true });
    const insert = opsFor("shop_wishlist_items", "insert");
    expect(insert).toHaveLength(1);
    expect(insert[0].payload).toMatchObject({
      guest_token_hash: "hash1",
      artist_id: "artist1",
      product_id: "p1",
      variant_id: null,
    });
  });

  it("ADD TO WISHLIST is idempotent: a duplicate add does not insert twice", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([PRODUCT]);
    queue("shop_wishlist_items:select", { data: { id: "existing1" } });

    const result = await addToWishlist({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p1",
      variantId: null,
    });
    expect(result).toEqual({ ok: true });
    expect(opsFor("shop_wishlist_items", "insert")).toHaveLength(0);
  });

  it("UNAVAILABLE OR ARCHIVED PRODUCTS: refuses a product missing from the sellable catalog", async () => {
    mockFetchSellableCatalogRows.mockResolvedValue([]);
    const result = await addToWishlist({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p1",
      variantId: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "This item is no longer available.",
    });
  });

  it("fails closed when the park switch is off", async () => {
    flags.goodsCommerce = false;
    const result = await addToWishlist({
      guestTokenHash: "hash1",
      artistId: "artist1",
      productId: "p1",
      variantId: null,
    });
    expect(result.ok).toBe(false);
    expect(mockFetchSellableCatalogRows).not.toHaveBeenCalled();
  });
});

describe("REMOVE FROM WISHLIST", () => {
  it("removes an owned entry by id", async () => {
    queue("shop_wishlist_items:delete", { data: [{ id: "w1" }] });
    const result = await removeFromWishlist({
      guestTokenHash: "hash1",
      wishlistItemId: "w1",
    });
    expect(result).toEqual({ ok: true });
  });

  it("refuses removal of an item that isn't this guest's (ownership filter matched nothing)", async () => {
    queue("shop_wishlist_items:delete", { data: [] });
    const result = await removeFromWishlist({
      guestTokenHash: "someone-elses-hash",
      wishlistItemId: "w1",
    });
    expect(result).toEqual({
      ok: false,
      error: "That item isn't on your wishlist.",
    });
  });

  it("removeFromWishlistByProduct removes by product+variant key", async () => {
    queue("shop_wishlist_items:delete", { data: [] });
    const result = await removeFromWishlistByProduct({
      guestTokenHash: "hash1",
      productId: "p1",
      variantId: null,
    });
    expect(result).toEqual({ ok: true });
    expect(opsFor("shop_wishlist_items", "delete")).toHaveLength(1);
  });
});

describe("listWishlist", () => {
  it("groups items across DIFFERENT artists (wishlist MAY span artists)", async () => {
    queue("shop_wishlist_items:select", {
      data: [
        { id: "w1", artist_id: "a1", product_id: "p1", variant_id: null },
        { id: "w2", artist_id: "a2", product_id: "p2", variant_id: null },
      ],
    });
    queue("profiles:select", {
      data: [
        { id: "a1", display_name: "Artist One", slug: "artist-one" },
        { id: "a2", display_name: "Artist Two", slug: "artist-two" },
      ],
    });
    queue("products:select", {
      data: [
        {
          id: "p1",
          artist_id: "a1",
          title: "Print",
          price_amount: 30,
          currency: "eur",
          product_variants: [],
        },
        {
          id: "p2",
          artist_id: "a2",
          title: "Sticker",
          price_amount: 5,
          currency: "eur",
          product_variants: [],
        },
      ],
    });
    mockFetchSellableCatalogRows.mockImplementation(async (artistId: string) =>
      artistId === "a1"
        ? [{ ...PRODUCT, id: "p1" }]
        : [{ ...PRODUCT, id: "p2" }],
    );

    const result = await listWishlist("hash1");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.artistId).sort()).toEqual(["a1", "a2"]);
    expect(result.every((r) => r.available)).toBe(true);
  });

  it("returns an empty list for a guest with nothing wishlisted", async () => {
    queue("shop_wishlist_items:select", { data: [] });
    const result = await listWishlist("hash1");
    expect(result).toEqual([]);
  });

  // Counsel Q5. The wishlist is the fourth browse surface to carry the
  // custom-made marker, and the failure mode is silent: drop custom_made from
  // the select and the field arrives undefined, customMadeRowSuffix(false)
  // returns "", and the row renders clean for a non-returnable item. Nothing
  // crashes and tsc is happy, so it needs a test rather than a comment.
  it("carries custom_made through to the display item", async () => {
    queue("shop_wishlist_items:select", {
      data: [{ id: "w1", artist_id: "a1", product_id: "p1", variant_id: null }],
    });
    queue("profiles:select", {
      data: [{ id: "a1", display_name: "Artist One", slug: "artist-one" }],
    });
    queue("products:select", {
      data: [
        {
          id: "p1",
          artist_id: "a1",
          title: "Commissioned piece",
          price_amount: 30,
          currency: "eur",
          custom_made: true,
          product_variants: [],
        },
      ],
    });
    mockFetchSellableCatalogRows.mockResolvedValue([{ ...PRODUCT, id: "p1" }]);

    const [item] = await listWishlist("hash1");
    expect(item.customMade).toBe(true);
  });

  // THE QUERY, which the two tests around it cannot see. Every test in this
  // file supplies the products row itself, so they verify the MAPPING and stay
  // green even if custom_made were dropped from the select entirely. That is
  // the exact regression worth catching, so the column list is asserted by
  // name against the real constant the query uses.
  it("the SELECT actually asks for custom_made (mocks cannot catch this)", () => {
    expect(WISHLIST_PRODUCT_SELECT).toContain("custom_made");
    // Distinction control: pin the pre-existing columns too, so this cannot
    // pass against a select string gutted down to the one column it checks.
    for (const col of [
      "id",
      "artist_id",
      "title",
      "price_amount",
      "currency",
    ]) {
      expect(WISHLIST_PRODUCT_SELECT).toContain(col);
    }
    // Top level, not nested inside product_variants(...), where PostgREST
    // would return it per variant and leave the top-level field undefined.
    expect(WISHLIST_PRODUCT_SELECT.indexOf("custom_made")).toBeLessThan(
      WISHLIST_PRODUCT_SELECT.indexOf("product_variants("),
    );
  });

  // DISTINCTION. Without this, a mapping hard-coded to `true` would pass the
  // test above, and every wishlist row would claim to be non-returnable.
  // A null column must read as false, never as undefined.
  it("DISTINCTION: a returnable product reports customMade false, not undefined", async () => {
    queue("shop_wishlist_items:select", {
      data: [{ id: "w1", artist_id: "a1", product_id: "p1", variant_id: null }],
    });
    queue("profiles:select", {
      data: [{ id: "a1", display_name: "Artist One", slug: "artist-one" }],
    });
    queue("products:select", {
      data: [
        {
          id: "p1",
          artist_id: "a1",
          title: "Print",
          price_amount: 30,
          currency: "eur",
          custom_made: null,
          product_variants: [],
        },
      ],
    });
    mockFetchSellableCatalogRows.mockResolvedValue([{ ...PRODUCT, id: "p1" }]);

    const [item] = await listWishlist("hash1");
    expect(item.customMade).toBe(false);
  });
});

describe("moveWishlistItemToCart", () => {
  it("MOVE TO CART: derives the artist from the WISHLIST ROW, not any caller input, and lands in that artist's cart", async () => {
    queue("shop_wishlist_items:select", {
      data: {
        id: "w1",
        artist_id: "artist-owns-this",
        product_id: "p1",
        variant_id: null,
      },
    });
    queue("profiles:select", { data: { slug: "the-owner" } });
    mockAddProductToCart.mockResolvedValue({ ok: true });
    queue("shop_wishlist_items:delete", { data: [] });

    const result = await moveWishlistItemToCart({
      guestTokenHash: "hash1",
      wishlistItemId: "w1",
      quantity: 1,
    });

    expect(result).toEqual({ ok: true, artistSlug: "the-owner" });
    expect(mockAddProductToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        artistId: "artist-owns-this",
        productId: "p1",
      }),
    );
    // Removed from the wishlist only after landing in the cart.
    expect(opsFor("shop_wishlist_items", "delete")).toHaveLength(1);
  });

  it("SELLER BOUNDARY (wishlist side): a refused move (e.g. sold out) leaves the wishlist entry in place", async () => {
    queue("shop_wishlist_items:select", {
      data: {
        id: "w1",
        artist_id: "artist1",
        product_id: "p1",
        variant_id: null,
      },
    });
    queue("profiles:select", { data: { slug: "shop-slug" } });
    mockAddProductToCart.mockResolvedValue({
      ok: false,
      error: "This item is no longer available.",
    });

    const result = await moveWishlistItemToCart({
      guestTokenHash: "hash1",
      wishlistItemId: "w1",
      quantity: 1,
    });
    expect(result).toEqual({
      ok: false,
      error: "This item is no longer available.",
    });
    expect(opsFor("shop_wishlist_items", "delete")).toHaveLength(0);
  });

  it("refuses a move for a wishlist item that isn't this guest's", async () => {
    queue("shop_wishlist_items:select", { data: null });
    const result = await moveWishlistItemToCart({
      guestTokenHash: "someone-elses-hash",
      wishlistItemId: "w1",
      quantity: 1,
    });
    expect(result).toEqual({
      ok: false,
      error: "That item isn't on your wishlist.",
    });
    expect(mockAddProductToCart).not.toHaveBeenCalled();
  });
});
