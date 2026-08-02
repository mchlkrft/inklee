// Server-only: fetch an artist's checkout-addon products (active, with active
// variants) for the pre-checkout add-ons flow. Used by the request portal page
// (render the selector) and prepareCheckoutAction (validate + price). Reads via
// the service-role client — the customer has no auth session.

import { serviceClient } from "@/lib/supabase/service";
import { productAvailability } from "@inklee/shared/product-availability";
import {
  isProductStatus,
  toPriceNumber,
  type ProductStatus,
} from "@/lib/goods";
import {
  canChargeCheckoutAddons,
  canUseGoods,
  isGoodsCommerceEnabled,
} from "@/lib/features";
import type { AddonProduct } from "@/lib/orders";

export type AddonProductRow = AddonProduct & { imageUrl: string | null };

type RawVariant = {
  id: string;
  name: string;
  price_amount_override: string | number | null;
  stock_quantity: number | null;
  status: string;
  sort_order: number;
};

type RawProduct = {
  id: string;
  title: string;
  image_url: string | null;
  price_amount: string | number;
  currency: string | null;
  status: string;
  is_checkout_addon: boolean;
  quantity: number | null;
  available_from?: string | null;
  preorder?: boolean;
  /** Art. 16(c) exemption (C1.2), artist-set. */
  custom_made?: boolean | null;
  product_variants: RawVariant[] | null;
};

// ONE declaration of the `products` column set, read by BOTH functions below.
//
// SHOP-DROP-002 (2026-08-02): `getAddonProducts` and `getInterestEligibleProducts`
// used to hand-copy this list independently. `available_from`/`preorder` were
// present in one copy and missing from the other, so `computeAddonLines` read
// `availableFrom` as null on every add-on line and the drop gate could never
// see a future drop on the PAYABLE path — a column omitted from a SELECT made
// a downstream gate silently pass, and no test of the gate itself could catch
// it, because the gate never saw a false value; it saw no value.
//
// The fix is structural, not a second corrected copy: both functions below
// call `.select(PRODUCT_SELECT_COLUMNS)` on this SAME exported constant, so
// there is no longer a second list for a future column to be added to and
// forgotten in. `mapProductRow` (below) is the matching single row->domain
// mapping, for the same reason — the columns and the mapping are the two
// halves that drifted, not the filters or the return types, which stay
// intentionally different per function (see each function's own comment).
export const PRODUCT_SELECT_COLUMNS =
  "id, title, image_url, price_amount, currency, status, is_checkout_addon, quantity, custom_made, available_from, preorder, product_variants(id, name, price_amount_override, stock_quantity, status, sort_order)";

/**
 * The one row -> domain-object mapping for a `products` row selected via
 * `PRODUCT_SELECT_COLUMNS`, shared by both functions below. Every field
 * `PRODUCT_SELECT_COLUMNS` fetches is surfaced here unconditionally — even
 * fields only one CALLER currently acts on (`customMade` is read by the
 * checkout/receipt path, not by interest-marking; `availableFrom`/`preorder`
 * drive `computeAddonLines`' drop gate, not `computeInterestRows`) — so a
 * future caller that starts needing one of them reads it from data already
 * flowing through, rather than needing yet another one-off column addition
 * that can drift again.
 */
