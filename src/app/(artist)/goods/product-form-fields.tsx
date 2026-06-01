"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ImagePlus, Plus, Trash2, X } from "lucide-react";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
  CURRENCIES,
  DEFAULT_CURRENCY,
  MAX_PRODUCT_TITLE,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PICKUP_NOTE,
  MAX_VARIANT_NAME,
  type ProductCategory,
  type ProductStatus,
} from "@/lib/goods";

export type ProductFormFieldValues = {
  title: string;
  quantity: string;
  price: string;
  currency: string;
  description: string;
  category: ProductCategory;
  status: ProductStatus;
  pickupNote: string;
  isPublicVisible: boolean;
  isCheckoutAddon: boolean;
  imageUrl: string | null;
  // Multi-image (migration 0038). imageUrl stays as the legacy single hero for
  // back-compat; imageUrls is the canonical list driving the multi-image picker.
  imageUrls: string[];
};

export type VariantInputRow = {
  name: string;
  priceOverride: string;
  stock: string;
};

type VariantRow = VariantInputRow & { key: string };

const INPUT =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const LABEL = "text-sm text-muted-foreground";

function freshKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `v-${Date.now()}-${Math.random()}`;
}

export default function ProductFormFields({
  initial,
  variants: initialVariants = [],
}: {
  initial?: Partial<ProductFormFieldValues>;
  variants?: VariantInputRow[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Multi-image picker (migration 0038). One list of entries — existing URLs
  // posted back via existing_image_urls + new File objects synced into a
  // hidden multi-file input each render — so the server composes the final
  // image_urls array in the artist's order.
  type ImageEntry =
    | { kind: "existing"; url: string; key: string }
    | { kind: "new"; file: File; preview: string; key: string };

  const [imageEntries, setImageEntries] = useState<ImageEntry[]>(() => {
    const seed = initial?.imageUrls?.length
      ? initial.imageUrls
      : initial?.imageUrl
        ? [initial.imageUrl]
        : [];
    return seed.map((url) => ({
      kind: "existing" as const,
      url,
      key: freshKey(),
    }));
  });

  const [moreOpen, setMoreOpen] = useState(false);
  // The add-on flag lives under "More settings" (collapsed by default). Hold it
  // in state with an always-rendered hidden input so the value submits even when
  // that section was never opened. Publish/draft is a required radio choice on
  // the main form below, so it can't be silently defaulted.
  const [isCheckoutAddon, setIsCheckoutAddon] = useState(
    initial?.isCheckoutAddon ?? true,
  );

  const [hasOptions, setHasOptions] = useState(initialVariants.length > 0);
  const [rows, setRows] = useState<VariantRow[]>(
    initialVariants.map((v) => ({ key: freshKey(), ...v })),
  );

  // Image cap — variant-less product: 3. With variants: variantCount + 1
  // (one image per variant plus a shared hero). Computed live so adding a
  // variant opens up another slot.
  const liveVariantCount = hasOptions
    ? rows.filter((r) => r.name.trim().length > 0).length
    : 0;
  const maxImages = liveVariantCount > 0 ? liveVariantCount + 1 : 3;

  // Multi-file inputs can't be populated arbitrarily by JS; we use a
  // DataTransfer to sync the new-file entries back into the hidden file
  // input on every change so FormData picks them up in order.
  useEffect(() => {
    if (!fileRef.current) return;
    const dt = new DataTransfer();
    for (const img of imageEntries) {
      if (img.kind === "new") dt.items.add(img.file);
    }
    fileRef.current.files = dt.files;
  }, [imageEntries]);

  // Revoke blob URLs on unmount so they don't leak (we also revoke on remove).
  useEffect(() => {
    return () => {
      for (const img of imageEntries) {
        if (img.kind === "new") URL.revokeObjectURL(img.preview);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addImageFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImageEntries((prev) => {
      const remaining = maxImages - prev.length;
      if (remaining <= 0) return prev;
      const toAdd = Array.from(files)
        .slice(0, remaining)
        .map((file) => ({
          kind: "new" as const,
          file,
          preview: URL.createObjectURL(file),
          key: freshKey(),
        }));
      return [...prev, ...toAdd];
    });
    // Reset so picking the same file again still triggers onChange.
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeImageEntry(key: string) {
    setImageEntries((prev) => {
      const dropped = prev.find((img) => img.key === key);
      if (dropped && dropped.kind === "new") {
        URL.revokeObjectURL(dropped.preview);
      }
      return prev.filter((img) => img.key !== key);
    });
  }

  const existingImageUrls = imageEntries
    .filter(
      (img): img is Extract<ImageEntry, { kind: "existing" }> =>
        img.kind === "existing",
    )
    .map((img) => img.url);

  function toggleOptions(next: boolean) {
    setHasOptions(next);
    if (next && rows.length === 0) {
      setRows([{ key: freshKey(), name: "", priceOverride: "", stock: "" }]);
    }
  }

  const updateRow = (key: string, patch: Partial<VariantRow>) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  const removeRow = (key: string) =>
    setRows((prev) => prev.filter((r) => r.key !== key));
  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { key: freshKey(), name: "", priceOverride: "", stock: "" },
    ]);

  const serializedVariants = hasOptions
    ? JSON.stringify(
        rows.map((r) => ({
          name: r.name,
          priceOverride: r.priceOverride,
          stock: r.stock,
        })),
      )
    : "[]";

  return (
    <div className="space-y-4">
      <input type="hidden" name="variants" value={serializedVariants} />
      {/* Multi-image picker — first, the satisfying step. Grid of thumbnails
          with a + tile that opens the file picker. The keep-list and the new
          files post via hidden inputs at the end of this section. */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label className={LABEL}>Images</label>
          <span className="text-xs text-muted-foreground">
            {imageEntries.length} / {maxImages}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {imageEntries.map((img) => (
            <div
              key={img.key}
              className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.kind === "new" ? img.preview : img.url}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeImageEntry(img.key)}
                aria-label="Remove image"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {imageEntries.length < maxImages && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted/30 hover:text-foreground"
            >
              <ImagePlus className="h-6 w-6" strokeWidth={1.5} />
              <span className="text-[11px]">Add image</span>
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPG or WebP, up to 5 MB each.{" "}
          {liveVariantCount > 0
            ? `With ${liveVariantCount} option${liveVariantCount === 1 ? "" : "s"} you can add up to ${maxImages} images (one per option + a shared one).`
            : "Up to 3 images — drag to reorder is coming."}
        </p>
        <input
          type="hidden"
          name="existing_image_urls"
          value={JSON.stringify(existingImageUrls)}
        />
        <input
          ref={fileRef}
          name="images"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => addImageFiles(e.target.files)}
        />
      </div>

      {/* Title + Quantity (quantity hides when the product has options) */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="pf-title" className={LABEL}>
            Title
          </label>
          <input
            id="pf-title"
            name="title"
            required
            maxLength={MAX_PRODUCT_TITLE}
            defaultValue={initial?.title ?? ""}
            placeholder="e.g. Spiderweb print A4"
            className={INPUT}
          />
        </div>
        {!hasOptions && (
          <div className="w-28 space-y-1.5">
            <label htmlFor="pf-qty" className={LABEL}>
              Qty
            </label>
            <input
              id="pf-qty"
              name="quantity"
              type="number"
              min="0"
              inputMode="numeric"
              defaultValue={initial?.quantity ?? ""}
              placeholder="∞"
              className={INPUT}
            />
          </div>
        )}
      </div>

      {/* Price + Currency */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="pf-price" className={LABEL}>
            Price
          </label>
          <input
            id="pf-price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
            defaultValue={initial?.price ?? ""}
            placeholder="e.g. 25"
            className={INPUT}
          />
        </div>
        <div className="w-28 space-y-1.5">
          <label htmlFor="pf-currency" className={LABEL}>
            Currency
          </label>
          <select
            id="pf-currency"
            name="currency"
            defaultValue={initial?.currency ?? DEFAULT_CURRENCY}
            className={INPUT}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="pf-desc" className={LABEL}>
          Description <span className="text-xs">(optional)</span>
        </label>
        <textarea
          id="pf-desc"
          name="description"
          rows={3}
          maxLength={MAX_PRODUCT_DESCRIPTION}
          defaultValue={initial?.description ?? ""}
          placeholder="Size, material, anything the client should know."
          className={`${INPUT} resize-none`}
        />
      </div>

      {/* Variants — optional, after description */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={hasOptions}
            onChange={(e) => toggleOptions(e.target.checked)}
          />
          This product has options (sizes, etc.)
        </label>

        {hasOptions && (
          <div className="space-y-2 rounded-md border border-border bg-muted/10 p-3">
            {rows.map((r) => (
              <div key={r.key} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[6rem] flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Name</label>
                  <input
                    value={r.name}
                    onChange={(e) =>
                      updateRow(r.key, {
                        name: e.target.value.slice(0, MAX_VARIANT_NAME),
                      })
                    }
                    placeholder="M"
                    className={INPUT}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <label className="text-xs text-muted-foreground">Price</label>
                  <input
                    value={r.priceOverride}
                    onChange={(e) =>
                      updateRow(r.key, { priceOverride: e.target.value })
                    }
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="—"
                    className={INPUT}
                  />
                </div>
                <div className="w-20 space-y-1">
                  <label className="text-xs text-muted-foreground">Stock</label>
                  <input
                    value={r.stock}
                    onChange={(e) =>
                      updateRow(r.key, { stock: e.target.value })
                    }
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="∞"
                    className={INPUT}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(r.key)}
                  aria-label="Remove option"
                  className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/30"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add option
            </button>
            <p className="text-xs text-muted-foreground">
              Leave price empty to use the product price. Leave stock empty for
              unlimited.
            </p>
          </div>
        )}
      </div>

      {/* Publish / draft — a required, explicit choice so an item is never
          silently hidden (or silently published). Native `required` blocks the
          form's submit until one option is picked. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          Visibility
        </legend>
        <p className="text-xs text-muted-foreground">
          Choose whether this item goes live on your public page or stays a
          draft.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm text-foreground transition-colors has-[:checked]:border-brand-mustard has-[:checked]:bg-brand-mustard/10">
            <input
              type="radio"
              name="is_public_visible"
              value="on"
              required
              defaultChecked={initial?.isPublicVisible === true}
            />
            Publish to my page
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm text-foreground transition-colors has-[:checked]:border-brand-mustard has-[:checked]:bg-brand-mustard/10">
            <input
              type="radio"
              name="is_public_visible"
              value="off"
              required
              defaultChecked={initial?.isPublicVisible === false}
            />
            Save as draft
          </label>
        </div>
      </fieldset>

      {/* Always-rendered so the add-on value submits regardless of whether the
          "More settings" section was ever opened. */}
      <input
        type="hidden"
        name="is_checkout_addon"
        value={isCheckoutAddon ? "on" : "off"}
      />

      {/* More settings — the long tail */}
      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        aria-expanded={moreOpen}
        className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>More settings</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
        />
      </button>

      {moreOpen && (
        <div className="space-y-4 rounded-md border border-border bg-muted/10 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="pf-category" className={LABEL}>
                Category
              </label>
              <select
                id="pf-category"
                name="category"
                defaultValue={initial?.category ?? "print"}
                className={INPUT}
              >
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {PRODUCT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pf-status" className={LABEL}>
                Status
              </label>
              <select
                id="pf-status"
                name="status"
                defaultValue={initial?.status ?? "active"}
                className={INPUT}
              >
                {PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PRODUCT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pf-pickup" className={LABEL}>
              Pickup note <span className="text-xs">(optional)</span>
            </label>
            <input
              id="pf-pickup"
              name="pickup_note"
              maxLength={MAX_PICKUP_NOTE}
              defaultValue={initial?.pickupNote ?? ""}
              placeholder="e.g. Collect at your appointment."
              className={INPUT}
            />
          </div>

          <div className="space-y-2 rounded-md border border-border bg-background px-3 py-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isCheckoutAddon}
                onChange={(e) => setIsCheckoutAddon(e.target.checked)}
              />
              Offer as an add-on when a client pays their deposit
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
