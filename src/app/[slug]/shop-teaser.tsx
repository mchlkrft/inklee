// Bio Page shop overlay. Triggered by the "Shop" header card on the public
// page. Each product card carries interest-marking controls (variant picker +
// qty stepper) for items the artist has flagged as appointment add-ons —
// sold-out + non-eligible items still appear, but read-only. Selections are
// owned by BookingForm above and serialised into a hidden interests_json field
// at submit time; the server validates and writes booking_interests rows.

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import {
  PRODUCT_CATEGORY_LABELS,
  formatPrice,
  type PublicProduct,
  type PublicProductVariant,
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

export default function ShopTeaser({
  products,
  itemBg = null,
}: {
  products: PublicProduct[];
  // Background for the overlay product cards — the artist's chosen header
  // color, or null to fall back to charcoal (used when there's a cover image).
  itemBg?: string | null;
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
              Mark anything you&apos;d like to grab at your appointment. The
              artist confirms what&apos;s available when accepting your request.
            </p>
            <ul className="grid grid-cols-2 gap-3">
              {products.map((p) => {
                const sel = findSelection(selections, p.id);
                const canMark = p.interestEligible && !p.soldOut;
                const needsVariant = p.variants.length > 0;
                const selectedVariantId = sel?.variantId ?? null;
                const qty = sel?.quantity ?? 0;
                const max = maxQtyFor(p, selectedVariantId);
                const unitPrice = unitPriceFor(p, selectedVariantId);
                const canIncrement =
                  canMark &&
                  qty < max &&
                  (!needsVariant || !!selectedVariantId);

                return (
                  <li
                    key={selectionKey(p.id)}
                    style={itemBg ? { backgroundColor: itemBg } : undefined}
                    className="flex flex-col overflow-hidden rounded-[16px] border border-brand-bone/15 bg-brand-charcoal text-brand-bone shadow-sm"
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
                    <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
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

                      {canMark && (
                        <div className="mt-auto space-y-1.5">
                          {needsVariant && (
                            <select
                              value={selectedVariantId ?? ""}
                              onChange={(e) =>
                                upsertSelection(p.id, {
                                  variantId: e.target.value || null,
                                  // Keep qty if non-zero; otherwise default to 1
                                  // on first variant pick so the customer doesn't
                                  // have to also bump the stepper.
                                  quantity:
                                    qty > 0 ? qty : e.target.value ? 1 : 0,
                                })
                              }
                              aria-label={`Option for ${p.title}`}
                              className="w-full rounded-md border border-brand-bone/20 bg-black/20 px-2 py-1 text-xs text-brand-bone focus:outline-none focus:ring-1 focus:ring-brand-bone/40"
                            >
                              <option value="">Pick option</option>
                              {p.variants.map((v: PublicProductVariant) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                  {v.stock !== null && v.stock <= 0
                                    ? " · sold out"
                                    : ""}
                                </option>
                              ))}
                            </select>
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
                              disabled={qty <= 0}
                              aria-label={`Remove one ${p.title}`}
                              className="rounded p-1 text-brand-bone/70 transition-colors hover:text-brand-bone disabled:opacity-30"
                            >
                              <Minus className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <span className="text-xs tabular-nums text-brand-bone">
                              {qty > 0 ? `${qty} interested` : "Mark interest"}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                upsertSelection(p.id, {
                                  variantId: selectedVariantId,
                                  quantity: qty + 1,
                                })
                              }
                              disabled={!canIncrement}
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
          </div>
        </div>
      )}
    </>
  );
}
