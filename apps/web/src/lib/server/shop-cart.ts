import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { isGoodsCommerceEnabled } from "@/lib/features";
import { productAvailability } from "@inklee/shared/product-availability";
import { MAX_ADDON_QUANTITY, type AddonSelection } from "@/lib/orders";
import {
  fetchSellableCatalogRows,
  resolveBundleLines,
  type BundleSelection,
} from "@/lib/server/goods-checkout";

// FD5 seller-scoped carts (founder ruling, 2026-08-01). "A cart belongs to
// ONE artist. Products from different artists can never combine into one
// payment. A buyer may hold separate carts for different artists,
// simultaneously." One `shop_carts` row per (guest identity, artist); items
// live in `shop_cart_items`, whose composite FKs (0141) make a cross-artist
// item UNREPRESENTABLE at the schema level — the strongest available form of
// "refused, not filtered, not silently dropped."
//
// STALE-PRICE / STALE-AVAILABILITY POSTURE: a cart item is a pointer
// (product_id, variant_id, quantity), never a price or title snapshot.
// Display (`getCartForDisplay`) resolves price/availability fresh on every
// read; checkout (`resolveCartSelectionsForCheckout`) hands the raw pointers
// to `createStandaloneGoodsCheckoutCore`, which re-reads the catalog itself
// via the exact same `fetchSellableCatalogRows`/`computeAddonLines`/
// `resolveBundleLines` the direct "Buy now" flow already uses and has always
// used. A cart item that has gone stale (archived, sold out, repriced) is
// therefore handled EXACTLY like a stale "Buy now" selection always has been
// — the existing, already-tested compositor's own refusal — rather than by
// new, parallel, untested logic. `getCartForDisplay` additionally flags such
// items so the buyer can see and remove them before checkout without having
// to decode a generic refusal message.

export type CartActionResult = { ok: true } | { ok: false; error: string };

async function findOrCreateCart(
  guestTokenHash: string,
  artistId: string,
): Promise<{ id: string } | null> {
  const { data: existing } = await serviceClient
    .from("shop_carts")
    .select("id")
    .eq("guest_token_hash", guestTokenHash)
    .eq("artist_id", artistId)
    .maybeSingle();
  if (existing) return { id: existing.id as string };

  const { data: created, error } = await serviceClient
    .from("shop_carts")
    .insert({ guest_token_hash: guestTokenHash, artist_id: artistId })
    .select("id")
    .maybeSingle();
  if (created) return { id: created.id as string };

  // Lost the race against a concurrent add (unique on guest_token_hash,
  // artist_id): re-read rather than surface the conflict as a failure.
  if (error?.code === "23505") {
    const { data: retry } = await serviceClient
      .from("shop_carts")
      .select("id")
      .eq("guest_token_hash", guestTokenHash)
      .eq("artist_id", artistId)
      .maybeSingle();
    if (retry) return { id: retry.id as string };
  }
  return null;
}

/**
 * Ownership check shared by every mutate/remove path: the cart_item's OWN
 * cart must belong to the calling guest identity. Two plain queries rather
 * than one embedded-filter query, deliberately — a filter on a joined table
 * is easy to get subtly wrong, and this is a security check, not a
 * convenience read.
 */
async function ownedCartItem(
  guestTokenHash: string,
  cartItemId: string,
): Promise<{ id: string; cartId: string; quantity: number } | null> {
  const { data: item } = await serviceClient
    .from("shop_cart_items")
    .select("id, cart_id, quantity")
    .eq("id", cartItemId)
    .maybeSingle();
  if (!item) return null;
  const { data: cart } = await serviceClient
    .from("shop_carts")
    .select("id")
    .eq("id", item.cart_id as string)
    .eq("guest_token_hash", guestTokenHash)
    .maybeSingle();
  if (!cart) return null;
  return {
    id: item.id as string,
    cartId: item.cart_id as string,
    quantity: Number(item.quantity ?? 0),
  };
}

export type AddProductToCartInput = {
  guestTokenHash: string;
  artistId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
};

/**
 * Add (or increment) a product line in the buyer's cart for this artist.
 * Validates against the SAME sellable catalog the checkout core reads —
 * never trusting a client-supplied artistId beyond scoping the lookup: if
 * `productId` does not belong to `artistId`, the row simply is not found,
 * which is what keeps a cart from ever being OFFERED a cross-artist item in
 * the first place (the schema-level refusal in 0141 is the backstop for a
 * bug or a bypass of this path, not the primary gate).
 */
