// Pure input validation for the mobile goods endpoints (/api/mobile/goods/*).
// Reuses the shared goods enums/bounds from @/lib/goods so the rules can't drift.
// The app edits metadata, images and variants; only the checkout-addon flag
// stays web (commerce is parked). Same thin-route pattern as the other
// mobile-* validators.

import {
  isCurrency,
  isProductCategory,
  isProductStatus,
  DEFAULT_CURRENCY,
  MAX_PRODUCT_TITLE,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PICKUP_NOTE,
  MAX_PRICE,
  MAX_VARIANTS,
  MAX_VARIANT_NAME,
  type ProductCategory,
  type ProductStatus,
} from "@/lib/goods";
import type { VariantInput } from "@/lib/server/goods-variants";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export type ProductInput = {
  title: string;
  description: string | null;
  category: ProductCategory;
  price: number;
  currency: string;
  status: ProductStatus;
  pickupNote: string | null;
  quantity: number | null;
  isPublicVisible: boolean;
};

/** Validate a product create/update payload (metadata only). */
export function normalizeProductInput(body: unknown): Result<ProductInput> {
  const b = (body ?? {}) as Record<string, unknown>;

  const title = asString(b.title).trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > MAX_PRODUCT_TITLE) {
    return {
      ok: false,
      error: `Title must be ${MAX_PRODUCT_TITLE} characters or fewer.`,
    };
  }

  if (typeof b.price !== "number" || !Number.isFinite(b.price) || b.price < 0) {
    return { ok: false, error: "Price must be a positive number." };
  }
  if (b.price > MAX_PRICE) {
    return {
      ok: false,
      error: `Price cannot exceed ${MAX_PRICE.toLocaleString()}.`,
    };
  }
  const price = Math.round(b.price * 100) / 100;

  // currency / category / status coerce to a safe default if unrecognized
  // (matches the web action's lenient behavior).
  const currency = isCurrency(b.currency)
    ? String(b.currency).toLowerCase()
    : DEFAULT_CURRENCY;
  const category: ProductCategory = isProductCategory(b.category)
    ? b.category
    : "other";
  const status: ProductStatus = isProductStatus(b.status) ? b.status : "active";

  const description =
    asString(b.description).trim().slice(0, MAX_PRODUCT_DESCRIPTION) || null;
  const pickupNote =
    asString(b.pickupNote).trim().slice(0, MAX_PICKUP_NOTE) || null;

  let quantity: number | null = null;
  if (b.quantity !== undefined && b.quantity !== null) {
    if (
      typeof b.quantity !== "number" ||
      !Number.isInteger(b.quantity) ||
      b.quantity < 0
    ) {
      return { ok: false, error: "Quantity must be 0 or more." };
    }
    quantity = b.quantity;
  }

  if (
    b.isPublicVisible !== undefined &&
    typeof b.isPublicVisible !== "boolean"
  ) {
    return { ok: false, error: "isPublicVisible must be a boolean." };
  }
  // Fail-closed: publish only when explicitly true. The app always sends a
  // boolean (a switch), so a missing/odd value can only come from a raw API call,
  // which should default to a hidden draft rather than silently going public.
  const isPublicVisible = b.isPublicVisible === true;

  return {
    ok: true,
    value: {
      title,
      description,
      category,
      price,
      currency,
      status,
      pickupNote,
      quantity,
      isPublicVisible,
    },
  };
}

/** Validate a whole-list variants payload (PUT /goods/:id/variants) — the JSON
 *  twin of the web action's parseVariants: capped at MAX_VARIANTS, nameless
 *  rows silently dropped, null price/stock = inherit/unlimited. The id rides
 *  along for reconcileVariants to update existing rows in place (it validates
 *  ownership by scoping to the product, so a foreign id no-ops). */
export function normalizeVariantsInput(body: unknown): Result<VariantInput[]> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.variants)) {
    return { ok: false, error: "variants must be an array." };
  }

  const out: VariantInput[] = [];
  for (const item of b.variants.slice(0, MAX_VARIANTS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name =
      typeof o.name === "string"
        ? o.name.trim().slice(0, MAX_VARIANT_NAME)
        : "";
    if (!name) continue; // skip nameless rows, like the web action

    const id =
      typeof o.id === "string" && o.id.trim().length > 0 ? o.id.trim() : null;

    let priceOverride: number | null = null;
    if (o.priceOverride !== null && o.priceOverride !== undefined) {
      if (
        typeof o.priceOverride !== "number" ||
        !Number.isFinite(o.priceOverride) ||
        o.priceOverride < 0
      ) {
        return {
          ok: false,
          error: `Variant "${name}": price must be a positive number.`,
        };
      }
      if (o.priceOverride > MAX_PRICE) {
        return {
          ok: false,
          error: `Variant "${name}": price cannot exceed ${MAX_PRICE.toLocaleString()}.`,
        };
      }
      priceOverride = Math.round(o.priceOverride * 100) / 100;
    }

    let stock: number | null = null;
    if (o.stock !== null && o.stock !== undefined) {
      if (
        typeof o.stock !== "number" ||
        !Number.isInteger(o.stock) ||
        o.stock < 0
      ) {
        return {
          ok: false,
          error: `Variant "${name}": stock must be 0 or more.`,
        };
      }
      stock = o.stock;
    }

    out.push({ id, name, priceOverride, stock });
  }
  return { ok: true, value: out };
}
