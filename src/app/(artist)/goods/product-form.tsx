"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Plus, Trash2 } from "lucide-react";
import { createProductAction, updateProductAction } from "./actions";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
  MAX_PRODUCT_TITLE,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PICKUP_NOTE,
  MAX_VARIANT_NAME,
  type ProductCategory,
  type ProductStatus,
} from "@/lib/goods";

type State = { error: string } | { success: true } | null;

export type ProductFormValues = {
  id: string;
  title: string;
  description: string;
  category: ProductCategory;
  price: string;
  status: ProductStatus;
  pickupNote: string;
  quantity: string;
  isPublicVisible: boolean;
  isCheckoutAddon: boolean;
  imageUrl: string | null;
};

type VariantRow = {
  key: string;
  name: string;
  priceOverride: string;
  stock: string;
};

const INPUT =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const LABEL = "text-sm font-medium text-foreground";

function freshKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `v-${Date.now()}-${Math.random()}`;
}

export default function ProductForm({
  mode,
  product,
  variants: initialVariants = [],
}: {
  mode: "create" | "edit";
  product?: ProductFormValues;
  variants?: { name: string; priceOverride: string; stock: string }[];
}) {
  const action = mode === "create" ? createProductAction : updateProductAction;
  const [state, formAction, pending] = useActionState<State, FormData>(
    action,
    null,
  );

  const [variants, setVariants] = useState<VariantRow[]>(
    initialVariants.map((v) => ({ key: freshKey(), ...v })),
  );
  const [removeImage, setRemoveImage] = useState(false);

  const serializedVariants = JSON.stringify(
    variants.map((v) => ({
      name: v.name,
      priceOverride: v.priceOverride,
      stock: v.stock,
    })),
  );

  const addVariant = () =>
    setVariants((prev) => [
      ...prev,
      { key: freshKey(), name: "", priceOverride: "", stock: "" },
    ]);
  const updateVariant = (key: string, patch: Partial<VariantRow>) =>
    setVariants((prev) =>
      prev.map((v) => (v.key === key ? { ...v, ...patch } : v)),
    );
  const removeVariant = (key: string) =>
    setVariants((prev) => prev.filter((v) => v.key !== key));

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {mode === "edit" && product && (
        <input type="hidden" name="id" value={product.id} />
      )}
      <input type="hidden" name="variants" value={serializedVariants} />

      <div className="space-y-1.5">
        <label htmlFor="title" className={LABEL}>
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={MAX_PRODUCT_TITLE}
          defaultValue={product?.title ?? ""}
          placeholder="e.g. Spiderweb print A4"
          className={INPUT}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="category" className={LABEL}>
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={product?.category ?? "print"}
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
          <label htmlFor="price" className={LABEL}>
            Price
          </label>
          <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
            <span className="mr-1 select-none text-muted-foreground">EUR</span>
            <input
              id="price"
              name="price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              required
              defaultValue={product?.price ?? ""}
              placeholder="e.g. 25"
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className={LABEL}>
          Description{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (optional)
          </span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={MAX_PRODUCT_DESCRIPTION}
          defaultValue={product?.description ?? ""}
          placeholder="Size, material, anything the client should know."
          className={`${INPUT} resize-none`}
        />
      </div>

      {/* Image */}
      <div className="space-y-1.5">
        <span className={LABEL}>
          Image{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (optional)
          </span>
        </span>
        {product?.imageUrl && !removeImage && (
          <div className="flex items-center gap-3">
            <div className="relative h-16 w-16 overflow-hidden rounded-md border border-border">
              <Image
                src={product.imageUrl}
                alt={product.title}
                fill
                sizes="64px"
                className="object-cover"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                name="remove_image"
                value="1"
                checked={removeImage}
                onChange={(e) => setRemoveImage(e.target.checked)}
              />
              Remove current image
            </label>
          </div>
        )}
        <input
          type="file"
          name="image"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
        <p className="text-xs text-muted-foreground">
          PNG, JPG, or WebP, up to 5 MB.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="pickup_note" className={LABEL}>
            Pickup note{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <input
            id="pickup_note"
            name="pickup_note"
            maxLength={MAX_PICKUP_NOTE}
            defaultValue={product?.pickupNote ?? ""}
            placeholder="e.g. Collect at your appointment."
            className={INPUT}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="quantity" className={LABEL}>
            Quantity{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="0"
            inputMode="numeric"
            defaultValue={product?.quantity ?? ""}
            placeholder="Leave empty for unlimited"
            className={INPUT}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="status" className={LABEL}>
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={product?.status ?? "active"}
          className={INPUT}
        >
          {PRODUCT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PRODUCT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Hidden keeps it off your public page. Sold out shows it greyed out.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-border px-4 py-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="is_public_visible"
            defaultChecked={product?.isPublicVisible ?? true}
          />
          Show on my public page
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="is_checkout_addon"
            defaultChecked={product?.isCheckoutAddon ?? true}
          />
          Offer as an add-on when a client pays their deposit
        </label>
      </div>

      {/* Variants */}
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Variants{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (optional)
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">
            For sizes like S, M, L. Leave the price empty to use the product
            price.
          </p>
        </div>
        {variants.map((v) => (
          <div key={v.key} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[7rem] flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                value={v.name}
                onChange={(e) =>
                  updateVariant(v.key, {
                    name: e.target.value.slice(0, MAX_VARIANT_NAME),
                  })
                }
                placeholder="M"
                className={INPUT}
              />
            </div>
            <div className="w-28 space-y-1">
              <label className="text-xs text-muted-foreground">
                Price (EUR)
              </label>
              <input
                value={v.priceOverride}
                onChange={(e) =>
                  updateVariant(v.key, { priceOverride: e.target.value })
                }
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="—"
                className={INPUT}
              />
            </div>
            <div className="w-24 space-y-1">
              <label className="text-xs text-muted-foreground">Stock</label>
              <input
                value={v.stock}
                onChange={(e) =>
                  updateVariant(v.key, { stock: e.target.value })
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
              onClick={() => removeVariant(v.key)}
              aria-label="Remove variant"
              className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addVariant}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add variant
        </button>
      </div>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending
          ? "Saving…"
          : mode === "create"
            ? "Create product"
            : "Save product"}
      </button>
    </form>
  );
}
