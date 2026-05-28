import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  isProductCategory,
  isProductStatus,
  toPriceNumber,
  type ProductCategory,
  type ProductStatus,
} from "@/lib/goods";
import ProductForm, { type ProductFormValues } from "../product-form";
import DeleteProductButton from "../delete-product-button";

type RawProduct = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  image_url: string | null;
  price_amount: string | number;
  status: string;
  pickup_note: string | null;
  quantity: number | null;
  is_public_visible: boolean;
  is_checkout_addon: boolean;
};

type RawVariant = {
  name: string;
  price_amount_override: string | number | null;
  stock_quantity: number | null;
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rawProduct } = await supabase
    .from("products")
    .select(
      "id, title, description, category, image_url, price_amount, status, pickup_note, quantity, is_public_visible, is_checkout_addon",
    )
    .eq("id", id)
    .eq("artist_id", user!.id)
    .single();
  if (!rawProduct) notFound();
  const row = rawProduct as unknown as RawProduct;

  const { data: rawVariants } = await supabase
    .from("product_variants")
    .select("name, price_amount_override, stock_quantity")
    .eq("product_id", id)
    .order("sort_order", { ascending: true });

  const product: ProductFormValues = {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    category: (isProductCategory(row.category)
      ? row.category
      : "other") as ProductCategory,
    price: String(toPriceNumber(row.price_amount)),
    status: (isProductStatus(row.status)
      ? row.status
      : "active") as ProductStatus,
    pickupNote: row.pickup_note ?? "",
    quantity:
      row.quantity !== null && row.quantity !== undefined
        ? String(row.quantity)
        : "",
    isPublicVisible: row.is_public_visible,
    isCheckoutAddon: row.is_checkout_addon,
    imageUrl: row.image_url,
  };

  const variants = ((rawVariants ?? []) as unknown as RawVariant[]).map(
    (v) => ({
      name: v.name,
      priceOverride:
        v.price_amount_override !== null &&
        v.price_amount_override !== undefined
          ? String(toPriceNumber(v.price_amount_override))
          : "",
      stock:
        v.stock_quantity !== null && v.stock_quantity !== undefined
          ? String(v.stock_quantity)
          : "",
    }),
  );

  return (
    <div className="space-y-6">
      <Link
        href="/goods"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Goods
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Edit product
      </h1>
      <ProductForm mode="edit" product={product} variants={variants} />
      <div className="max-w-2xl border-t border-border pt-6">
        <DeleteProductButton id={row.id} />
      </div>
    </div>
  );
}