export async function addProductToCart(
  input: AddProductToCartInput,
): Promise<CartActionResult> {
  if (!isGoodsCommerceEnabled()) {
    return { ok: false, error: "The shop isn't taking card orders yet." };
  }
  const qty = Math.max(0, Math.trunc(Number(input.quantity) || 0));
  if (qty <= 0) return { ok: false, error: "Pick a quantity first." };
  if (qty > MAX_ADDON_QUANTITY) {
    return {
      ok: false,
      error: `You can add at most ${MAX_ADDON_QUANTITY} of an item.`,
    };
  }

  const catalog = await fetchSellableCatalogRows(input.artistId);
  const product = catalog.find((p) => p.id === input.productId);
  if (!product)
    return { ok: false, error: "This item is no longer available." };

  const availability = productAvailability(
    {
      status: product.status,
      availableFrom: product.available_from,
      preorder: product.preorder === true,
      stockQuantity:
        product.quantity === null ? null : Number(product.quantity),
    },
    Date.now(),
  );
  if (!availability.purchasable) {
    return {
      ok: false,
      error:
        availability.state === "upcoming"
          ? "This item hasn't dropped yet."
          : "This item is no longer available.",
    };
  }

  const activeVariants = (product.product_variants ?? []).filter(
    (v) => v.status === "active",
  );
  let variant: (typeof activeVariants)[number] | null = null;
  if (activeVariants.length > 0) {
    if (!input.variantId)
      return { ok: false, error: "Choose an option first." };
    const found = activeVariants.find((v) => v.id === input.variantId);
    if (!found) {
      return { ok: false, error: "That option isn't available right now." };
    }
    variant = found;
  } else if (input.variantId) {
    return { ok: false, error: "This item has no options to choose." };
  }

  const cart = await findOrCreateCart(input.guestTokenHash, input.artistId);
  if (!cart)
    return { ok: false, error: "Couldn't update your cart. Try again." };

  let existingQuery = serviceClient
    .from("shop_cart_items")
    .select("id, quantity")
    .eq("cart_id", cart.id)
    .eq("kind", "product")
    .eq("product_id", input.productId);
  existingQuery = variant
    ? existingQuery.eq("variant_id", variant.id)
    : existingQuery.is("variant_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  const stockCap = variant ? variant.stock_quantity : product.quantity;
  if (existing) {
    const nextQty = Math.min(
      MAX_ADDON_QUANTITY,
      Number(existing.quantity ?? 0) + qty,
    );
    if (stockCap !== null && nextQty > stockCap) {
      return { ok: false, error: `Only ${stockCap} left.` };
    }
    const { error } = await serviceClient
      .from("shop_cart_items")
      .update({ quantity: nextQty, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error)
      return { ok: false, error: "Couldn't update your cart. Try again." };
    return { ok: true };
  }

  const insertQty = Math.min(MAX_ADDON_QUANTITY, qty);
  if (stockCap !== null && insertQty > stockCap) {
    return { ok: false, error: `Only ${stockCap} left.` };
  }
  const { error } = await serviceClient.from("shop_cart_items").insert({
    cart_id: cart.id,
    artist_id: input.artistId,
    kind: "product",
    product_id: input.productId,
    variant_id: variant?.id ?? null,
    quantity: insertQty,
  });
  if (error)
    return { ok: false, error: "Couldn't update your cart. Try again." };
  return { ok: true };
}

export type AddBundleToCartInput = {
  guestTokenHash: string;
  artistId: string;
  bundleId: string;
  quantity: number;
};

/** Add (or increment) a bundle line, resolved through the SAME
 *  `resolveBundleLines` the checkout core uses — one bundle-purchasability
 *  rule, not a second copy that could disagree with it. */
export async function addBundleToCart(
  input: AddBundleToCartInput,
): Promise<CartActionResult> {
  if (!isGoodsCommerceEnabled()) {
    return { ok: false, error: "The shop isn't taking card orders yet." };
  }
  const qty = Math.max(0, Math.trunc(Number(input.quantity) || 0));
  if (qty <= 0) return { ok: false, error: "Pick a quantity first." };
  if (qty > MAX_ADDON_QUANTITY) {
    return {
      ok: false,
      error: `You can add at most ${MAX_ADDON_QUANTITY} of a bundle.`,
    };
  }

  const catalog = await fetchSellableCatalogRows(input.artistId);
  const resolved = await resolveBundleLines(
    input.artistId,
    [{ bundleId: input.bundleId, quantity: qty }],
    catalog,
  );
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if (resolved.lines.length === 0) {
    return { ok: false, error: "That bundle isn't available right now." };
  }

  const cart = await findOrCreateCart(input.guestTokenHash, input.artistId);
  if (!cart)
    return { ok: false, error: "Couldn't update your cart. Try again." };

  const { data: existing } = await serviceClient
    .from("shop_cart_items")
    .select("id, quantity")
    .eq("cart_id", cart.id)
    .eq("kind", "bundle")
    .eq("bundle_id", input.bundleId)
    .maybeSingle();

  if (existing) {
    const nextQty = Math.min(
      MAX_ADDON_QUANTITY,
      Number(existing.quantity ?? 0) + qty,
    );
    // Re-verify the COMBINED quantity is still purchasable (stock is a
    // moving target between the check above and this increment).
    const reverify = await resolveBundleLines(
      input.artistId,
      [{ bundleId: input.bundleId, quantity: nextQty }],
      catalog,
    );
    if (!reverify.ok) return { ok: false, error: reverify.error };
    const { error } = await serviceClient
      .from("shop_cart_items")
      .update({ quantity: nextQty, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error)
      return { ok: false, error: "Couldn't update your cart. Try again." };
    return { ok: true };
  }

  const { error } = await serviceClient.from("shop_cart_items").insert({
    cart_id: cart.id,
    artist_id: input.artistId,
    kind: "bundle",
    bundle_id: input.bundleId,
    quantity: Math.min(MAX_ADDON_QUANTITY, qty),
  });
  if (error)
    return { ok: false, error: "Couldn't update your cart. Try again." };
  return { ok: true };
}

/** Quantity change on an existing line (CART QUANTITY CHANGES). `quantity`
 *  of 0 removes the line — the same affordance as pressing "remove". */
export async function updateCartItemQuantity(input: {
  guestTokenHash: string;
  cartItemId: string;
  quantity: number;
}): Promise<CartActionResult> {
  const owned = await ownedCartItem(input.guestTokenHash, input.cartItemId);
  if (!owned) return { ok: false, error: "That item isn't in your cart." };

  const qty = Math.max(0, Math.trunc(Number(input.quantity) || 0));
  if (qty === 0) {
    const { error } = await serviceClient
      .from("shop_cart_items")
      .delete()
      .eq("id", owned.id);
    if (error)
      return { ok: false, error: "Couldn't update your cart. Try again." };
    return { ok: true };
  }
  const capped = Math.min(MAX_ADDON_QUANTITY, qty);
  const { error } = await serviceClient
    .from("shop_cart_items")
    .update({ quantity: capped, updated_at: new Date().toISOString() })
    .eq("id", owned.id);
  if (error)
    return { ok: false, error: "Couldn't update your cart. Try again." };
  return { ok: true };
}

export async function removeCartItem(input: {
  guestTokenHash: string;
  cartItemId: string;
}): Promise<CartActionResult> {
  const owned = await ownedCartItem(input.guestTokenHash, input.cartItemId);
  if (!owned) return { ok: false, error: "That item isn't in your cart." };
  const { error } = await serviceClient
    .from("shop_cart_items")
    .delete()
    .eq("id", owned.id);
  if (error)
    return { ok: false, error: "Couldn't remove that item. Try again." };
  return { ok: true };
}

export type CartDisplayLine = {
  cartItemId: string;
  kind: "product" | "bundle";
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  title: string;
  variantName: string | null;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
  currency: string;
  /** Live purchasability right now (STALE PRICE / UNAVAILABLE-OR-ARCHIVED
   *  PRODUCTS): false means checkout will refuse while this line is present,
   *  and the buyer sees why here rather than from a generic error at pay
   *  time. */
  available: boolean;
  unavailableReason: string | null;
};

export type CartDisplay = {
  cartId: string | null;
  lines: CartDisplayLine[];
  totalMinor: number;
  currency: string;
};

const EMPTY_CART: CartDisplay = {
  cartId: null,
  lines: [],
  totalMinor: 0,
  currency: "eur",
};

/**
 * Live-resolved cart contents for display. Deliberately NOT the same
 * pass/fail shape as the checkout compositor: a display must show every line
 * (including unavailable ones, so the buyer can act on them) rather than
 * hard-failing the whole read because one line went stale.
 */
export async function getCartForDisplay(
  guestTokenHash: string,
  artistId: string,
): Promise<CartDisplay> {
  const { data: cart } = await serviceClient
    .from("shop_carts")
    .select("id")
    .eq("guest_token_hash", guestTokenHash)
    .eq("artist_id", artistId)
    .maybeSingle();
  if (!cart) return EMPTY_CART;
  const cartId = cart.id as string;

  const { data: itemRows } = await serviceClient
    .from("shop_cart_items")
    .select("id, kind, product_id, variant_id, bundle_id, quantity")
    .eq("cart_id", cartId)
    .order("created_at", { ascending: true });
  const items = itemRows ?? [];
  if (items.length === 0) {
    return { cartId, lines: [], totalMinor: 0, currency: "eur" };
  }

  const productIds = items
    .filter((i) => i.kind === "product")
    .map((i) => i.product_id as string);
  const bundleIds = items
    .filter((i) => i.kind === "bundle")
    .map((i) => i.bundle_id as string);

  // UNFILTERED reads (by exact id, no status/visibility filter): a display
  // needs to show an archived/hidden item's last known name and price with
  // an "unavailable" flag, not make it disappear without explanation. The
  // authoritative SELLABLE catalog (used for the actual availability
  // verdict) is fetched separately below.
  const [{ data: rawProducts }, { data: rawBundles }] = await Promise.all([
    productIds.length > 0
      ? serviceClient
          .from("products")
          .select(
            "id, title, price_amount, currency, product_variants(id, name, price_amount_override, status)",
          )
          .eq("artist_id", artistId)
          .in("id", productIds)
      : Promise.resolve({ data: [] }),
    bundleIds.length > 0
      ? serviceClient
          .from("product_bundles")
          .select("id, name, price_amount, currency")
          .eq("artist_id", artistId)
          .in("id", bundleIds)
      : Promise.resolve({ data: [] }),
  ]);
  const productById = new Map(
    (rawProducts ?? []).map((p) => [p.id as string, p]),
  );
  const bundleById = new Map(
    (rawBundles ?? []).map((b) => [b.id as string, b]),
  );

  const sellableCatalog = await fetchSellableCatalogRows(artistId);
  const sellableById = new Map(sellableCatalog.map((p) => [p.id, p]));

  const lines: CartDisplayLine[] = [];
  let totalMinor = 0;

  for (const item of items) {
    if (item.kind === "product") {
      const productId = item.product_id as string;
      const raw = productById.get(productId);
      if (!raw) continue; // FK cascade means this shouldn't happen; defensive skip.
      const variantId = (item.variant_id as string | null) ?? null;
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
      const quantity = Number(item.quantity ?? 0);

      const sellable = sellableById.get(productId);
      let available = false;
      let unavailableReason: string | null =
        "This item is no longer available.";
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
        const activeVariants = (sellable.product_variants ?? []).filter(
          (v) => v.status === "active",
        );
        if (variantId) {
          const sellableVariant = activeVariants.find(
            (v) => v.id === variantId,
          );
          if (!sellableVariant) {
            unavailableReason = "That option isn't available right now.";
          } else if (
            sellableVariant.stock_quantity !== null &&
            quantity > sellableVariant.stock_quantity
          ) {
            unavailableReason = `Only ${sellableVariant.stock_quantity} left.`;
          } else if (availability.purchasable) {
            available = true;
            unavailableReason = null;
          }
        } else if (activeVariants.length > 0) {
          unavailableReason = "Choose an option to continue.";
        } else if (sellable.quantity !== null && quantity > sellable.quantity) {
          unavailableReason = `Only ${sellable.quantity} left.`;
        } else if (availability.purchasable) {
          available = true;
          unavailableReason = null;
        }
      }

      const lineTotal = Math.round(unitAmount * quantity * 100) / 100;
      if (available) totalMinor += Math.round(lineTotal * 100);
      lines.push({
        cartItemId: item.id as string,
        kind: "product",
        productId,
        variantId,
        bundleId: null,
        title: (raw.title as string) ?? "",
        variantName: rawVariant?.name ?? null,
        quantity,
        unitAmount,
        lineTotal,
        currency: (raw.currency as string) ?? "eur",
        available,
        unavailableReason,
      });
    } else {
      const bundleId = item.bundle_id as string;
      const raw = bundleById.get(bundleId);
      if (!raw) continue;
      const quantity = Number(item.quantity ?? 0);
      const resolved = await resolveBundleLines(
        artistId,
        [{ bundleId, quantity }],
        sellableCatalog,
      );
      const available = resolved.ok && resolved.lines.length > 0;
      const unitAmount = available
        ? resolved.lines[0].unitAmount
        : Number(raw.price_amount ?? 0);
      const lineTotal = Math.round(unitAmount * quantity * 100) / 100;
      if (available) totalMinor += Math.round(lineTotal * 100);
      lines.push({
        cartItemId: item.id as string,
        kind: "bundle",
        productId: null,
        variantId: null,
        bundleId,
        title: (raw.name as string) ?? "",
        variantName: null,
        quantity,
        unitAmount,
        lineTotal,
        currency: (raw.currency as string) ?? "eur",
        available,
        unavailableReason: available
          ? null
          : "That bundle isn't available right now.",
      });
    }
  }

  return { cartId, lines, totalMinor, currency: "eur" };
}

export type ResolvedCartForCheckout =
  | {
      ok: true;
      cartId: string;
      artistId: string;
      selections: AddonSelection[];
      bundles: BundleSelection[];
    }
  | { ok: false; error: string };

/**
 * Turn a persisted cart into the exact input shape
 * `createStandaloneGoodsCheckoutCore` already accepts, so cart checkout runs
 * through the SAME compositor as "Buy now" — no parallel money logic.
 *
 * THE SELLER BOUNDARY. `shop_cart_items.artist_id` is bound by composite FK
 * (0141) to BOTH its parent cart's artist_id and its product/bundle's OWN
 * artist_id at once, which makes a cross-artist row unrepresentable for any
 * role, including service role — proven in
 * tests/db/shop-carts-seller-boundary.test.ts by attempting exactly that
 * insert and observing the 23503. The assertion below is deliberate
 * defense-in-depth on top of that schema guarantee (never rely solely on "the
 * query already filtered it" for a money-path invariant, the SHOP-VIS-001
 * posture): if it ever fires, the WHOLE checkout is refused outright, not
 * just the offending line, exactly as the founder ruling requires.
 */
export async function resolveCartSelectionsForCheckout(
  guestTokenHash: string,
  cartId: string,
): Promise<ResolvedCartForCheckout> {
  const { data: cart } = await serviceClient
    .from("shop_carts")
    .select("id, artist_id")
    .eq("id", cartId)
    .eq("guest_token_hash", guestTokenHash)
    .maybeSingle();
  if (!cart) return { ok: false, error: "This cart could not be found." };
  const artistId = cart.artist_id as string;

  const { data: itemRows } = await serviceClient
    .from("shop_cart_items")
    .select("kind, product_id, variant_id, bundle_id, quantity, artist_id")
    .eq("cart_id", cartId);
  const items = itemRows ?? [];

  const boundaryViolation = items.find((i) => i.artist_id !== artistId);
  if (boundaryViolation) {
    // This should be schema-impossible (0141's composite FKs). If it is ever
    // observed, it is a data-integrity emergency, not a user-facing "pick
    // something else" moment — refuse the ENTIRE checkout, no partial cart.
    return {
      ok: false,
      error: "Something is wrong with your cart. Please clear it and retry.",
    };
  }

  const selections: AddonSelection[] = items
    .filter((i) => i.kind === "product")
    .map((i) => ({
      productId: i.product_id as string,
      variantId: (i.variant_id as string | null) ?? null,
      quantity: Number(i.quantity ?? 0),
    }));
  const bundles: BundleSelection[] = items
    .filter((i) => i.kind === "bundle")
    .map((i) => ({
      bundleId: i.bundle_id as string,
      quantity: Number(i.quantity ?? 0),
    }));

  return { ok: true, cartId, artistId, selections, bundles };
}
