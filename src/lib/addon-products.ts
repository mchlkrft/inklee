// Server-only: fetch an artist's checkout-addon products (active, with active
// variants) for the pre-checkout add-ons flow. Used by the request portal page
// (render the selector) and prepareCheckoutAction (validate + price). Reads via
// the service-role client — the customer has no auth session.

import { serviceClient } from "@/lib/supabase/service";
import {
  isProductStatus,
  toPriceNumber,
  type ProductStatus,
} from "@/lib/goods";
import { canChargeCheckoutAddons, canUseGoods } from "@/lib/features";
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
  product_variants: RawVariant[] | null;
};

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
  const { data: artist } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", artistId)
    .single();
  if (!canUseGoods(artist?.settings)) return [];

  const { data } = await serviceClient
    .from("products")
    .select(
      "id, title, image_url, price_amount, currency, status, is_checkout_addon, quantity, product_variants(id, name, price_amount_override, stock_quantity, status, sort_order)",
    )
    .eq("artist_id", artistId)
    .eq("is_public_visible", true)
    .eq("status", "active")
    .eq("currency", "eur")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as RawProduct[];
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    imageUrl: p.image_url,
    price: toPriceNumber(p.price_amount),
    currency: typeof p.currency === "string" ? p.currency : "eur",
    status: (isProductStatus(p.status) ? p.status : "active") as ProductStatus,
    isCheckoutAddon: p.is_checkout_addon,
    quantity: p.quantity,
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
  }));
}

export async function getAddonProducts(
  artistId: string,
): Promise<AddonProductRow[]> {
  // Strict checkout gate: per-artist `checkout_addons` flag AND the
  // production money-gate (`CHECKOUT_ADDONS_PROD_READY` env in prod). Both
  // the portal selector and prepareCheckoutAction route through this one
  // helper, so an artist whose money path isn't ready returns an empty
  // catalogue here — interest signalling still works via
  // getInterestEligibleProducts, but nothing in this set means nothing
  // payable surfaces at checkout.
  const { data: artist } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", artistId)
    .single();
  if (!canChargeCheckoutAddons(artist?.settings)) return [];

  const { data } = await serviceClient
    .from("products")
    .select(
      "id, title, image_url, price_amount, currency, status, is_checkout_addon, quantity, product_variants(id, name, price_amount_override, stock_quantity, status, sort_order)",
    )
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
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    imageUrl: p.image_url,
    price: toPriceNumber(p.price_amount),
    currency: typeof p.currency === "string" ? p.currency : "eur",
    status: (isProductStatus(p.status) ? p.status : "active") as ProductStatus,
    isCheckoutAddon: p.is_checkout_addon,
    quantity: p.quantity,
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
  }));
}
