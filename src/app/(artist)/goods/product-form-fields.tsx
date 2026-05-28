"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, ImagePlus, Plus, Trash2 } from "lucide-react";
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initial?.imageUrl ?? null,
  );
  const [removeImage, setRemoveImage] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const [hasOptions, setHasOptions] = useState(initialVariants.length > 0);
  const [rows, setRows] = useState<VariantRow[]>(
    initialVariants.map((v) => ({ key: freshKey(), ...v })),
  );

  const hadExistingImage = !!initial?.imageUrl;

  function takeFile(file: File) {
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileRef.current) fileRef.current.files = dt.files;
    setPreviewUrl(URL.createObjectURL(file));
    setRemoveImage(false);
  }

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
      {hadExistingImage && (
        <input
          type="hidden"
          name="remove_image"
          value={removeImage ? "1" : ""}
        />
      )}

      {/* Image — first. Drag-drop or click. The satisfying step. */}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) takeFile(f);
          }}
          className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 border-dashed bg-muted/20 transition-colors hover:border-foreground/40 hover:bg-muted/30 focus:outline-none focus-visible:border-foreground/60 ${
            dragging ? "border-foreground/60 bg-muted/40" : "border-border"
          }`}
        >
          {previewUrl && !removeImage ? (
            previewUrl.startsWith("blob:") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <Image
                src={previewUrl}
                alt=""
                fill
                sizes="(max-width: 480px) 100vw, 480px"
                className="object-cover"
              />
            )
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImagePlus className="h-8 w-8" strokeWidth={1.5} />
              <span className="text-sm font-medium">
                Drag an image here, or click to upload
              </span>
              <span className="text-xs">PNG, JPG or WebP, up to 5&nbsp;MB</span>
            </div>
          )}
        </button>
        <input
          ref={fileRef}
          name="image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) takeFile(f);
          }}
        />
        {hadExistingImage && previewUrl && !removeImage && (
          <button
            type="button"
            onClick={() => {
              setRemoveImage(true);
              setPreviewUrl(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            Remove image
          </button>
        )}
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
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/30"
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
                name="is_public_visible"
                defaultChecked={initial?.isPublicVisible ?? true}
              />
              Show on my public page
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="is_checkout_addon"
                defaultChecked={initial?.isCheckoutAddon ?? true}
              />
              Offer as an add-on when a client pays their deposit
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
