// Bio Page shop overlay. Triggered by the "Shop" header card on the public
// page. Each product card carries an Add-to-cart button (with optional variant
// chips); clicks insert or increment a (product, variant) row in the shared
// InterestSelections, which BookingForm serialises on submit. Cart-style list
// above the grid acts as the running summary; X top-right, a "Done" link below
// the cart, and the persistent Done button at the bottom all close the overlay.

"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, ShoppingBag, X } from "lucide-react";
import {
  PRODUCT_CATEGORY_LABELS,
  formatPrice,
  type PublicProduct,
} from "@/lib/goods";
import { MAX_INTEREST_QUANTITY } from "@/lib/booking-interests";
import { useInterestSelections } from "./interest-selections-context";

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

// Per-card image carousel. Single-image (or no image) renders just the image
// area; with multiple images the prev/next arrows + dot indicators appear.
// The arrows stopPropagation so clicking them never accidentally triggers an
// Add-to-cart on the card.
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

// One product card. Owns its own variant pick state — the artist picks a
// variant (if applicable), clicks Add to cart, and the card resets to default.
// Same product can be re-added for a different variant; identical combos
// increment the existing cart entry's qty.
function ProductCard({
  p,
  itemBg,
  currentInCart,
  onAdd,
}: {
  p: PublicProduct;
  itemBg: string | null;
  currentInCart: (productId: string, variantId: string | null) => number;
  onAdd: (productId: string, variantId: string | null) => void;
}) {
  const [pickedVariantId, setPickedVariantId] = useState<string | null>(null);
  const needsVariant = p.variants.length > 0;
  const canMark = p.interestEligible && !p.soldOut;
  const unitPrice = unitPriceFor(p, pickedVariantId);

  // Stock cap for the currently-picked combo. Only variant stock is exposed
  // to the public shop today — product-level stock is enforced server-side
  // by computeInterestRows when the booking is submitted.
  let stockCap = MAX_INTEREST_QUANTITY;
  if (needsVariant && pickedVariantId) {
    const v = p.variants.find((vv) => vv.id === pickedVariantId);
    if (v && v.stock !== null) stockCap = Math.min(stockCap, v.stock);
  }
  const inCartForCombo = currentInCart(p.id, pickedVariantId);
  const canAdd =
    canMark &&
    inCartForCombo < stockCap &&
    (!needsVariant || pickedVariantId !== null);

  function handleAdd() {
    if (!canAdd) return;
    onAdd(p.id, pickedVariantId);
    // Reset to default state so the next variant + Add cycle starts fresh.
    setPickedVariantId(null);
  }

  const buttonLabel =
    needsVariant && !pickedVariantId
      ? "Pick an option"
      : !canMark
        ? "Unavailable"
        : inCartForCombo > 0
          ? `Add another (${inCartForCombo} in cart)`
          : "Add to cart";

  return (
    <li
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

        {canMark && needsVariant && (
          <div className="flex flex-wrap gap-1.5">
            {p.variants.map((v) => {
              const variantSoldOut = v.stock !== null && v.stock <= 0;
              const isActive = pickedVariantId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={variantSoldOut}
                  onClick={() => setPickedVariantId(isActive ? null : v.id)}
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

        {canMark && (
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-mustard px-3 py-2 text-xs font-semibold text-brand-charcoal transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {buttonLabel}
          </button>
        )}
      </div>
    </li>
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
  // submit. Multiple rows per product are allowed — one per chosen variant.
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

  const totalSelectedQty = selections.reduce(
    (n, s) => n + (s.quantity > 0 ? s.quantity : 0),
    0,
  );

  function addToCart(productId: string, variantId: string | null) {
    const idx = selections.findIndex(
      (s) => s.productId === productId && s.variantId === variantId,
    );
    if (idx === -1) {
      onSelectionsChange([
        ...selections,
        { productId, variantId, quantity: 1 },
      ]);
      return;
    }
    const next = selections.slice();
    next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
    onSelectionsChange(next);
  }

  function removeFromCart(productId: string, variantId: string | null) {
    onSelectionsChange(
      selections.filter(
        (s) => !(s.productId === productId && s.variantId === variantId),
      ),
    );
  }

  function currentInCart(productId: string, variantId: string | null): number {
    return (
      selections.find(
        (s) => s.productId === productId && s.variantId === variantId,
      )?.quantity ?? 0
    );
  }

  type CartLine = {
    key: string;
    productId: string;
    variantId: string | null;
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
        productId: s.productId,
        variantId: s.variantId,
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
          {/* Close button floats top-right — third of three navigation paths
              (X here, "Done" link below the cart list, big Done button at the
              bottom of the overlay). */}
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

            {/* Cart-style summary. One row per (product, variant) combo, with
                an X to remove. Small "Done" link below for quick return to the
                booking form. */}
            {cartLines.length > 0 && (
              <div className="mx-auto mt-6 inline-flex max-w-md flex-col items-stretch gap-2 self-center lg:mt-8">
                <ul className="space-y-1 text-sm text-brand-bone/85">
                  {cartLines.map((line) => (
                    <li key={line.key} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          removeFromCart(line.productId, line.variantId)
                        }
                        aria-label={`Remove ${line.title}`}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-brand-bone/40 transition-colors hover:bg-brand-bone/10 hover:text-brand-bone"
                      >
                        <X className="h-3 w-3" />
                      </button>
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
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="self-center text-xs text-brand-bone/70 underline underline-offset-4 transition-colors hover:text-brand-bone"
                >
                  Done, back to booking
                </button>
              </div>
            )}

            <ul className="mx-auto mt-8 grid w-full max-w-7xl grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-12 lg:grid-cols-5 lg:gap-4">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  itemBg={itemBg}
                  currentInCart={currentInCart}
                  onAdd={addToCart}
                />
              ))}
            </ul>
            <p className="mx-auto mt-8 max-w-xl text-center text-sm text-brand-bone/70 lg:mt-12">
              Mark anything you&apos;d like to grab at your appointment. The
              artist confirms what&apos;s available when accepting your request.
            </p>
            {/* Persistent Done button — the main exit affordance from the grid.
                Shows the running item count when anything is picked. */}
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
        </div>
      )}
    </>
  );
}
