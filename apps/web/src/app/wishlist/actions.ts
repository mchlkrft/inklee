"use server";

import { headers } from "next/headers";
import { getClientIp } from "@/lib/get-client-ip";
import { checkShopWishlistRateLimit } from "@/lib/ratelimit";
import { readGuestTokenHash } from "@/lib/server/shop-guest-identity";
import {
  removeFromWishlist,
  moveWishlistItemToCart,
  listWishlist,
  type WishlistDisplayItem,
} from "@/lib/server/shop-wishlist";

// FD5 wishlist page (spans artists, per the ruling). Mutations only — the
// page itself reads the list server-side in the Server Component (no auth
// state to hide, and a read needs no rate limit).

export type WishlistMutationOutcome =
  | { ok: true; wishlist: WishlistDisplayItem[] }
  | { ok: false; error: string };

export async function removeFromWishlistAction(input: {
  wishlistItemId: string;
}): Promise<WishlistMutationOutcome> {
  const guestTokenHash = await readGuestTokenHash();
  if (!guestTokenHash)
    return { ok: false, error: "That item isn't on your wishlist." };
  const result = await removeFromWishlist({
    guestTokenHash,
    wishlistItemId: input.wishlistItemId,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, wishlist: await listWishlist(guestTokenHash) };
}

export type MoveToCartOutcome =
  | { ok: true; artistSlug: string; wishlist: WishlistDisplayItem[] }
  | { ok: false; error: string };

export async function moveWishlistItemToCartAction(input: {
  wishlistItemId: string;
  quantity: number;
}): Promise<MoveToCartOutcome> {
  const guestTokenHash = await readGuestTokenHash();
  if (!guestTokenHash)
    return { ok: false, error: "That item isn't on your wishlist." };

  const ip = getClientIp(await headers());
  const { allowed } = await checkShopWishlistRateLimit(ip);
  if (!allowed) {
    return {
      ok: false,
      error: "Too many attempts. Please wait a moment and try again.",
    };
  }

  const result = await moveWishlistItemToCart({
    guestTokenHash,
    wishlistItemId: input.wishlistItemId,
    quantity: Number(input.quantity ?? 1),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    artistSlug: result.artistSlug,
    wishlist: await listWishlist(guestTokenHash),
  };
}
