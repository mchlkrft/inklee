"use server";

import { headers } from "next/headers";
import { serviceClient } from "@/lib/supabase/service";
import { isGoodsCommerceEnabled, shopCheckoutEnabled } from "@/lib/features";
import {
  checkShopCheckoutRateLimit,
  checkShopCartRateLimit,
  checkShopWishlistRateLimit,
} from "@/lib/ratelimit";
import { getClientIp } from "@/lib/get-client-ip";
import {
  createStandaloneGoodsCheckoutCore,
  type BundleSelection,
} from "@/lib/server/goods-checkout";
import type { AddonSelection } from "@/lib/orders";
import {
  getOrCreateGuestTokenHash,
  readGuestTokenHash,
} from "@/lib/server/shop-guest-identity";
import {
  addProductToCart,
  addBundleToCart,
  updateCartItemQuantity,
  removeCartItem,
  getCartForDisplay,
  resolveCartSelectionsForCheckout,
  type CartDisplay,
} from "@/lib/server/shop-cart";
import {
  addToWishlist,
  removeFromWishlistByProduct,
} from "@/lib/server/shop-wishlist";

// PUBLIC, UNAUTHENTICATED action (GC1 slice C3): a guest buyer starts a
// standalone shop checkout. Thin on purpose — every money decision (catalog,
// prices, stock, discount, fee, charge floor, Connect readiness) lives in
// createStandaloneGoodsCheckoutCore; this adds only what a public entry point
// needs: the park-switch double-gate, an IP rate limit (public-submit rule),
// and slug -> artist resolution.

export type ShopCheckoutActionResult =
  | { ok: true; orderId: string; clientSecret: string; totalMinor: number }
  | { ok: false; error: string };

export async function startShopCheckoutAction(input: {
  slug: string;
  email: string;
  selections: AddonSelection[];
  bundles?: BundleSelection[];
  discountCode?: string;
}): Promise<ShopCheckoutActionResult> {
  // Double gate: the page 404s when parked, and the action refuses too, so a
  // held request from before a park cannot start a checkout after it.
  if (!isGoodsCommerceEnabled()) {
    return { ok: false, error: "The shop isn't taking card orders yet." };
  }

  const slug = String(input.slug ?? "").trim();
  if (!slug) return { ok: false, error: "This shop could not be found." };

  const { data: artist } = await serviceClient
    .from("profiles")
    .select("id, settings")
    .eq("slug", slug)
    .maybeSingle();
  if (!artist) return { ok: false, error: "This shop could not be found." };

  // Decision S2, same double-gate shape as the park switch above: the page
  // 404s when the artist's own toggle is off, and the action refuses too, so
  // a held request from before the artist turned it off cannot start a
  // checkout after. The core re-checks this again (the money path's own
  // authority); this is defense in depth, not the only gate.
  if (!shopCheckoutEnabled(artist.settings)) {
    return { ok: false, error: "The shop isn't taking card orders yet." };
  }
  const artistId = artist.id as string;

  // Public-submit rate limit, keyed by caller IP + the target artist so one
  // shop being hammered does not consume another's budget. Its own bucket, so
  // buyer retries never eat the booking form's limit for the same IP.
  const ip = getClientIp(await headers());
  const limit = await checkShopCheckoutRateLimit(ip, artistId);
  if (!limit.allowed) {
    return {
      ok: false,
      error: "Too many attempts. Please wait a moment and try again.",
    };
  }

  return createStandaloneGoodsCheckoutCore({
    artistId,
    clientEmail: String(input.email ?? ""),
    selections: Array.isArray(input.selections) ? input.selections : [],
    bundles: Array.isArray(input.bundles) ? input.bundles : [],
    discountCode:
      typeof input.discountCode === "string" ? input.discountCode : undefined,
  });
}

// ===========================================================================
// FD5: wishlist + seller-scoped carts. Every action below resolves the
// artist from the SLUG (never trusts a client-supplied artistId beyond that
// resolution), and every cart/wishlist read or write happens on the
// guest-token identity from the caller's own httpOnly cookie
// (shop-guest-identity.ts) — there is no other credential a buyer can hold.

async function resolveShopArtist(slug: string): Promise<{ id: string } | null> {
  if (!isGoodsCommerceEnabled()) return null;
  const trimmed = String(slug ?? "").trim();
  if (!trimmed) return null;
  const { data: artist } = await serviceClient
    .from("profiles")
    .select("id, settings")
    .eq("slug", trimmed)
    .maybeSingle();
  if (!artist) return null;
  if (!shopCheckoutEnabled(artist.settings)) return null;
  return { id: artist.id as string };
}

export type CartActionOutcome =
  | { ok: true; cart: CartDisplay }
  | { ok: false; error: string };

async function withCartRateLimit(
  artistId: string,
): Promise<{ allowed: boolean }> {
  const ip = getClientIp(await headers());
  return checkShopCartRateLimit(ip, artistId);
}

