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

  // Track per-product UI states:
  //  • pendingPicks — checkbox has been clicked but the variant hasn't been
  //    chosen yet. Drives "checked but not yet committed" visual state so the
  //    variant picker can appear before we touch the selections payload.
  //  • poppedForItems — products that have already triggered the "Keep
  //    shopping?" popup, so toggling qty later doesn't re-fire it. Cleared
  //    when an item is unchecked.
  const [pendingPicks, setPendingPicks] = useState<Set<string>>(new Set());
  const [poppedForItems, setPoppedForItems] = useState<Set<string>>(new Set());
  const [showKeepShoppingPopup, setShowKeepShoppingPopup] = useState(false);

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

  // Fire the "Keep shopping?" popup the first time a product becomes fully
  // selected (checkbox + variant, if needed). Subsequent qty/variant tweaks
  // don't re-fire — the artist's Set tracks which products have popped.
  function maybeFirePopup(productId: string) {
    if (poppedForItems.has(productId)) return;
    setPoppedForItems((prev) => {
      const next = new Set(prev);
      next.add(productId);
      return next;
    });
    setShowKeepShoppingPopup(true);
  }

  function resetItem(productId: string) {
    upsertSelection(productId, { variantId: null, quantity: 0 });
    setPendingPicks((prev) => {
      if (!prev.has(productId)) return prev;
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
    setPoppedForItems((prev) => {
      if (!prev.has(productId)) return prev;
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  }

  // Cart-style summary list rendered above the grid — gives the client a
  // running overview of every selection without having to scan the whole shop.
  type CartLine = {
    key: string;
    title: string;
    variant: string | null;
    quantity: number;
  };
  const cartLines: CartLine[] = selections
    .map((s): CartLine | null => {
      const product = products.find((p) => p.id === s.productId);
      if (!product) return null;
      const variant = s.variantId
        ? (product.variants.find((v) => v.id === s.variantId) ?? null)
        : null;
      return {
        key: `${s.productId}::${s.variantId ?? ""}`,
        title: product.title,
        variant: variant?.name ?? null,
        quantity: s.quantity,
      };
    })
    .filter((l): l is CartLine => l !== null);

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
            <h2 className="text-center text-4xl font-bold tracking-tight text-brand-bone md:text-5xl lg:text-6xl">
              {artistName} shop
            </h2>
            {/* Cart-style running summary — appears as soon as the client
                marks anything. One line per (product, variant) combo. */}
            {cartLines.length > 0 && (
              <ul className="mx-auto mt-6 inline-flex max-w-md flex-col gap-1 self-center text-sm text-brand-bone/85 lg:mt-8">
                {cartLines.map((line) => (
                  <li key={line.key} className="flex items-baseline gap-1.5">
                    <span className="text-brand-mustard">✓</span>
                    <span className="font-medium text-brand-bone">
                      {line.title}
                    </span>
                    {line.variant && (
                      <span className="text-brand-bone/70">
                        · {line.variant}
                      </span>
                    )}
                    {line.quantity > 1 && (
                      <span className="text-brand-bone/55">
                        × {line.quantity}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <ul className="mx-auto mt-8 grid w-full max-w-7xl grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-12 lg:grid-cols-5 lg:gap-4">
              {products.map((p) => {
                const sel = findSelection(selections, p.id);
                const canMark = p.interestEligible && !p.soldOut;
                const needsVariant = p.variants.length > 0;
                const selectedVariantId = sel?.variantId ?? null;
                const qty = sel?.quantity ?? 0;
                const max = maxQtyFor(p, selectedVariantId);
                const unitPrice = unitPriceFor(p, selectedVariantId);
                // Three card states drive the UI:
                //   • isFullySelected: variant picked (or product has no
                //     variants), qty ≥ 1. Card highlighted, picker collapsed,
                //     stepper hover-revealed.
                //   • isPickingVariant: checkbox clicked on a variant product
                //     but no variant yet. Card not yet highlighted, variant
                //     chips visible until one is picked.
                //   • neither: default unselected state.
                const isPickingVariant = pendingPicks.has(p.id);
                const isFullySelected =
                  qty > 0 && (!needsVariant || !!selectedVariantId);
                const isVisuallyChecked = isFullySelected || isPickingVariant;
                const showVariantPicker =
                  canMark &&
                  needsVariant &&
                  (isPickingVariant || (isFullySelected && !selectedVariantId));
                const showHoverControls = canMark && isFullySelected;

                const handleToggle = (
                  e: React.ChangeEvent<HTMLInputElement>,
                ) => {
                  if (e.target.checked) {
                    if (needsVariant) {
                      // Variant required — show the picker first; commit
                      // happens on variant click below.
                      setPendingPicks((prev) => {
                        const next = new Set(prev);
                        next.add(p.id);
                        return next;
                      });
                    } else {
                      // No variant — default qty 1, commit now + fire popup.
                      upsertSelection(p.id, {
                        variantId: null,
                        quantity: 1,
                      });
                      maybeFirePopup(p.id);
                    }
                  } else {
                    resetItem(p.id);
                  }
                };

                const handleVariantPick = (variantId: string) => {
                  const wasFullySelected =
                    qty > 0 && selectedVariantId !== null;
                  upsertSelection(p.id, {
                    variantId,
                    quantity: Math.max(qty, 1),
                  });
                  setPendingPicks((prev) => {
                    if (!prev.has(p.id)) return prev;
                    const next = new Set(prev);
                    next.delete(p.id);
                    return next;
                  });
                  if (!wasFullySelected) maybeFirePopup(p.id);
                };

                return (
                  <li
                    key={selectionKey(p.id)}
                    style={itemBg ? { backgroundColor: itemBg } : undefined}
                    className={`group flex flex-col overflow-hidden rounded-[16px] border bg-brand-charcoal text-brand-bone shadow-sm transition-[border-color,box-shadow] duration-200 ${
                      isFullySelected
                        ? "border-brand-mustard shadow-[0_0_0_1px_rgba(228,179,42,0.45)]"
                        : "border-brand-bone/15"
                    }`}
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
                            checked={isVisuallyChecked}
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
                              {isFullySelected && selectedVariantId && (
                                <span className="text-brand-mustard">
                                  {" "}
                                  ·{" "}
                                  {p.variants.find(
                                    (v) => v.id === selectedVariantId,
                                  )?.name ?? ""}
                                </span>
                              )}
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

                      {/* Variant picker — visible while the artist is still
                          choosing the variant (before commit). Once a variant
                          is picked, the chips collapse into the hover-revealed
                          block below so the resting state stays minimal. */}
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
                                onClick={() => handleVariantPick(v.id)}
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

                      {/* Reveal-on-hover controls — qty stepper + (for variant
                          products) re-pick chips. Selected card stays clean
                          by default; hovering shows the controls. Touch
                          devices keep them visible unconditionally (see the
                          .reveal-on-hover utility in globals.css). */}
                      {showHoverControls && (
                        <div className="reveal-on-hover mt-auto space-y-1.5">
                          {needsVariant && (
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
                                    onClick={() => handleVariantPick(v.id)}
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
                          <div className="flex items-center justify-between gap-2 rounded-md border border-brand-bone/15 bg-black/15 px-1.5 py-1">
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
                              {qty}
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
            {/* Persistent Done button — gives the client an explicit "I'm
                finished" action rather than forcing them through the top-right
                close. Shows the running item count when anything is picked. */}
            <div className="mt-8 flex justify-center lg:mt-10">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-brand-mustard px-8 py-3 text-base font-semibold text-brand-charcoal shadow-sm transition-opacity hover:opacity-90"
              >
                {totalSelectedQty > 0
                  ? `Done · ${totalSelectedQty} ${totalSelectedQty === 1 ? "item" : "items"}`
                  : "Done"}
              </button>
            </div>
          </div>

          {/* Keep-shopping popup — fires once per product the moment it
              becomes fully selected. "That's all" closes the whole overlay
              (jumps the client back to their booking); "Keep shopping" just
              dismisses the popup so they can keep browsing the grid. */}
          {showKeepShoppingPopup && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Anything else?"
              onClick={() => setShowKeepShoppingPopup(false)}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-charcoal/60 p-4 backdrop-blur-sm"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm space-y-4 rounded-[20px] border border-brand-bone/15 bg-brand-charcoal p-5 text-brand-bone shadow-2xl"
              >
                <div className="space-y-1.5">
                  <p className="text-base font-semibold">
                    Got it — anything else?
                  </p>
                  <p className="text-sm text-brand-bone/70">
                    Keep browsing or jump back to your booking. Your picks
                    travel with you.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowKeepShoppingPopup(false);
                      setOpen(false);
                    }}
                    className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-semibold text-brand-charcoal transition-opacity hover:opacity-90"
                  >
                    That&apos;s all
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowKeepShoppingPopup(false)}
                    className="rounded-full border border-brand-bone/25 px-5 py-2.5 text-sm font-medium text-brand-bone transition-colors hover:bg-brand-bone/10"
                  >
                    Keep shopping
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
