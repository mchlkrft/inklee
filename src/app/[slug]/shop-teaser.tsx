// Bio Page shop overlay. Triggered by the "Shop" header card on the public
// page. Each product card carries interest-marking controls (variant picker +
// qty stepper) for items the artist has flagged as appointment add-ons —
// sold-out + non-eligible items still appear, but read-only. Selections are
// owned by BookingForm above and serialised into a hidden interests_json field
// at submit time; the server validates and writes booking_interests rows.

"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ShoppingBag,
  X,
} from "lucide-react";
import {
  PRODUCT_CATEGORY_LABELS,
  formatPrice,
  type PublicProduct,
} from "@/lib/goods";
import {
  MAX_INTEREST_QUANTITY,
  type InterestSelection,
} from "@/lib/booking-interests";
import { useInterestSelections } from "./interest-selections-context";

function selectionKey(productId: string): string {
  return productId; // one selection per product (single variant if applicable)
}

function findSelection(
  selections: InterestSelection[],
  productId: string,
): InterestSelection | undefined {
  return selections.find((s) => s.productId === productId);
}

function maxQtyFor(product: PublicProduct, variantId: string | null): number {
  if (variantId) {
    const v = product.variants.find((vv) => vv.id === variantId);
    if (v && v.stock !== null) {
      return Math.min(MAX_INTEREST_QUANTITY, Math.max(0, v.stock));
    }
  } else if (product.variants.length === 0 && product.soldOut) {
    return 0;
  }
  return MAX_INTEREST_QUANTITY;
}

function unitPriceFor(
  product: PublicProduct,
  variantId: string | null,
): number {
  if (variantId) {
    const v = product.variants.find((vv) => vv.id === variantId);
    if (v && v.priceOverride !== null) return v.priceOverride;
  }
  return product.price;
}

