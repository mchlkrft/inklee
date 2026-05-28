"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Upload, Pencil, Image as ImageIcon } from "lucide-react";
import { publishFlashItemAction, toggleFlashBookableAction } from "./actions";

type Item = {
  id: string;
  title: string;
  status: string;
  preview_image_url: string | null;
  is_bookable: boolean;
};

/**
 * Single flash item tile in the /flash/items grid.
 *
 * Interaction model:
 * - Image + title strip are always visible.
 * - Action stack (Booked / Publish / Edit) is hidden by default.
 *   Desktop: revealed on hover.
 *   Mobile/touch: revealed by tapping the tile body. Tap the dimmed
 *   backdrop again to hide. State auto-resets on mouseleave so a stale
 *   click-revealed state on desktop clears when the cursor leaves.
 *
 * Button visibility by status:
 * - draft     → Booked + Publish + Edit
 * - published → Booked + Edit
 * - archived  → Edit
 *
 * All buttons share the same width + visual style so the stack feels uniform.
 * Hierarchy comes from color: mustard for the primary CTA in context,
 * outlined white ghost for the rest.
 */
export default function FlashTile({
  item,
  availabilityLabel,
}: {
  item: Item;
  availabilityLabel: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const [bookable, setBookable] = useState(item.is_bookable);
  const [pending, startTransition] = useTransition();

  const isDraft = item.status === "draft";
  const isArchived = item.status === "archived";

  function handleBookableToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const next = !bookable;
    setBookable(next);
    startTransition(async () => {
      const result = await toggleFlashBookableAction(item.id, next);
      if (result && "error" in result) setBookable(!next);
    });
  }

  function handlePublish(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    startTransition(async () => {
      await publishFlashItemAction(item.id);
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
        isDraft ? "opacity-80 grayscale" : ""
      }`}
    >
      {/* ── Image / fallback ─────────────────────────────────────────────── */}
      {item.preview_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.preview_image_url}
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

      {/* ── Action stack overlay ─────────────────────────────────────────── */}
      <div
        className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/70 backdrop-blur-[2px] px-3 transition-opacity ${
          revealed
            ? "opacity-100 pointer-events-auto"
            : "pointer-events-none opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto"
        }`}
      >
        {!isArchived && (
          <ActionButton
            icon={<Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
            label="Booked"
            onClick={handleBookableToggle}
            variant={bookable ? "ghost" : "active"}
            disabled={pending}
            aria-label={
              bookable ? "Mark as booked" : "Booked — click to revert"
            }
          />
        )}

        {isDraft && (
          <ActionButton
            icon={<Upload className="h-3.5 w-3.5" strokeWidth={2.5} />}
            label="Publish"
            onClick={handlePublish}
            variant="primary"
            disabled={pending}
            aria-label="Publish design"
          />
        )}

        <ActionButton
          icon={<Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />}
          label="Edit"
          as={Link}
          href={`/flash/items/${item.id}`}
          onClickCapture={(e) => e.stopPropagation()}
          variant="ghost"
        />
      </div>

      {/* ── Title strip (hidden when the action stack is revealed) ───────── */}
      <div
        className={`pointer-events-none absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2 pb-2 pt-6 transition-opacity ${
          revealed ? "opacity-0" : "opacity-100 group-hover:opacity-0"
        }`}
      >
        <p className="truncate text-xs font-medium text-white">{item.title}</p>
        {availabilityLabel && (
          <p className="truncate text-[10px] text-white/75">
            {availabilityLabel}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Uniform action button used inside the centered stack.
 * - Same width across all variants
 * - Icon + label, icon on the left
 * - Variants:
 *   - "primary" — mustard fill (primary CTA, e.g., Publish)
 *   - "active" — mustard fill (current state, e.g., Booked already on)
 *   - "ghost" — translucent dark with white border (default CTA)
 */
type Variant = "primary" | "active" | "ghost";

type ActionButtonProps = {
  icon: React.ReactNode;
  label: string;
  variant: Variant;
  disabled?: boolean;
  "aria-label"?: string;
} & (
  | { onClick: (e: React.MouseEvent) => void; as?: undefined; href?: undefined }
  | {
      as: typeof Link;
      href: string;
      onClickCapture: (e: React.MouseEvent) => void;
    }
);

function ActionButton(props: ActionButtonProps) {
  const baseClasses =
    "inline-flex w-32 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60";

  const variantClasses: Record<Variant, string> = {
    primary: "bg-brand-mustard text-brand-charcoal hover:opacity-90",
    active:
      "border border-brand-mustard bg-brand-mustard text-brand-charcoal hover:opacity-90",
    ghost: "border border-white/60 bg-black/45 text-white hover:bg-black/65",
  };

  if ("as" in props && props.as) {
    return (
      <Link
        href={props.href}
        onClickCapture={props.onClickCapture}
        aria-label={props["aria-label"] ?? props.label}
        className={`${baseClasses} ${variantClasses[props.variant]}`}
      >
        {props.icon}
        {props.label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props["aria-label"] ?? props.label}
      className={`${baseClasses} ${variantClasses[props.variant]}`}
    >
      {props.icon}
      {props.label}
    </button>
  );
}
