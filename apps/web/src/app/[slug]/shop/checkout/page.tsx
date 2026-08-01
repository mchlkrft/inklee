import { notFound } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import { isGoodsCommerceEnabled } from "@/lib/features";
import { getConnectRoutingForArtist } from "@/lib/stripe-connect";
import { ShopCheckout, type CheckoutProduct } from "./shop-checkout";

// Standalone shop checkout (GC1 slice C3): the public, guest-buyer page. Fully
// dark: 404 while GOODS_COMMERCE_ENABLED is off, so the route is invisible
// until the goods-commerce un-park. Self-contained by decision GC5 (the page
// lists the products itself; integrating the booking page's wishlist cart is a
// UX follow-on), noindex like every checkout surface.
export const metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function ShopCheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isGoodsCommerceEnabled()) notFound();

  const { slug } = await params;
  const { data: artist } = await serviceClient
    .from("profiles")
    .select("id, display_name")
    .eq("slug", slug)
    .maybeSingle();
  if (!artist) notFound();

  const artistName = (artist.display_name as string | null) || "This artist";

  // Charge-readiness decides whether the form renders at all: a shop that
  // cannot be paid must not collect an email and fail at the last step.
  const routing = await getConnectRoutingForArtist(artist.id as string);
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
  const chargeReady = routing.routeCharges && Boolean(publishableKey);

  const { data: rows } = await serviceClient
    .from("products")
    .select(
      "id, title, price_amount, currency, quantity, image_url, product_variants(id, name, price_amount_override, stock_quantity, status, sort_order)",
    )
    .eq("artist_id", artist.id as string)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const products: CheckoutProduct[] = (rows ?? []).map((p) => ({
    id: p.id as string,
    title: (p.title as string) ?? "",
    priceAmount: Number(p.price_amount ?? 0),
    currency: (p.currency as string) ?? "eur",
    imageUrl: (p.image_url as string | null) ?? null,
    soldOut: p.quantity !== null && Number(p.quantity) <= 0,
    variants: (
      (p.product_variants ?? []) as {
        id: string;
        name: string;
        price_amount_override: number | null;
        stock_quantity: number | null;
        status: string;
        sort_order: number;
      }[]
    )
      .filter((v) => v.status === "active")
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({
        id: v.id,
        name: v.name,
        priceAmount:
          v.price_amount_override === null
            ? null
            : Number(v.price_amount_override),
        soldOut: v.stock_quantity !== null && Number(v.stock_quantity) <= 0,
      })),
  }));

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Shop checkout</h1>
        <p className="text-sm text-muted-foreground">
          Buy directly from {artistName}. Pickup and delivery are arranged with
          the artist after your order.
        </p>
      </header>

      {!chargeReady ? (
        <p className="rounded-[14px] border border-border px-4 py-6 text-sm text-muted-foreground">
          This shop isn&apos;t taking card orders yet. Check back soon.
        </p>
      ) : products.length === 0 ? (
        <p className="rounded-[14px] border border-border px-4 py-6 text-sm text-muted-foreground">
          Nothing is for sale right now.
        </p>
      ) : (
        <ShopCheckout
          slug={slug}
          artistName={artistName}
          products={products}
          stripePublishableKey={publishableKey as string}
        />
      )}
    </div>
  );
}
