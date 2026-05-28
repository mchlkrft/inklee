"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, RotateCcw, Pencil, Image as ImageIcon } from "lucide-react";
import { setProductStatusAction } from "./actions";
import {
  formatPrice,
  PRODUCT_STATUS_LABELS,
  type ProductStatus,
} from "@/lib/goods";

export type GoodsTileItem = {
  id: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  status: ProductStatus;
  isPublicVisible: boolean;
};

/**
 * Goods grid tile mirroring the flash tile: image + title strip always visible;
 * an action stack (Sold out toggle / Edit) revealed on hover (desktop) or tap
 * (touch). Sold-out and hidden products are dimmed.
 */
export default function GoodsTile({ item }: { item: GoodsTileItem }) {
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<ProductStatus>(item.status);
  const [pending, startTransition] = useTransition();

  const soldOut = status === "sold_out";
  const hidden = status === "hidden";

  function toggleSoldOut(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const next: ProductStatus = soldOut ? "active" : "sold_out";
    setStatus(next);
    startTransition(async () => {
      const result = await setProductStatusAction(item.id, next);
      if (result && "error" in result) setStatus(status); // revert on failure
    });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setRevealed((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setRevealed((v) => !v);
        }
      }}
      onMouseLeave={() => setRevealed(false)}
      className={`group relative aspect-square cursor-pointer overflow-hidden rounded-md border border-border bg-muted/40 outline-none transition-colors hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-brand-mustard ${
        soldOut || hidden ? "opacity-70 grayscale" : ""
      }`}
    >
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt={item.title}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon
            className="h-7 w-7 text-muted-foreground/40"
            strokeWidth={1.5}
          />
        </div>
      )}

      {/* Status badge (top-right) for non-active products */}
      {status !== "active" && (
        <span className="absolute right-2 top-2 z-30 rounded-full bg-brand-charcoal/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-bone">
          {PRODUCT_STATUS_LABELS[status]}
        </span>
      )}

      {/* Action stack */}
      <div
        className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/70 px-3 backdrop-blur-[2px] transition-opacity ${
          revealed
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
        }`}
      >
        <button
          type="button"
          onClick={toggleSoldOut}
          disabled={pending}
          aria-label={soldOut ? "Mark available" : "Mark sold out"}
          className="inline-flex w-32 items-center justify-center gap-1.5 rounded-md border border-white/60 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black/65 disabled:opacity-60"
        >
          {soldOut ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.5} /> Available
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Sold out
            </>
          )}
        </button>
        <Link
          href={`/goods/${item.id}`}
          onClickCapture={(e) => e.stopPropagation()}
          className="inline-flex w-32 items-center justify-center gap-1.5 rounded-md bg-brand-mustard px-3 py-1.5 text-xs font-semibold text-brand-charcoal transition-colors hover:opacity-90"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} /> Edit
        </Link>
      </div>

      {/* Title strip */}
      <div
        className={`pointer-events-none absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2 pb-2 pt-6 transition-opacity ${
          revealed ? "opacity-0" : "opacity-100 group-hover:opacity-0"
        }`}
      >
        <p className="truncate text-xs font-medium text-white">{item.title}</p>
        <p className="truncate text-[10px] text-white/75">
          {formatPrice(item.price, item.currency)}
          {!item.isPublicVisible ? " · off public page" : ""}
        </p>
      </div>
    </div>
  );
}
