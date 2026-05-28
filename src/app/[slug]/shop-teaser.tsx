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
  artistFirstName,
}: {
  products: PublicProduct[];
  artistFirstName: string;
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-border px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <span className="flex items-center gap-2.5">
          <ShoppingBag
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="text-sm text-foreground">
            {artistFirstName} also has goods for pickup
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          View shop ({products.length})
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Shop"
          className="fixed inset-0 z-50 overflow-y-auto bg-background"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-6 py-4 backdrop-blur">
            <h2 className="text-base font-semibold text-foreground">Shop</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mx-auto w-full max-w-lg px-6 py-6">
            <p className="mb-4 text-sm text-muted-foreground">
              Available for pickup at your appointment. Add them when you
              confirm your booking.
            </p>
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
                    {p.pickupNote && (
                      <p className="truncate text-[11px] text-muted-foreground">
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
