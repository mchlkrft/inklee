import { describe, it, expect, vi, beforeEach } from "vitest";

// FD5 server actions: cart mutations, cart-to-checkout, wishlist mutations.
// The CORE logic (shop-cart.ts / shop-wishlist.ts / goods-checkout.ts) is
// unit-tested in its own files; this file is about the ACTION layer's own
// job — slug->artist resolution, the guest-cookie identity plumbing, and
// rate limiting — mirroring actions.test.ts's existing mocking style for
// `startShopCheckoutAction`.

const {
  mockProfile,
  mockCartLimit,
  mockCheckoutLimit,
  mockWishlistLimit,
  mockGetOrCreateHash,
  mockReadHash,
  mockAddProductToCart,
  mockAddBundleToCart,
  mockUpdateCartItemQuantity,
  mockRemoveCartItem,
  mockGetCartForDisplay,
  mockResolveCartSelections,
  mockCreateCore,
  mockAddToWishlist,
  mockRemoveFromWishlistByProduct,
  flags,
} = vi.hoisted(() => ({
  mockProfile: vi.fn(),
  mockCartLimit: vi.fn(),
  mockCheckoutLimit: vi.fn(),
  mockWishlistLimit: vi.fn(),
  mockGetOrCreateHash: vi.fn(),
  mockReadHash: vi.fn(),
  mockAddProductToCart: vi.fn(),
  mockAddBundleToCart: vi.fn(),
  mockUpdateCartItemQuantity: vi.fn(),
  mockRemoveCartItem: vi.fn(),
  mockGetCartForDisplay: vi.fn(),
  mockResolveCartSelections: vi.fn(),
  mockCreateCore: vi.fn(),
  mockAddToWishlist: vi.fn(),
  mockRemoveFromWishlistByProduct: vi.fn(),
  flags: { goodsCommerce: true },
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "203.0.113.9, 10.0.0.1" }),
}));
vi.mock("@/lib/features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/features")>();
  return { ...actual, isGoodsCommerceEnabled: () => flags.goodsCommerce };
});
vi.mock("@/lib/ratelimit", () => ({
  checkShopCheckoutRateLimit: (...a: unknown[]) => mockCheckoutLimit(...a),
  checkShopCartRateLimit: (...a: unknown[]) => mockCartLimit(...a),
  checkShopWishlistRateLimit: (...a: unknown[]) => mockWishlistLimit(...a),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    // Two distinct query shapes are used across these actions:
    //   resolveShopArtist:  profiles .eq(slug) .maybeSingle()        -> ONE eq
    //   startCartCheckoutAction's cart lookup:
    //                       shop_carts .eq(guest) .eq(artist) .maybeSingle()
    //                                                                -> TWO eq
    // Keyed by table so each resolves to the right fixture regardless of how
    // many `.eq()` calls the real code happens to chain.
    from: (table: string) => {
      const resolve = () =>
        table === "profiles"
          ? Promise.resolve(mockProfile())
          : Promise.resolve({ data: { id: "cart1" } });
      const eqChain = { eq: () => eqChain, maybeSingle: resolve };
      return { select: () => eqChain };
    },
  },
}));
vi.mock("@/lib/server/goods-checkout", () => ({
  createStandaloneGoodsCheckoutCore: (...a: unknown[]) => mockCreateCore(...a),
}));
vi.mock("@/lib/server/shop-guest-identity", () => ({
  getOrCreateGuestTokenHash: (...a: unknown[]) => mockGetOrCreateHash(...a),
  readGuestTokenHash: (...a: unknown[]) => mockReadHash(...a),
}));
vi.mock("@/lib/server/shop-cart", () => ({
  addProductToCart: (...a: unknown[]) => mockAddProductToCart(...a),
  addBundleToCart: (...a: unknown[]) => mockAddBundleToCart(...a),
  updateCartItemQuantity: (...a: unknown[]) => mockUpdateCartItemQuantity(...a),
  removeCartItem: (...a: unknown[]) => mockRemoveCartItem(...a),
  getCartForDisplay: (...a: unknown[]) => mockGetCartForDisplay(...a),
  resolveCartSelectionsForCheckout: (...a: unknown[]) =>
    mockResolveCartSelections(...a),
}));
vi.mock("@/lib/server/shop-wishlist", () => ({
  addToWishlist: (...a: unknown[]) => mockAddToWishlist(...a),
  removeFromWishlistByProduct: (...a: unknown[]) =>
    mockRemoveFromWishlistByProduct(...a),
}));

