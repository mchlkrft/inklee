// Goods module (Slice 73). Artist products + simple variants, surfaced on the
// public Bio Page shop and (Slice 74+) as Appointment Add-ons. Pure helpers +
// types live here; the queries live in the route files via the Supabase client.

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

/** Parse a required price string from a form into a 2-dp number, or an error. */
export function parsePriceInput(raw: string | null | undefined): PriceResult {
  const s = (raw ?? "").trim();
  if (s === "") return { error: "Enter a price." };
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) {
    return { error: "Price must be a positive number." };
  }
  if (n > MAX_PRICE) {
    return { error: `Price cannot exceed ${MAX_PRICE.toLocaleString()}.` };
  }
  return { value: Math.round(n * 100) / 100 };
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
export type PublicProduct = {
  id: string;
  title: string;
  category: ProductCategory;
  imageUrl: string | null;
  price: number;
  currency: string;
  soldOut: boolean;
  pickupNote: string | null;
};