function mapProductRow(p: RawProduct): AddonProductRow {
  return {
    id: p.id,
    title: p.title,
    imageUrl: p.image_url,
    price: toPriceNumber(p.price_amount),
    currency: typeof p.currency === "string" ? p.currency : "eur",
    status: (isProductStatus(p.status) ? p.status : "active") as ProductStatus,
    isCheckoutAddon: p.is_checkout_addon,
    quantity: p.quantity,
    customMade: p.custom_made === true,
    availableFrom: p.available_from ?? null,
    preorder: p.preorder === true,
    variants: [...(p.product_variants ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({
        id: v.id,
        name: v.name,
        priceOverride:
          v.price_amount_override !== null &&
          v.price_amount_override !== undefined
            ? toPriceNumber(v.price_amount_override)
            : null,
        stock: v.stock_quantity,
        status: (isProductStatus(v.status)
          ? v.status
          : "active") as ProductStatus,
      })),
  };
}

// Wider set than getAddonProducts: any active EUR public product can be
// flagged as "interested" at booking-form time, regardless of the
// is_checkout_addon flag or the production money-gate. Decoupled because
// interest-marking is a signal the artist sees on the booking, not a
// commitment to charge — the checkout-time flow still uses getAddonProducts
// (strict is_checkout_addon=true + production gate) so a product without the
// addon flag is signal-only and the goods checkout stays off until Stripe
// Connect (OT-12) ships.
export async function getInterestEligibleProducts(
  artistId: string,
): Promise<AddonProductRow[]> {
  // 78a/DT-11: interest-marking is decoupled from paid goods commerce. It
  // rides on the per-artist goods module (`canUseGoods`), NOT the RS-3
  // `isGoodsCommerceEnabled()` park switch (which still gates the payable
  // add-on checkout in getAddonProducts below). So clients can flag goods
  // they want at the appointment even while in-app goods checkout stays off.
  const { data: artist } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", artistId)
    .single();
  if (!canUseGoods(artist?.settings)) return [];

  const { data } = await serviceClient
    .from("products")
    .select(PRODUCT_SELECT_COLUMNS)
    .eq("artist_id", artistId)
    .eq("is_public_visible", true)
    .eq("status", "active")
    .eq("currency", "eur")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // GATE 1 of 3 for drops and preorders (P5c). A product whose drop time has
  // not arrived is filtered OUT of the payable catalogue entirely, so it can
  // neither be selected nor smuggled in by a crafted payload. It still appears
  // on the shop teaser (gate 2) as an announcement. Filter-level behaviour
  // ONLY — deliberately not shared with getAddonProducts, whose own drop
  // enforcement lives downstream in computeAddonLines (gate 3); the two
  // functions filter differently on purpose, only their column set and row
  // mapping are unified.
  const nowMs = Date.now();
  const rows = ((data ?? []) as unknown as RawProduct[]).filter(
    (p) =>
      productAvailability(
        {
          status: typeof p.status === "string" ? p.status : "active",
          availableFrom: p.available_from ?? null,
          preorder: p.preorder === true,
          // Product-level stock. Variant stock is enforced separately by the
          // line composer, which already owns per-variant availability.
          stockQuantity: p.quantity ?? null,
        },
        nowMs,
      ).purchasable,
  );
  return rows.map(mapProductRow);
}

export async function getAddonProducts(
  artistId: string,
): Promise<AddonProductRow[]> {
  // RS-3 master gate: the appointment add-on checkout is parked. With the
  // switch off nothing payable surfaces, regardless of the per-artist flag,
  // the Connect state, or `CHECKOUT_ADDONS_PROD_READY` below.
  if (!isGoodsCommerceEnabled()) return [];
  // Strict checkout gate: per-artist `checkout_addons` flag, deployment-wide
  // `CHECKOUT_ADDONS_PROD_READY` env in prod (from `canChargeCheckoutAddons`),
  // AND — OT-12.2 — the artist's Stripe Connect account must be in a
  // charge-ready state. An un-connected or restricted artist returns an
  // empty catalogue here, which means nothing payable surfaces at checkout
  // (interest signalling still works via `getInterestEligibleProducts`).
  const { data: artist } = await serviceClient
    .from("profiles")
    .select("settings, stripe_account_status, stripe_charges_enabled")
    .eq("id", artistId)
    .single();
  if (!canChargeCheckoutAddons(artist?.settings)) return [];
  if (
    artist?.stripe_account_status !== "active" ||
    artist?.stripe_charges_enabled !== true
  ) {
    return [];
  }

  // GATE 3 of 3 for drops/preorders (P5c) is enforced downstream in
  // computeAddonLines against `availableFrom`/`preorder` on the mapped row —
  // this function does not pre-filter by availability itself (unlike
  // getInterestEligibleProducts's gate 1 above), by design: the interest
  // catalogue is a display list, while this catalogue feeds the money path,
  // where the check runs immediately before a charge, not at read time.
  const { data } = await serviceClient
    .from("products")
    .select(PRODUCT_SELECT_COLUMNS)
    .eq("artist_id", artistId)
    .eq("is_checkout_addon", true)
    .eq("status", "active")
    // A Stripe PaymentIntent is single-currency, and the deposit is EUR, so only
    // EUR goods can be combined into the appointment checkout. Other-currency
    // goods still appear on the public shop — just not as add-ons.
    .eq("currency", "eur")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as RawProduct[];
  return rows.map(mapProductRow);
}