import {
  addToCartAction,
  addBundleToCartAction,
  updateCartItemQuantityAction,
  removeCartItemAction,
  startCartCheckoutAction,
  addToWishlistAction,
  removeFromWishlistByProductAction,
} from "../actions";

const CART_STATE = {
  cartId: "cart1",
  lines: [],
  totalMinor: 0,
  currency: "eur",
};

beforeEach(() => {
  vi.clearAllMocks();
  flags.goodsCommerce = true;
  mockProfile.mockReturnValue({
    data: {
      id: "a1",
      settings: { features: { goods_module: true, shop_checkout: true } },
    },
  });
  mockCartLimit.mockResolvedValue({ allowed: true });
  mockCheckoutLimit.mockResolvedValue({ allowed: true });
  mockWishlistLimit.mockResolvedValue({ allowed: true });
  mockGetOrCreateHash.mockResolvedValue("guest-hash-1");
  mockReadHash.mockResolvedValue("guest-hash-1");
  mockAddProductToCart.mockResolvedValue({ ok: true });
  mockAddBundleToCart.mockResolvedValue({ ok: true });
  mockUpdateCartItemQuantity.mockResolvedValue({ ok: true });
  mockRemoveCartItem.mockResolvedValue({ ok: true });
  mockGetCartForDisplay.mockResolvedValue(CART_STATE);
  mockResolveCartSelections.mockResolvedValue({
    ok: true,
    cartId: "cart1",
    artistId: "a1",
    selections: [{ productId: "p1", variantId: null, quantity: 1 }],
    bundles: [],
  });
  mockCreateCore.mockResolvedValue({
    ok: true,
    orderId: "o1",
    clientSecret: "secret_1",
    totalMinor: 3000,
    currency: "eur",
  });
  mockAddToWishlist.mockResolvedValue({ ok: true });
  mockRemoveFromWishlistByProduct.mockResolvedValue({ ok: true });
});

describe("addToCartAction", () => {
  it("resolves the slug, rate-limits per artist+IP, mints a guest identity, and returns the fresh cart", async () => {
    const r = await addToCartAction({
      slug: "mika",
      productId: "p1",
      variantId: null,
      quantity: 2,
    });
    expect(r).toEqual({ ok: true, cart: CART_STATE });
    expect(mockCartLimit).toHaveBeenCalledWith("203.0.113.9", "a1");
    expect(mockAddProductToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        guestTokenHash: "guest-hash-1",
        artistId: "a1",
        productId: "p1",
        quantity: 2,
      }),
    );
  });

  it("fails closed when the park switch is off, before touching the cart", async () => {
    flags.goodsCommerce = false;
    const r = await addToCartAction({
      slug: "mika",
      productId: "p1",
      variantId: null,
      quantity: 1,
    });
    expect(r.ok).toBe(false);
    expect(mockAddProductToCart).not.toHaveBeenCalled();
  });

  it("refuses an unknown shop slug without minting a guest identity", async () => {
    mockProfile.mockReturnValue({ data: null });
    const r = await addToCartAction({
      slug: "nobody",
      productId: "p1",
      variantId: null,
      quantity: 1,
    });
    expect(r).toEqual({ ok: false, error: "This shop could not be found." });
    expect(mockGetOrCreateHash).not.toHaveBeenCalled();
  });

  it("refuses when rate-limited, without reaching the cart core", async () => {
    mockCartLimit.mockResolvedValue({ allowed: false });
    const r = await addToCartAction({
      slug: "mika",
      productId: "p1",
      variantId: null,
      quantity: 1,
    });
    expect(r.ok).toBe(false);
    expect(mockAddProductToCart).not.toHaveBeenCalled();
  });

  it("surfaces the core's refusal (e.g. sold out) as the action's own error", async () => {
    mockAddProductToCart.mockResolvedValue({
      ok: false,
      error: "This item is no longer available.",
    });
    const r = await addToCartAction({
      slug: "mika",
      productId: "p1",
      variantId: null,
      quantity: 1,
    });
    expect(r).toEqual({
      ok: false,
      error: "This item is no longer available.",
    });
    expect(mockGetCartForDisplay).not.toHaveBeenCalled();
  });
});

describe("addBundleToCartAction", () => {
  it("wires through to addBundleToCart", async () => {
    const r = await addBundleToCartAction({
      slug: "mika",
      bundleId: "b1",
      quantity: 1,
    });
    expect(r).toEqual({ ok: true, cart: CART_STATE });
    expect(mockAddBundleToCart).toHaveBeenCalledWith(
      expect.objectContaining({ artistId: "a1", bundleId: "b1" }),
    );
  });
});