// Per-card image carousel. When the product has a single image (or none), it
// renders the same as before; with more images, prev/next arrows + dot
// indicators appear. The arrows stopPropagation so clicking them doesn't open
// the underlying card or toggle the interest checkbox.
function CardImage({
  urls,
  alt,
  soldOut,
  fallbackLabel,
}: {
  urls: string[];
  alt: string;
  soldOut: boolean;
  fallbackLabel: string;
}) {
  const [idx, setIdx] = useState(0);
  const safeIdx = urls.length > 0 ? idx % urls.length : 0;
  const current = urls.length > 0 ? urls[safeIdx] : null;
  const hasMultiple = urls.length > 1;

  function step(delta: 1 | -1) {
    if (!hasMultiple) return;
    setIdx((prev) => (prev + delta + urls.length) % urls.length);
  }

  return (
    <div className="relative aspect-square bg-black/20">
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current}
          alt={alt}
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover ${soldOut ? "opacity-50" : ""}`}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-brand-bone/50">
          {fallbackLabel}
        </div>
      )}
      {soldOut && (
        <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-bone">
          Sold out
        </span>
      )}
      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              step(-1);
            }}
            aria-label="Previous image"
            className="absolute left-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-brand-bone backdrop-blur transition-colors hover:bg-black/60"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              step(1);
            }}
            aria-label="Next image"
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-brand-bone backdrop-blur transition-colors hover:bg-black/60"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {urls.map((_, i) => (
              <span
                key={i}
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === safeIdx ? "bg-brand-bone" : "bg-brand-bone/40"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ShopTeaser({
  products,
  itemBg = null,
  artistName,
}: {
  products: PublicProduct[];
  // Background for the overlay product cards — the artist's chosen header
  // color, or null to fall back to charcoal (used when there's a cover image).
  itemBg?: string | null;
  // Drives the editorial-sized overlay headline: "{artistName} shop".
  artistName: string;
}) {
  // Interest selections are owned by InterestSelectionsProvider higher in the
  // tree so BookingForm (rendered elsewhere on the page) can read them on
  // submit. One selection per product, qty in [0, MAX_INTEREST_QUANTITY].
  const { selections, setSelections: onSelectionsChange } =
    useInterestSelections();
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

  // Header card "Shop · N selected" hint when the client has marked items.
  const totalSelectedQty = selections.reduce(
    (n, s) => n + (s.quantity > 0 ? s.quantity : 0),
    0,
  );

  function upsertSelection(
    productId: string,
    patch: Partial<InterestSelection>,
  ) {
    const idx = selections.findIndex((s) => s.productId === productId);
    if (idx === -1) {
      onSelectionsChange([
        ...selections,
        {
          productId,
          variantId: patch.variantId ?? null,
          quantity: patch.quantity ?? 0,
        },
      ]);
      return;
    }
    const next = selections.slice();
    next[idx] = { ...next[idx], ...patch };
    // Drop rows that are zero-qty so the payload stays clean.
    if (!next[idx].quantity || next[idx].quantity <= 0) {
      next.splice(idx, 1);
    }
    onSelectionsChange(next);
  }

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
        {totalSelectedQty > 0 && (
          <span className="rounded-full bg-brand-mustard px-1.5 py-0.5 text-[11px] font-semibold leading-none text-brand-charcoal">
            {totalSelectedQty}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Shop"
          className="fixed inset-0 z-50 overflow-y-auto bg-brand-charcoal/40 text-left backdrop-blur-sm"
        >
          {/* Close button floats top-right so the headline can own the top of
              the overlay without a horizontal bar above it. */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-brand-charcoal/70 text-brand-bone backdrop-blur transition-colors hover:bg-brand-charcoal"
          >
            <X className="h-5 w-5" />
          </button>

          {/* min-h-screen + justify-center pulls the headline + first row of
              items toward viewport vertical middle on open. Additional rows
              flow downward and the overlay scrolls naturally. */}
          <div className="flex min-h-screen flex-col justify-center px-6 py-16 lg:px-12">
            <h2 className="mb-8 text-center text-4xl font-bold tracking-tight text-brand-bone md:text-5xl lg:mb-12 lg:text-6xl">
              {artistName} shop
            </h2>
            <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
              {products.map((p) => {
                const sel = findSelection(selections, p.id);
                const canMark = p.interestEligible && !p.soldOut;
                const needsVariant = p.variants.length > 0;
                const selectedVariantId = sel?.variantId ?? null;
                const qty = sel?.quantity ?? 0;
                const max = maxQtyFor(p, selectedVariantId);
                const unitPrice = unitPriceFor(p, selectedVariantId);
                // Progressive disclosure: checkbox first, variant picker only
                // after checked, qty stepper only once a variant is set (or
                // the product is variant-less).
                const isChecked = qty > 0;
                const showVariantPicker = canMark && isChecked && needsVariant;
                const showQtyStepper =
                  canMark &&
                  isChecked &&
                  (!needsVariant || !!selectedVariantId);

                const handleToggle = (
                  e: React.ChangeEvent<HTMLInputElement>,
                ) => {
                  if (e.target.checked) {
                    upsertSelection(p.id, {
                      variantId: selectedVariantId,
                      quantity: 1,
                    });
                  } else {
                    upsertSelection(p.id, {
                      variantId: null,
                      quantity: 0,
                    });
                  }
                };

                return (
                  <li
                    key={selectionKey(p.id)}
                    style={itemBg ? { backgroundColor: itemBg } : undefined}
                    className="flex flex-col overflow-hidden rounded-[16px] border border-brand-bone/15 bg-brand-charcoal text-brand-bone shadow-sm"
                  >
                    <CardImage
                      urls={p.imageUrls}
                      alt={p.title}
                      soldOut={p.soldOut}
                      fallbackLabel={PRODUCT_CATEGORY_LABELS[p.category]}
                    />
                    <div className="flex flex-1 flex-col gap-2.5 px-3 py-3">
                      {/* Title row — checkbox sits inline with title + price so
                          the unchecked state stays minimal. For non-eligible
                          (sold-out / informational) products the checkbox is
                          dropped and the text stands alone. */}
                      {canMark ? (
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={handleToggle}
                            aria-label={`Mark interest in ${p.title}`}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-mustard"
                          />
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="truncate text-sm font-medium text-brand-bone">
                              {p.title}
                            </p>
                            <p className="text-xs text-brand-bone/70">
                              {formatPrice(unitPrice, p.currency)}
                            </p>
                            {p.pickupNote && (
                              <p className="truncate text-[11px] text-brand-bone/55">
                                {p.pickupNote}
                              </p>
                            )}
                          </div>
                        </label>
                      ) : (
                        <div className="space-y-0.5">
                          <p className="truncate text-sm font-medium text-brand-bone">
                            {p.title}
                          </p>
                          <p className="text-xs text-brand-bone/70">
                            {formatPrice(unitPrice, p.currency)}
                          </p>
                          {p.pickupNote && (
                            <p className="truncate text-[11px] text-brand-bone/55">
                              {p.pickupNote}
                            </p>
                          )}
                        </div>
                      )}

                      {showVariantPicker && (
                        <div className="flex flex-wrap gap-1.5">
                          {p.variants.map((v) => {
                            const variantSoldOut =
                              v.stock !== null && v.stock <= 0;
                            const isActive = selectedVariantId === v.id;
                            return (
                              <button
                                key={v.id}
                                type="button"
                                disabled={variantSoldOut}
                                onClick={() =>
                                  upsertSelection(p.id, {
                                    variantId: v.id,
                                    quantity: Math.max(qty, 1),
                                  })
                                }
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                                  isActive
                                    ? "border-brand-mustard bg-brand-mustard text-brand-charcoal"
                                    : "border-brand-bone/25 bg-brand-bone/5 text-brand-bone/80 hover:border-brand-bone/50 hover:text-brand-bone"
                                }`}
                              >
                                {v.name}
                                {variantSoldOut && " · sold out"}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {showQtyStepper && (
                        <div className="mt-auto flex items-center justify-between gap-2 rounded-md border border-brand-bone/15 bg-black/15 px-1.5 py-1">
                          <button
                            type="button"
                            onClick={() =>
                              upsertSelection(p.id, {
                                variantId: selectedVariantId,
                                quantity: Math.max(0, qty - 1),
                              })
                            }
                            aria-label={`Remove one ${p.title}`}
                            className="rounded p-1 text-brand-bone/70 transition-colors hover:text-brand-bone"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <span className="text-xs tabular-nums text-brand-bone">
                            {qty} interested
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              upsertSelection(p.id, {
                                variantId: selectedVariantId,
                                quantity: qty + 1,
                              })
                            }
                            disabled={qty >= max}
                            aria-label={`Add one ${p.title}`}
                            className="rounded p-1 text-brand-bone/70 transition-colors hover:text-brand-bone disabled:opacity-30"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mx-auto mt-8 max-w-xl text-center text-sm text-brand-bone/70 lg:mt-12">
              Mark anything you&apos;d like to grab at your appointment. The
              artist confirms what&apos;s available when accepting your request.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
