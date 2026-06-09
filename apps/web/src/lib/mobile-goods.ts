// Pure input validation for the mobile goods endpoints (/api/mobile/goods/*).
// Reuses the shared goods enums/bounds from @/lib/goods so the rules can't drift.
// The app edits product METADATA only — images + variants + the checkout-addon
// flag stay web (image upload is its own slice; commerce is parked). Same thin-
// route pattern as the other mobile-* validators.

import {
  isCurrency,
  isProductCategory,
  isProductStatus,
  DEFAULT_CURRENCY,
  MAX_PRODUCT_TITLE,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PICKUP_NOTE,
  MAX_PRICE,
  type ProductCategory,
  type ProductStatus,
} from "@/lib/goods";

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
