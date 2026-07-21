"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { formatPrice } from "@/lib/flash";
import FlashBookingForm from "../../[flashSlug]/flash-booking-form";

export type FlashDayGridItem = {
  id: string;
  title: string;
  slug: string;
  previewImageUrl: string | null;
  shortDescription: string | null;
  priceType: string;
  price: string | number | null;
  currency: string | null;
  sizeInfo: string | null;
  placementNotes: string | null;
  bookable: boolean;
  availabilityLabel: string;
};

// The public flash-day overview: a square-tile grid (big image + price) with a
// hover quick-action; clicking a bookable tile opens a modal with the full
// design info + the SAME booking form the per-design subpage uses (one booking
// path, no duplication). On success the form redirects to the shared
// confirmation page, same as the subpage.
export default function FlashDayGrid({
  items,
  artistSlug,
  artistFirstName,
  dayId,
  termsHref,
  privacyHref,
}: {
  items: FlashDayGridItem[];
  artistSlug: string;
  artistFirstName: string;
  dayId: string;
  /** Host-aware apex-namespace hrefs from the server parent (apexHref),
   *  threaded through to FlashBookingForm's consent links. */
  termsHref: string;
  privacyHref: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const active = items.find((i) => i.id === openId) ?? null;

  // Match the app's other modals: Escape closes + body scroll locks while open.
  useEffect(() => {
    if (!openId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenId(null);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [openId]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => {
          const tile = (
            <div
              className={`group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted ${
                item.bookable ? "" : "opacity-60"
              }`}
            >
              {item.previewImageUrl ? (
                <Image
                  src={item.previewImageUrl}
                  alt={item.title}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                  {item.title}
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8">
                <p className="truncate text-sm font-medium text-white">
                  {item.title}
                </p>
                <p className="text-xs text-white/80">
                  {formatPrice(
                    item.priceType,
                    item.price,
                    item.currency ?? "eur",
                  )}
                </p>
              </div>

              <div className="absolute right-2 top-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    item.bookable
                      ? "bg-brand-mustard text-brand-charcoal"
                      : "bg-black/60 text-white"
                  }`}
                >
                  {item.bookable ? "Book" : item.availabilityLabel}
                </span>
              </div>
            </div>
          );

          return item.bookable ? (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpenId(item.id)}
              className="block rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-mustard"
            >
              {tile}
            </button>
          ) : (
            <div key={item.id}>{tile}</div>
          );
        })}
      </div>

      {active && (
        <>
          <div
            aria-hidden
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setOpenId(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={active.title}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h2 className="truncate text-sm font-medium text-foreground">
                  {active.title}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  aria-label="Close"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                {active.previewImageUrl && (
                  <div className="w-full overflow-hidden rounded-xl border border-border bg-muted">
                    <Image
                      src={active.previewImageUrl}
                      alt={active.title}
                      width={640}
                      height={640}
                      sizes="(min-width: 640px) 480px, 100vw"
                      className="h-auto w-full object-contain"
                    />
                  </div>
                )}
                {active.shortDescription && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {active.shortDescription}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    {formatPrice(
                      active.priceType,
                      active.price,
                      active.currency ?? "eur",
                    )}
                  </span>
                  {active.sizeInfo && <span>{active.sizeInfo}</span>}
                  {active.placementNotes && (
                    <span>{active.placementNotes}</span>
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Request this design
                  </h3>
                  <FlashBookingForm
                    artistSlug={artistSlug}
                    artistFirstName={artistFirstName}
                    flashItemId={active.id}
                    flashDayId={dayId}
                    placementHint={active.placementNotes}
                    termsHref={termsHref}
                    privacyHref={privacyHref}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
