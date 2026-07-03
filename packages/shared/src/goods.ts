// Goods domain constants + pure helpers — the ONE source of truth shared by
// the web goods editor, the web server actions, the /api/mobile/goods routes
// and the native goods screens (currencies, caps, price parsing, labels).
// Pure only: no Intl.NumberFormat (Hermes iOS has no Intl), no server imports.

export const PRODUCT_CATEGORIES = [
  "print",
  "shirt",
  "sticker",
  "zine",
  "flash_sheet",
  "original",
  "patch",
  "other",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  print: "Print",
  shirt: "Shirt",
  sticker: "Sticker",
  zine: "Zine",
  flash_sheet: "Flash sheet",
  original: "Original",
  patch: "Patch",
  other: "Other",
};

export const PRODUCT_STATUSES = ["active", "hidden", "sold_out"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Active",
  hidden: "Hidden",
  sold_out: "Sold out",
};

// Currencies an artist can price goods in (lowercase ISO codes, stored as-is;
// formatPrice uppercases for display). A traveling artist can price in the local
// currency. NOTE: appointment add-ons only combine goods that match the deposit
// currency (EUR today) because a Stripe PaymentIntent is single-currency — see
// getAddonProducts. Non-matching-currency goods still show on the public shop.
export const CURRENCIES = [
  "eur",
  "usd",
  "gbp",
  "thb",
  "aud",
  "cad",
  "chf",
  "jpy",
  "sek",
  "nok",
  "dkk",
  "pln",
  "czk",
  "sgd",
  "nzd",
  "mxn",
  "brl",
] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = "eur";

export function isCurrency(v: unknown): v is Currency {
  return (
    typeof v === "string" &&
    (CURRENCIES as readonly string[]).includes(v.toLowerCase())
  );
}

export const MAX_PRODUCT_TITLE = 80;
export const MAX_PRODUCT_DESCRIPTION = 500;
export const MAX_PICKUP_NOTE = 200;
export const MAX_VARIANT_NAME = 40;
export const MAX_PRICE = 100_000;
export const MAX_VARIANTS = 20;

// Multi-image cap: a variant-less product gets up to 3 images; once variants
// exist, the cap becomes (variantCount + 1) so the artist can pair one image
// per variant plus one shared hero. The 3-cap is intentionally NOT applied to
// variant products — a single-variant product is allowed only 2 images.
export function maxProductImages(variantCount: number): number {
  return variantCount > 0 ? variantCount + 1 : 3;
}

// FU-18: every product-image writer (web save, mobile image POST/DELETE)
// compare-and-sets on products.updated_at so a cross-device interleave cannot
// resurrect a deleted image URL whose storage object is already gone. One
// message for all three surfaces.
export const PRODUCT_CONFLICT_MESSAGE =
  "This product changed on another device. Reload and try again.";

export function isProductCategory(v: unknown): v is ProductCategory {
  return (
    typeof v === "string" &&
    (PRODUCT_CATEGORIES as readonly string[]).includes(v)
  );
}

export function isProductStatus(v: unknown): v is ProductStatus {
  return (
    typeof v === "string" && (PRODUCT_STATUSES as readonly string[]).includes(v)
  );
}

type PriceResult = { value: number } | { error: string };

/** Apply the price bounds (non-negative, <= MAX_PRICE) and round to 2 dp to an
 *  ALREADY-numeric value. The mobile API payload arrives as a number, not a form
 *  string, so its route re-validators call this directly — same rule as
 *  parsePriceInput's numeric half, single-sourced. */
export function normalizePriceNumber(n: number): PriceResult {
  if (!Number.isFinite(n) || n < 0) {
    return { error: "Price must be a positive number." };
  }
  if (n > MAX_PRICE) {
    return { error: `Price cannot exceed ${MAX_PRICE.toLocaleString()}.` };
  }
  return { value: Math.round(n * 100) / 100 };
}

/**
 * Parse a required price string from a form into a 2-dp number, or an error.
 * EU-aware: a comma is the decimal separator and dots/spaces are thousands
 * grouping ("1.234,56" -> 1234.56, "1,50" -> 1.5), so a comma-typing artist no
 * longer has "1,50" truncated to 1. Dot-decimal input (every HTML number input)
 * is unchanged. This is the ONE parser for both the web form and the mobile
 * TextInput (the old mobile parseEuAmount is now a thin adapter over it).
 */
export function parsePriceInput(raw: string | null | undefined): PriceResult {
  let s = (raw ?? "").trim();
  if (s === "") return { error: "Enter a price." };
  s = s.replace(/\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return normalizePriceNumber(Number.parseFloat(s));
}

/** Optional price (e.g. a variant override): blank input means null. */
export function parseOptionalPriceInput(
  raw: string | null | undefined,
): { value: number | null } | { error: string } {
  const s = (raw ?? "").trim();
  if (s === "") return { value: null };
  return parsePriceInput(s);
}

export function formatPrice(amount: number, currency = "eur"): string {
  return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
}

/** Supabase returns numeric columns as strings; coerce to a number. */
export function toPriceNumber(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Shape rendered by the public Bio Page shop module. */
export type PublicProductVariant = {
  id: string;
  name: string;
  priceOverride: number | null;
  stock: number | null;
};

export type PublicProduct = {
  id: string;
  title: string;
  category: ProductCategory;
  /** Canonical multi-image list (migration 0038). The first entry is the
   *  hero / dashboard thumbnail; the public shop renders a carousel when the
   *  list has more than one entry. Always present (empty array when unset). */
  imageUrls: string[];
  /** Legacy single-image source — kept as imageUrls[0] for any reader that
   *  hasn't been migrated. New code should prefer imageUrls. */
  imageUrl: string | null;
  price: number;
  currency: string;
  soldOut: boolean;
  pickupNote: string | null;
  /** True when the artist has marked this product as an appointment add-on AND
   *  it's active EUR; gates the interest-marking UI in the public shop. */
  interestEligible: boolean;
  variants: PublicProductVariant[];
};
