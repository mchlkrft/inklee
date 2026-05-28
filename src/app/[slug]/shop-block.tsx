// Bio Page module (Slice 73) — the public Shop section. Renders the artist's
// public, non-hidden products as informational cards. There is no standalone
// checkout here: the v1 purchase path is Appointment Add-ons after a booking is
// approved (Slice 74). Server component; renders null when there are no products
// so no empty "Shop" heading appears publicly.

import Image from "next/image";
import {
  PRODUCT_CATEGORY_LABELS,
  formatPrice,
  type PublicProduct,
} from "@/lib/goods";

export default function ShopBlock({ products }: { products: PublicProduct[] }) {
  if (products.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Shop</h2>
        <p className="text-xs text-muted-foreground">
          Available for pickup at your appointment.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {products.map((p) => (
          <li
            key={p.id}
            className="overflow-hidden rounded-[16px] border border-border"
          >
            <div className="relative aspect-square bg-muted/30">
              {p.imageUrl ? (
                <Image
                  src={p.imageUrl}
                  alt={p.title}
                  fill
                  sizes="(max-width: 512px) 50vw, 256px"
                  className={`object-cover ${p.soldOut ? "opacity-50" : ""}`}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  {PRODUCT_CATEGORY_LABELS[p.category]}
                </div>
              )}
              {p.soldOut && (
                <span className="absolute right-2 top-2 rounded-full bg-brand-charcoal/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-bone">
                  Sold out
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
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Add these when you confirm your booking.
      </p>
    </section>
  );
}
