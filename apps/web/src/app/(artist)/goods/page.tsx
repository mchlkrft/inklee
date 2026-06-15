import { createClient } from "@/lib/supabase/server";
import {
  toPriceNumber,
  isProductStatus,
  type ProductStatus,
} from "@/lib/goods";
import GoodsNewButton from "./goods-new-button";
import GoodsTile, { type GoodsTileItem } from "./goods-tile";

type RawRow = {
  id: string;
  title: string;
  image_url: string | null;
  image_urls: string[] | null;
  price_amount: string | number;
  currency: string | null;
  status: string;
  is_public_visible: boolean;
};

export default async function GoodsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: raw } = await supabase
    .from("products")
    .select(
      "id, title, image_url, image_urls, price_amount, currency, status, is_public_visible",
    )
    .eq("artist_id", user!.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const products: GoodsTileItem[] = ((raw ?? []) as unknown as RawRow[]).map(
    (p) => {
      const imageUrls =
        Array.isArray(p.image_urls) && p.image_urls.length > 0
          ? p.image_urls
          : p.image_url
            ? [p.image_url]
            : [];
      return {
        id: p.id,
        title: p.title,
        price: toPriceNumber(p.price_amount),
        currency: typeof p.currency === "string" ? p.currency : "eur",
        imageUrl: imageUrls[0] ?? null,
        imageCount: imageUrls.length,
        status: (isProductStatus(p.status)
          ? p.status
          : "active") as ProductStatus,
        isPublicVisible: p.is_public_visible,
      };
    },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Goods
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Products your clients can pick up at their appointment. Shown on
            your public page and offered as add-ons when a client pays a
            deposit.
          </p>
        </div>
        {products.length > 0 && <GoodsNewButton />}
      </div>

      {products.length === 0 ? (
        <div className="space-y-4 rounded-[20px] border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No goods yet. Add your first product to show it on your public page
            and offer it at checkout.
          </p>
          <div className="flex justify-center">
            <GoodsNewButton label="Add your first product" />
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {products.map((p) => (
            // Key on status so an edit (or quick toggle) that changes it on the
            // server remounts the tile with fresh local state.
            <li key={`${p.id}-${p.status}`}>
              <GoodsTile item={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
