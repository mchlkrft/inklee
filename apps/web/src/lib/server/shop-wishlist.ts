import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { isGoodsCommerceEnabled } from "@/lib/features";
import { productAvailability } from "@inklee/shared/product-availability";
import { fetchSellableCatalogRows } from "@/lib/server/goods-checkout";
import { addProductToCart } from "@/lib/server/shop-cart";

// FD5 wishlist (founder ruling, 2026-08-01). "A wishlist MAY span artists" —
// unlike shop_carts (one per artist), this is a single flat list per guest
// identity across every artist the buyer has browsed. Interest signalling is
// broader than checkout (same posture as booking_interests): a product stays
// wishlistable/wishlisted even once it drops out of stock, so the row itself
// never enforces purchasability — only MOVE TO CART re-validates that, via
// the exact same `addProductToCart` the cart page itself uses.
//
// "Moving a wishlist item to a cart must land it in the correct seller
// cart": `moveWishlistItemToCart` derives `artistId` from the wishlist ROW
// (which 0141's composite FK guarantees actually owns `productId`), never
// from a client-supplied value, so there is no way to name a mismatched
// artist for a move.

export type WishlistActionResult = { ok: true } | { ok: false; error: string };

export async function addToWishlist(input: {
  guestTokenHash: string;
  artistId: string;
  productId: string;
  variantId: string | null;
}): Promise<WishlistActionResult> {
  if (!isGoodsCommerceEnabled()) {
    return { ok: false, error: "The shop isn't taking card orders yet." };
  }

  // Validated against the sellable catalog: a buyer can only ever have SEEN
  // a public, active product to wishlist it from the shop page in the first
  // place. Once wishlisted it survives the product going unavailable later
  // (interest signalling is broader than checkout) — this check is only the
  // gate for ADDING a new entry, not for keeping existing ones.
  const catalog = await fetchSellableCatalogRows(input.artistId);
  const product = catalog.find((p) => p.id === input.productId);
  if (!product)
    return { ok: false, error: "This item is no longer available." };

  if (input.variantId) {
    const activeVariants = (product.product_variants ?? []).filter(
      (v) => v.status === "active",
    );
    if (!activeVariants.some((v) => v.id === input.variantId)) {
      return { ok: false, error: "That option isn't available right now." };
    }
  }

  // Manual dedupe rather than `.upsert(..., {onConflict})`: the table's
  // uniqueness is a PARTIAL/expression index (coalesce(variant_id, sentinel),
  // 0141), and Postgres' ON CONFLICT target must name a constraint whose key
  // columns match EXACTLY — a plain `(guest_token_hash, product_id,
  // variant_id)` target does not match that expression index, so `.upsert`
  // would fail with "no unique or exclusion constraint matching". Same
  // is()/eq() branching as addProductToCart's dedupe.
  let existingQuery = serviceClient
    .from("shop_wishlist_items")
    .select("id")
    .eq("guest_token_hash", input.guestTokenHash)
    .eq("product_id", input.productId);
  existingQuery = input.variantId
    ? existingQuery.eq("variant_id", input.variantId)
    : existingQuery.is("variant_id", null);
  const { data: existing } = await existingQuery.maybeSingle();
  if (existing) return { ok: true }; // already wishlisted; idempotent add.

  const { error } = await serviceClient.from("shop_wishlist_items").insert({
    guest_token_hash: input.guestTokenHash,
    artist_id: input.artistId,
    product_id: input.productId,
    variant_id: input.variantId,
  });
  // A concurrent duplicate insert racing this check hits the unique index
  // (23505); treat it the same as "already wishlisted" rather than an error.
  if (error && error.code !== "23505") {
    return { ok: false, error: "Couldn't update your wishlist. Try again." };
  }
  return { ok: true };
}

/** Keyed lookup for the shop page's heart-toggle initial state: which of
 *  THIS artist's products (by product+variant) are already wishlisted by
 *  this guest. Scoped to one artist so the shop page's render never has to
 *  pull the buyer's ENTIRE cross-artist wishlist just to draw a few hearts. */
export async function listWishlistedKeysForArtist(
  guestTokenHash: string,
  artistId: string,
): Promise<Set<string>> {
  const { data } = await serviceClient
    .from("shop_wishlist_items")
    .select("product_id, variant_id")
    .eq("guest_token_hash", guestTokenHash)
    .eq("artist_id", artistId);
  return new Set(
    (data ?? []).map((r) => `${r.product_id}::${r.variant_id ?? ""}`),
  );
}

export async function removeFromWishlistByProduct(input: {
  guestTokenHash: string;
  productId: string;
  variantId: string | null;
}): Promise<WishlistActionResult> {
  let query = serviceClient
    .from("shop_wishlist_items")
    .delete()
    .eq("guest_token_hash", input.guestTokenHash)
    .eq("product_id", input.productId);
  query = input.variantId
    ? query.eq("variant_id", input.variantId)
    : query.is("variant_id", null);
  const { error } = await query;
  if (error)
    return { ok: false, error: "Couldn't update your wishlist. Try again." };
  return { ok: true };
}

