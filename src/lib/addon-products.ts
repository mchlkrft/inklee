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

export async function getAddonProducts(
  artistId: string,
): Promise<AddonProductRow[]> {
  const { data } = await serviceClient
    .from("products")
    .select(
      "id, title, image_url, price_amount, currency, status, is_checkout_addon, quantity, product_variants(id, name, price_amount_override, stock_quantity, status, sort_order)",
    )
    .eq("artist_id", artistId)
    .eq("is_checkout_addon", true)
    .eq("status", "active")
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