describe("updateCartItemQuantityAction / removeCartItemAction", () => {
  it("CART QUANTITY CHANGES: refuses without a guest cookie at all (nothing to own)", async () => {
    mockReadHash.mockResolvedValue(null);
    const r = await updateCartItemQuantityAction({
      slug: "mika",
      cartItemId: "item1",
      quantity: 2,
    });
    expect(r).toEqual({ ok: false, error: "That item isn't in your cart." });
    expect(mockUpdateCartItemQuantity).not.toHaveBeenCalled();
  });

  it("updates and returns the refreshed cart", async () => {
    const r = await updateCartItemQuantityAction({
      slug: "mika",
      cartItemId: "item1",
      quantity: 3,
    });
    expect(r).toEqual({ ok: true, cart: CART_STATE });
  });

  it("removeCartItemAction wires through to removeCartItem", async () => {
    const r = await removeCartItemAction({ slug: "mika", cartItemId: "item1" });
    expect(r).toEqual({ ok: true, cart: CART_STATE });
    expect(mockRemoveCartItem).toHaveBeenCalledWith(
      expect.objectContaining({
        guestTokenHash: "guest-hash-1",
        cartItemId: "item1",
      }),
    );
  });
});

describe("startCartCheckoutAction (cart-to-checkout transition)", () => {
  it("resolves the cart, resolves selections through the seller-boundary-checked resolver, and hands off to the SAME core 'Buy now' uses", async () => {
    const r = await startCartCheckoutAction({
      slug: "mika",
      email: "buyer@example.com",
    });
    expect(r).toEqual({
      ok: true,
      orderId: "o1",
      clientSecret: "secret_1",
      totalMinor: 3000,
      currency: "eur",
    });
    expect(mockResolveCartSelections).toHaveBeenCalledWith(
      "guest-hash-1",
      "cart1",
    );
    expect(mockCreateCore).toHaveBeenCalledWith(
      expect.objectContaining({
        artistId: "a1",
        cartId: "cart1",
        clientEmail: "buyer@example.com",
        selections: [{ productId: "p1", variantId: null, quantity: 1 }],
        bundles: [],
      }),
    );
  });

  it("refuses with 'Your cart is empty' when the buyer has no guest cookie", async () => {
    mockReadHash.mockResolvedValue(null);
    const r = await startCartCheckoutAction({
      slug: "mika",
      email: "buyer@example.com",
    });
    expect(r).toEqual({ ok: false, error: "Your cart is empty." });
    expect(mockCreateCore).not.toHaveBeenCalled();
  });

  it("SELLER BOUNDARY: a resolver refusal reaches the buyer verbatim and never calls the checkout core", async () => {
    mockResolveCartSelections.mockResolvedValue({
      ok: false,
      error: "Something is wrong with your cart. Please clear it and retry.",
    });
    const r = await startCartCheckoutAction({
      slug: "mika",
      email: "buyer@example.com",
    });
    expect(r).toEqual({
      ok: false,
      error: "Something is wrong with your cart. Please clear it and retry.",
    });
    expect(mockCreateCore).not.toHaveBeenCalled();
  });

  it("fails closed when the park switch is off, before any read", async () => {
    flags.goodsCommerce = false;
    const r = await startCartCheckoutAction({
      slug: "mika",
      email: "buyer@example.com",
    });
    expect(r.ok).toBe(false);
    expect(mockResolveCartSelections).not.toHaveBeenCalled();
  });
});

describe("addToWishlistAction / removeFromWishlistByProductAction", () => {
  it("ADD TO WISHLIST: rate-limits by IP and mints a guest identity", async () => {
    const r = await addToWishlistAction({
      slug: "mika",
      productId: "p1",
      variantId: null,
    });
    expect(r).toEqual({ ok: true });
    expect(mockWishlistLimit).toHaveBeenCalledWith("203.0.113.9");
    expect(mockAddToWishlist).toHaveBeenCalledWith(
      expect.objectContaining({ artistId: "a1", productId: "p1" }),
    );
  });

  it("REMOVE FROM WISHLIST is idempotent for a guest with no cookie yet", async () => {
    mockReadHash.mockResolvedValue(null);
    const r = await removeFromWishlistByProductAction({
      productId: "p1",
      variantId: null,
    });
    expect(r).toEqual({ ok: true });
    expect(mockRemoveFromWishlistByProduct).not.toHaveBeenCalled();
  });
});