export async function removeFromWishlist(input: {
  guestTokenHash: string;
  wishlistItemId: string;
}): Promise<WishlistActionResult> {
  const { data, error: delErr } = await serviceClient
    .from("shop_wishlist_items")
    .delete()
    .eq("id", input.wishlistItemId)
    .eq("guest_token_hash", input.guestTokenHash)
    .select("id");
  if (delErr) {
    return { ok: false, error: "Couldn't update your wishlist. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "That item isn't on your wishlist." };
  }
  return { ok: true };
}

export type WishlistDisplayItem = {
  wishlistItemId: string;
  artistId: string;
  artistName: string;
  artistSlug: string;
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  unitAmount: number;
  currency: string;
  available: boolean;
};

/** Cross-artist by design — grouped by artist for display, per the ruling. */
export async function listWishlist(
  guestTokenHash: string,
): Promise<WishlistDisplayItem[]> {
  const { data: rows } = await serviceClient
    .from("shop_wishlist_items")
    .select("id, artist_id, product_id, variant_id")
    .eq("guest_token_hash", guestTokenHash)
    .order("created_at", { ascending: false });
  const items = rows ?? [];
  if (items.length === 0) return [];

  const artistIds = [...new Set(items.map((i) => i.artist_id as string))];
  const productIds = [...new Set(items.map((i) => i.product_id as string))];

  const [{ data: artists }, { data: rawProducts }] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("id, display_name, slug")
      .in("id", artistIds),
    serviceClient
      .from("products")
      .select(
        "id, artist_id, title, price_amount, currency, product_variants(id, name, price_amount_override, status)",
      )
      .in("id", productIds),
  ]);
  const artistById = new Map((artists ?? []).map((a) => [a.id as string, a]));
  const productById = new Map(
    (rawProducts ?? []).map((p) => [p.id as string, p]),
  );

  // Availability is re-checked per DISTINCT artist against the sellable
  // catalog (one call each, not one per item) so a large wishlist doesn't
  // fan out N catalog reads.
  const sellableByArtist = new Map(
    await Promise.all(
      artistIds.map(
        async (id) => [id, await fetchSellableCatalogRows(id)] as const,
      ),
    ),
  );

  const results: WishlistDisplayItem[] = [];
  for (const item of items) {
    const artistId = item.artist_id as string;
    const productId = item.product_id as string;
    const variantId = (item.variant_id as string | null) ?? null;
    const artist = artistById.get(artistId);
    const raw = productById.get(productId);
    if (!artist || !raw) continue; // FK cascade: shouldn't happen; defensive skip.

    const rawVariant = variantId
      ? (
          (raw.product_variants ?? []) as {
            id: string;
            name: string;
            price_amount_override: number | null;
            status: string;
          }[]
        ).find((v) => v.id === variantId)
      : null;
    const unitAmount = Number(
      rawVariant?.price_amount_override ?? raw.price_amount ?? 0,
    );

    const sellable = (sellableByArtist.get(artistId) ?? []).find(
      (p) => p.id === productId,
    );
    let available = false;
    if (sellable) {
      const availability = productAvailability(
        {
          status: sellable.status,
          availableFrom: sellable.available_from,
          preorder: sellable.preorder === true,
          stockQuantity:
            sellable.quantity === null ? null : Number(sellable.quantity),
        },
        Date.now(),
      );
      if (variantId) {
        const activeVariant = (sellable.product_variants ?? []).find(
          (v) => v.id === variantId && v.status === "active",
        );
        available = Boolean(activeVariant) && availability.purchasable;
      } else {
        available = availability.purchasable;
      }
    }

    results.push({
      wishlistItemId: item.id as string,
      artistId,
      artistName: (artist.display_name as string | null) || "This artist",
      artistSlug: (artist.slug as string) ?? "",
      productId,
      variantId,
      title: (raw.title as string) ?? "",
      variantName: rawVariant?.name ?? null,
      unitAmount,
      currency: (raw.currency as string) ?? "eur",
      available,
    });
  }
  return results;
}

export type MoveToCartResult =
  | { ok: true; artistSlug: string }
  | { ok: false; error: string };

/**
 * Move a wishlist item into ITS OWN artist's cart. `artistId` and
 * `productId` come from the wishlist ROW, never from the caller, so a
 * crafted request cannot direct the item into a different seller's cart —
 * the whole point of this function per the ruling.
 */
export async function moveWishlistItemToCart(input: {
  guestTokenHash: string;
  wishlistItemId: string;
  quantity: number;
}): Promise<MoveToCartResult> {
  const { data: item } = await serviceClient
    .from("shop_wishlist_items")
    .select("id, artist_id, product_id, variant_id")
    .eq("id", input.wishlistItemId)
    .eq("guest_token_hash", input.guestTokenHash)
    .maybeSingle();
  if (!item) return { ok: false, error: "That item isn't on your wishlist." };

  const artistId = item.artist_id as string;
  const { data: artist } = await serviceClient
    .from("profiles")
    .select("slug")
    .eq("id", artistId)
    .maybeSingle();
  const artistSlug = (artist?.slug as string | null) ?? "";

  const added = await addProductToCart({
    guestTokenHash: input.guestTokenHash,
    artistId,
    productId: item.product_id as string,
    variantId: (item.variant_id as string | null) ?? null,
    quantity: input.quantity,
  });
  if (!added.ok) return { ok: false, error: added.error };

  // Only removed from the wishlist once it has actually landed in the cart —
  // a refused move (sold out, parked, etc.) must leave the wishlist entry in
  // place so the buyer isn't left with neither.
  await serviceClient
    .from("shop_wishlist_items")
    .delete()
    .eq("id", input.wishlistItemId);

  return { ok: true, artistSlug };
}
