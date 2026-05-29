// Bio Page shop (Slice 73, repositioned). Instead of a section squeezed at the
// end of the public page, the shop is a clickable note placed above the booking
// form. Tapping it opens a full-screen overlay previewing all available goods.
// Informational only — the purchase path is Appointment Add-ons after a booking
// is approved (no standalone checkout here).

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ShoppingBag, X } from "lucide-react";
import {
  PRODUCT_CATEGORY_LABELS,
  formatPrice,
  type PublicProduct,
} from "@/lib/goods";

export default function ShopTeaser({
  products,
  itemBg = null,
}: {
  products: PublicProduct[];
  // Background for the overlay product cards — the artist's chosen header color,
  // or null to fall back to charcoal (used when the header is a cover image).
  itemBg?: string | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (products.length === 0) return null;

  return (
    <>
      {/* Header goods card — sits beside the travel card, opens the shop overlay. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-brand-bone/25 bg-brand-bone/10 px-4 py-2 text-sm font-medium text-brand-bone transition-colors hover:bg-brand-bone/20"
      >
        <ShoppingBag className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        Shop ({products.length})
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Shop"
          className="fixed inset-0 z-50 overflow-y-auto bg-brand-charcoal/40 text-left backdrop-blur-sm"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4">
            <h2 className="text-base font-semibold text-brand-bone">Shop</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md text-brand-bone/80 transition-colors hover:bg-brand-bone/10 hover:text-brand-bone"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mx-auto w-full max-w-lg px-6 py-6">
            <p className="mb-4 text-sm text-brand-bone/80">
              Available for pickup at your appointment. Add them when you
              confirm your booking.
            </p>
            <ul className="grid grid-cols-2 gap-3">
              {products.map((p) => (
                <li
                  key={p.id}
                  style={itemBg ? { backgroundColor: itemBg } : undefined}
                  className="overflow-hidden rounded-[16px] border border-brand-bone/15 bg-brand-charcoal text-brand-bone shadow-sm"
                >
                  <div className="relative aspect-square bg-black/20">
                    {p.imageUrl ? (
                      <Image
                        src={p.imageUrl}
                        alt={p.title}
                        fill
                        sizes="(max-width: 512px) 50vw, 256px"
                        className={`object-cover ${p.soldOut ? "opacity-50" : ""}`}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-brand-bone/50">
                        {PRODUCT_CATEGORY_LABELS[p.category]}
                      </div>
                    )}
                    {p.soldOut && (
                      <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-bone">
                        Sold out
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5 px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-brand-bone">
                      {p.title}
                    </p>
                    <p className="text-xs text-brand-bone/70">
                      {formatPrice(p.price, p.currency)}
                    </p>
                    {p.pickupNote && (
                      <p className="truncate text-[11px] text-brand-bone/55">
                        {p.pickupNote}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
