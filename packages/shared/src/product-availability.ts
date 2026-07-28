// Product availability: drops, preorders and stock (Plus build P5c).
//
// ONE function decides whether a product can be bought, because there are
// THREE public gates that ask: the shop teaser on the artist page, the
// checkout add-on catalogue, and the line composer that re-checks at payment
// time. A drop honoured by two of the three would let a scheduled product be
// bought before it dropped, which is the one thing the feature promises cannot
// happen.
//
// The audit lesson from the P3-P5 shipments applied deliberately: enumerate
// every existing gate before adding a rule, rather than adding the rule where
// it is convenient and discovering the third gate later.

export type ProductAvailabilityInput = {
  /** The product's own status: only `active` can ever be bought. */
  status: string;
  /** ISO timestamp, or null for "available now". */
  availableFrom: string | null;
  preorder: boolean;
  /** Null = untracked stock (always in stock). */
  stockQuantity: number | null;
};

export type ProductAvailability =
  /** Buyable right now. */
  | { state: "available"; purchasable: true }
  /** Announced, not yet open. Shown with its drop time; not purchasable. */
  | { state: "upcoming"; purchasable: false; availableFrom: string }
  /** Announced and open for preorder before the drop. */
  | { state: "preorder"; purchasable: true; availableFrom: string | null }
  /** Out of stock and not preorderable. */
  | { state: "sold_out"; purchasable: false }
  /** Archived, draft or otherwise not on sale. */
  | { state: "unavailable"; purchasable: false };

/**
 * Resolve one product's availability.
 *
 * `nowMs` is passed in rather than read, so this stays pure and every caller
 * (server render, checkout gate, tests) can agree on a single instant. Two
 * gates evaluating `Date.now()` a few milliseconds apart is not a real risk;
 * a test that cannot pin the clock is.
 */
export function productAvailability(
  p: ProductAvailabilityInput,
  nowMs: number,
): ProductAvailability {
  if (p.status !== "active" && p.status !== "sold_out") {
    return { state: "unavailable", purchasable: false };
  }

  const dropsAt = p.availableFrom ? Date.parse(p.availableFrom) : null;
  // An unparseable timestamp is treated as "no drop time" rather than as a
  // drop in the infinite future: the failure mode of bad data must be a
  // product an artist can sell, not one silently frozen out of their shop.
  const hasFutureDrop =
    dropsAt !== null && Number.isFinite(dropsAt) && nowMs < dropsAt;

  // Stock only blocks when it is TRACKED and exhausted. Null means untracked,
  // which is how most artist goods work.
  const outOfStock =
    p.status === "sold_out" ||
    (p.stockQuantity !== null && p.stockQuantity <= 0);

  if (hasFutureDrop) {
    // Preorder is what makes an announced product buyable early. Without it,
    // an upcoming product is visible and not purchasable, which is the queue
    // the artist chose.
    return p.preorder
      ? { state: "preorder", purchasable: true, availableFrom: p.availableFrom }
      : {
          state: "upcoming",
          purchasable: false,
          availableFrom: p.availableFrom as string,
        };
  }

  if (outOfStock) {
    // Preorder also covers selling past zero on an already-dropped product,
    // which is the "more coming" case.
    return p.preorder
      ? { state: "preorder", purchasable: true, availableFrom: p.availableFrom }
      : { state: "sold_out", purchasable: false };
  }

  return { state: "available", purchasable: true };
}

/** Client-facing label for a state. Null when the product needs no badge. */
export function availabilityLabel(
  a: ProductAvailability,
  formatDate: (iso: string) => string,
): string | null {
  switch (a.state) {
    case "upcoming":
      return `Drops ${formatDate(a.availableFrom)}`;
    case "preorder":
      return "Preorder";
    case "sold_out":
      return "Sold out";
    default:
      return null;
  }
}

/**
 * Whether a sale should raise a low-stock alert.
 *
 * Fires on the CROSSING, not on every sale below the line: an artist selling
 * ten of a low-stocked item does not want ten notifications. `alertedAt` is
 * cleared when stock rises again (a restock), which is what makes a second
 * alert possible later.
 */
export function shouldAlertLowStock(input: {
  threshold: number | null;
  stockAfter: number | null;
  alreadyAlerted: boolean;
}): boolean {
  if (input.threshold === null) return false;
  if (input.stockAfter === null) return false;
  if (input.alreadyAlerted) return false;
  return input.stockAfter <= input.threshold;
}
