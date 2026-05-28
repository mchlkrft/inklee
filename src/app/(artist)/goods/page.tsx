import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_STATUS_LABELS,
  formatPrice,
  toPriceNumber,
  isProductCategory,
  isProductStatus,
  type ProductCategory,
  type ProductStatus,
} from "@/lib/goods";

type RawRow = {
  id: string;
  title: string;
  category: string;
  image_url: string | null;
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
      "id, title, category, image_url, price_amount, currency, status, is_public_visible",
    )
    .eq("artist_id", user!.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const products = ((raw ?? []) as unknown as RawRow[]).map((p) => ({
    id: p.id,
    title: p.title,
    category: (isProductCategory(p.category)
      ? p.category
      : "other") as ProductCategory,
    imageUrl: p.image_url,
    price: toPriceNumber(p.price_amount),
    currency: typeof p.currency === "string" ? p.currency : "eur",
    status: (isProductStatus(p.status) ? p.status : "active") as ProductStatus,
    isPublicVisible: p.is_public_visible,
  }));

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
        <Link
          href="/goods/new"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-mustard px-3.5 py-2 text-sm font-medium text-brand-charcoal"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add product
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No goods yet. Add your first product to show it on your public page.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/goods/${p.id}`}
                className="block overflow-hidden rounded-[14px] border border-border transition-colors hover:bg-muted/20"
              >
                <div className="relative aspect-square bg-muted/30">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.title}
                      fill
                      sizes="(max-width: 640px) 50vw, 200px"
                      className={`object-cover ${p.status === "sold_out" ? "opacity-50" : ""}`}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {PRODUCT_CATEGORY_LABELS[p.category]}
                    </div>
                  )}
                  {p.status !== "active" && (
                    <span className="absolute right-2 top-2 rounded-full bg-brand-charcoal/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-bone">
                      {PRODUCT_STATUS_LABELS[p.status]}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5 px-3 py-2.5">
                  <p className="truncate text-sm font-medium text-foreground">
                    {p.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(p.price, p.currency)}
                  </p>
                  {!p.isPublicVisible && (
                    <p className="text-[11px] text-muted-foreground">
                      Not on public page
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
