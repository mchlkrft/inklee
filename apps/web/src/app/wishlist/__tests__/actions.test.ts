import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockReadHash,
  mockRemoveFromWishlist,
  mockMoveWishlistItemToCart,
  mockListWishlist,
  mockWishlistLimit,
} = vi.hoisted(() => ({
  mockReadHash: vi.fn(),
  mockRemoveFromWishlist: vi.fn(),
  mockMoveWishlistItemToCart: vi.fn(),
  mockListWishlist: vi.fn(),
  mockWishlistLimit: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "203.0.113.9" }),
}));
vi.mock("@/lib/ratelimit", () => ({
  checkShopWishlistRateLimit: (...a: unknown[]) => mockWishlistLimit(...a),
}));
vi.mock("@/lib/server/shop-guest-identity", () => ({
  readGuestTokenHash: (...a: unknown[]) => mockReadHash(...a),
}));
vi.mock("@/lib/server/shop-wishlist", () => ({
  removeFromWishlist: (...a: unknown[]) => mockRemoveFromWishlist(...a),
  moveWishlistItemToCart: (...a: unknown[]) => mockMoveWishlistItemToCart(...a),
  listWishlist: (...a: unknown[]) => mockListWishlist(...a),
}));

import {
  removeFromWishlistAction,
  moveWishlistItemToCartAction,
} from "../actions";

const WISHLIST_AFTER = [{ wishlistItemId: "w2" }];

beforeEach(() => {
  vi.clearAllMocks();
  mockReadHash.mockResolvedValue("guest-hash-1");
  mockWishlistLimit.mockResolvedValue({ allowed: true });
  mockRemoveFromWishlist.mockResolvedValue({ ok: true });
  mockMoveWishlistItemToCart.mockResolvedValue({
    ok: true,
    artistSlug: "mika",
  });
  mockListWishlist.mockResolvedValue(WISHLIST_AFTER);
});

describe("removeFromWishlistAction", () => {
  it("REMOVE FROM WISHLIST: removes and returns the refreshed list", async () => {
    const r = await removeFromWishlistAction({ wishlistItemId: "w1" });
    expect(r).toEqual({ ok: true, wishlist: WISHLIST_AFTER });
    expect(mockRemoveFromWishlist).toHaveBeenCalledWith({
      guestTokenHash: "guest-hash-1",
      wishlistItemId: "w1",
    });
  });

  it("refuses without a guest cookie (nothing to own)", async () => {
    mockReadHash.mockResolvedValue(null);
    const r = await removeFromWishlistAction({ wishlistItemId: "w1" });
    expect(r).toEqual({
      ok: false,
      error: "That item isn't on your wishlist.",
    });
    expect(mockRemoveFromWishlist).not.toHaveBeenCalled();
  });

  it("surfaces the core's refusal verbatim", async () => {
    mockRemoveFromWishlist.mockResolvedValue({
      ok: false,
      error: "That item isn't on your wishlist.",
    });
    const r = await removeFromWishlistAction({ wishlistItemId: "w1" });
    expect(r).toEqual({
      ok: false,
      error: "That item isn't on your wishlist.",
    });
    expect(mockListWishlist).not.toHaveBeenCalled();
  });
});

describe("moveWishlistItemToCartAction", () => {
  it("MOVE/ADD FROM WISHLIST TO SELLER CART: rate-limits, moves, and returns both the artist slug and the refreshed wishlist", async () => {
    const r = await moveWishlistItemToCartAction({
      wishlistItemId: "w1",
      quantity: 1,
    });
    expect(r).toEqual({
      ok: true,
      artistSlug: "mika",
      wishlist: WISHLIST_AFTER,
    });
    expect(mockWishlistLimit).toHaveBeenCalledWith("203.0.113.9");
    expect(mockMoveWishlistItemToCart).toHaveBeenCalledWith({
      guestTokenHash: "guest-hash-1",
      wishlistItemId: "w1",
      quantity: 1,
    });
  });

  it("refuses when rate-limited, without attempting the move", async () => {
    mockWishlistLimit.mockResolvedValue({ allowed: false });
    const r = await moveWishlistItemToCartAction({
      wishlistItemId: "w1",
      quantity: 1,
    });
    expect(r.ok).toBe(false);
    expect(mockMoveWishlistItemToCart).not.toHaveBeenCalled();
  });

  it("UNAVAILABLE OR ARCHIVED PRODUCTS: a refused move (sold out) surfaces the core's error and leaves the wishlist as-is", async () => {
    mockMoveWishlistItemToCart.mockResolvedValue({
      ok: false,
      error: "This item is no longer available.",
    });
    const r = await moveWishlistItemToCartAction({
      wishlistItemId: "w1",
      quantity: 1,
    });
    expect(r).toEqual({
      ok: false,
      error: "This item is no longer available.",
    });
    expect(mockListWishlist).not.toHaveBeenCalled();
  });

  it("refuses without a guest cookie", async () => {
    mockReadHash.mockResolvedValue(null);
    const r = await moveWishlistItemToCartAction({
      wishlistItemId: "w1",
      quantity: 1,
    });
    expect(r).toEqual({
      ok: false,
      error: "That item isn't on your wishlist.",
    });
    expect(mockMoveWishlistItemToCart).not.toHaveBeenCalled();
  });
});