export async function addToCartAction(input: {
  slug: string;
  productId: string;
  variantId: string | null;
  quantity: number;
}): Promise<CartActionOutcome> {
  const artist = await resolveShopArtist(input.slug);
  if (!artist) return { ok: false, error: "This shop could not be found." };
  const { allowed } = await withCartRateLimit(artist.id);
  if (!allowed) {
    return {
      ok: false,
      error: "Too many attempts. Please wait a moment and try again.",
    };
  }
  const guestTokenHash = await getOrCreateGuestTokenHash();
  const result = await addProductToCart({
    guestTokenHash,
    artistId: artist.id,
    productId: input.productId,
    variantId: input.variantId ?? null,
    quantity: Number(input.quantity ?? 0),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, cart: await getCartForDisplay(guestTokenHash, artist.id) };
}

export async function addBundleToCartAction(input: {
  slug: string;
  bundleId: string;
  quantity: number;
}): Promise<CartActionOutcome> {
  const artist = await resolveShopArtist(input.slug);
  if (!artist) return { ok: false, error: "This shop could not be found." };
  const { allowed } = await withCartRateLimit(artist.id);
  if (!allowed) {
    return {
      ok: false,
      error: "Too many attempts. Please wait a moment and try again.",
    };
  }
  const guestTokenHash = await getOrCreateGuestTokenHash();
  const result = await addBundleToCart({
    guestTokenHash,
    artistId: artist.id,
    bundleId: input.bundleId,
    quantity: Number(input.quantity ?? 0),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, cart: await getCartForDisplay(guestTokenHash, artist.id) };
}

export async function updateCartItemQuantityAction(input: {
  slug: string;
  cartItemId: string;
  quantity: number;
}): Promise<CartActionOutcome> {
  const artist = await resolveShopArtist(input.slug);
  if (!artist) return { ok: false, error: "This shop could not be found." };
  const guestTokenHash = await readGuestTokenHash();
  if (!guestTokenHash)
    return { ok: false, error: "That item isn't in your cart." };
  const result = await updateCartItemQuantity({
    guestTokenHash,
    cartItemId: input.cartItemId,
    quantity: Number(input.quantity ?? 0),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, cart: await getCartForDisplay(guestTokenHash, artist.id) };
}

export async function removeCartItemAction(input: {
  slug: string;
  cartItemId: string;
}): Promise<CartActionOutcome> {
  const artist = await resolveShopArtist(input.slug);
  if (!artist) return { ok: false, error: "This shop could not be found." };
  const guestTokenHash = await readGuestTokenHash();
  if (!guestTokenHash)
    return { ok: false, error: "That item isn't in your cart." };
  const result = await removeCartItem({
    guestTokenHash,
    cartItemId: input.cartItemId,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, cart: await getCartForDisplay(guestTokenHash, artist.id) };
}

/**
 * Cart-to-checkout transition (FD5). Unlike `startShopCheckoutAction`, the
 * selections are NEVER taken from the client — they are read straight off
 * the buyer's persisted cart, through `resolveCartSelectionsForCheckout`
 * (the seller-boundary refusal lives there), then handed to the SAME
 * `createStandaloneGoodsCheckoutCore` "Buy now" already uses.
 */
export async function startCartCheckoutAction(input: {
  slug: string;
  email: string;
  discountCode?: string;
}): Promise<ShopCheckoutActionResult> {
  if (!isGoodsCommerceEnabled()) {
    return { ok: false, error: "The shop isn't taking card orders yet." };
  }
  const artist = await resolveShopArtist(input.slug);
  if (!artist) return { ok: false, error: "This shop could not be found." };

  const guestTokenHash = await readGuestTokenHash();
  if (!guestTokenHash) return { ok: false, error: "Your cart is empty." };

  const { data: cartRow } = await serviceClient
    .from("shop_carts")
    .select("id")
    .eq("guest_token_hash", guestTokenHash)
    .eq("artist_id", artist.id)
    .maybeSingle();
  if (!cartRow) return { ok: false, error: "Your cart is empty." };

  const ip = getClientIp(await headers());
  const limit = await checkShopCheckoutRateLimit(ip, artist.id);
  if (!limit.allowed) {
    return {
      ok: false,
      error: "Too many attempts. Please wait a moment and try again.",
    };
  }

  const resolved = await resolveCartSelectionsForCheckout(
    guestTokenHash,
    cartRow.id as string,
  );
  if (!resolved.ok) return { ok: false, error: resolved.error };

  return createStandaloneGoodsCheckoutCore({
    artistId: resolved.artistId,
    cartId: resolved.cartId,
    clientEmail: String(input.email ?? ""),
    selections: resolved.selections,
    bundles: resolved.bundles,
    discountCode:
      typeof input.discountCode === "string" ? input.discountCode : undefined,
  });
}

export type WishlistActionOutcome = { ok: true } | { ok: false; error: string };

export async function addToWishlistAction(input: {
  slug: string;
  productId: string;
  variantId: string | null;
}): Promise<WishlistActionOutcome> {
  const artist = await resolveShopArtist(input.slug);
  if (!artist) return { ok: false, error: "This shop could not be found." };
  const ip = getClientIp(await headers());
  const { allowed } = await checkShopWishlistRateLimit(ip);
  if (!allowed) {
    return {
      ok: false,
      error: "Too many attempts. Please wait a moment and try again.",
    };
  }
  const guestTokenHash = await getOrCreateGuestTokenHash();
  return addToWishlist({
    guestTokenHash,
    artistId: artist.id,
    productId: input.productId,
    variantId: input.variantId ?? null,
  });
}

export async function removeFromWishlistByProductAction(input: {
  productId: string;
  variantId: string | null;
}): Promise<WishlistActionOutcome> {
  const guestTokenHash = await readGuestTokenHash();
  if (!guestTokenHash) return { ok: true }; // nothing to remove; idempotent.
  return removeFromWishlistByProduct({
    guestTokenHash,
    productId: input.productId,
    variantId: input.variantId ?? null,
  });
}
