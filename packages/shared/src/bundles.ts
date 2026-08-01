// Product bundles (Plus build, Stage 3).
//
// A bundle is a named group of products sold together at ONE set price. It is
// modelled on product collections (a parent + a per-artist, positioned join),
// with two additions collections do not have: the bundle carries its OWN price,
// and the model computes the SAVING vs the sum of the components' list prices so
// the offer can be shown ("Save 12 EUR"). Membership + ordering live in
// `product_bundle_items` (migration 0132).
//
// Pure and framework-free (web + native + server share this one module). The
// PAYABLE checkout (turning a bundle into order_items) is a separate slice; this
// module is the entity model + the display arithmetic only. See
// docs/product/plus-build-time-decisions.md B1/B2.

export const BUNDLE_NAME_MAX = 60;

// A payload-sanity bound, NOT an invented product rule (collections deliberately
// removed their count cap). A bundle with dozens of products is unusual; this
// only stops an absurd or hostile payload, and the editor caps at the same
// number so the artist never hits it in normal use.
export const MAX_BUNDLE_ITEMS = 50;

export type Bundle = {
  id: string;
  name: string;
  /** The offer price, in major currency units (e.g. 40.00), matching how
   *  products carry price_amount. */
  priceAmount: number;
  currency: string;
  position: number;
  isPublicVisible: boolean;
  /** ISO timestamp, or null/absent when live. Archived bundles keep their items
   *  so a restore brings the offer back whole. */
  archivedAt?: string | null;
};

/** One product's place in one bundle. */
export type BundleItem = {
  bundleId: string;
  productId: string;
  /**
   * The ARTIST's fixed variant choice for this slot (FD6, variant-aware
   * bundles; supersedes GC7's blanket refusal of any variant-bearing
   * component). Chosen once, when the bundle is built — a bundle is still
   * bought as ONE unit at checkout, so there is no buyer-time variant picker.
   * Null means "no variant needed", which is only a complete answer while the
   * product itself has no ACTIVE variant to choose; a variant-bearing product
   * with a null slot is UN-SELECTABLE (see `bundlePurchasable`'s
   * `component_needs_variant` reason) rather than silently sold or silently
   * broken.
   */
  variantId: string | null;
  /** How many of this product the bundle includes. Always >= 1. */
  quantity: number;
  position: number;
};

export function normalizeBundleName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, BUNDLE_NAME_MAX);
}

export function validateBundleName(name: string): string | null {
  if (name.length < 2) return "Give the bundle a name.";
  if (name.length > BUNDLE_NAME_MAX) {
    return `Use at most ${BUNDLE_NAME_MAX} characters.`;
  }
  return null;
}

/** A bundle price must be a non-negative, finite amount. The offer can be free
 *  in principle (a giveaway), so the floor is 0, not >0; publishing an empty or
 *  zero-value bundle is a UI concern, not a data invariant. */
export function validateBundlePrice(amount: number): string | null {
  if (!Number.isFinite(amount) || amount < 0) {
    return "Enter a valid bundle price.";
  }
  return null;
}

/** A bundle is shown publicly only when it is both visible and not archived.
 *  Two decisions; either one alone hides it. */
export function isBundlePublic(b: Bundle): boolean {
  return b.isPublicVisible && !b.archivedAt;
}

/** The artist's working list: everything not archived, in their order. */
export function liveBundles(bundles: Bundle[]): Bundle[] {
  return bundles
    .filter((b) => !b.archivedAt)
    .sort((a, b) => a.position - b.position);
}

export function archivedBundles(bundles: Bundle[]): Bundle[] {
  return bundles
    .filter((b) => !!b.archivedAt)
    .sort((a, b) => a.position - b.position);
}

/**
 * Whether a bundle may be hard-deleted: only once ARCHIVED.
 *
 * Unlike collections (which allow deleting an EMPTY live collection), a bundle
 * must be archived first, with no empty-delete fast path. That is deliberate,
 * not stricter for its own sake: "delete this if it has no items" is a
 * `delete ... where not exists(items)` that is NOT atomic under READ COMMITTED
 * (finding #19), and collections needed a lock-then-recheck RPC to make it safe.
 * Gating delete on the stable `archived_at` removes the emptiness check, so that
 * race cannot exist here. Archiving keeps the items so a restore is whole; the
 * itemCount argument is accepted for a symmetrical signature but does not gate.
 */
export function canDeleteBundle(b: Bundle, _itemCount?: number): boolean {
  return !!b.archivedAt;
}

export type BundleSavings = {
  /** Sum of each component's list price * quantity, in major units. */
  componentTotal: number;
  /** componentTotal - bundle price, floored at 0 (a bundle priced ABOVE its
   *  components shows no "saving", never a negative one). */
  savingsAmount: number;
  /** 0-100, rounded. 0 when there is no saving or no component total. */
  savingsPercent: number;
  /** True only when the bundle genuinely costs less than buying the parts. */
  isSaving: boolean;
};

/**
 * The display arithmetic for an offer: how much a bundle saves vs buying its
 * products separately at their list prices.
 *
 * DISPLAY ONLY. This never sets what is charged (the bundle's own `priceAmount`
 * is the price); it exists so the shop can show "normally 52, bundle 40, save
 * 12". `components` are the bundle's products with their current list price and
 * the bundle's quantity for each. A component whose product is missing (out of
 * stock / hidden) is simply omitted by the caller, which understates the saving
 * rather than overstating it, the safe direction for a public claim.
 */
/** Major-units price -> integer minor units, matching the checkout's own
 *  `Math.round(x * 100)` conversion so a bundle and a product never round
 *  differently. */
export function bundlePriceMinor(priceAmount: number): number {
  return Math.max(
    0,
    Math.round((Number.isFinite(priceAmount) ? priceAmount : 0) * 100),
  );
}

/**
 * The single payable goods line a bundle contributes at checkout (decision
 * B2, revised by GC6).
 *
 * A bundle becomes ONE first-class `bundle` line at the BUNDLE price, so the
 * goods-fee base is unambiguously the bundle price and NEVER the sum of the
 * components' list prices. The components are snapshotted at sale time
 * (order_item_bundle_components, migration 0135) for fulfilment and records;
 * they are not each priced into the fee base. `goodsBaseMinorFromLines`
 * (order-fees.ts) counts `bundle` lines alongside `product` lines, so a bundle
 * drops into the existing appointment-plus-goods fee composition.
 */
export function bundleGoodsLine(bundle: {
  id: string;
  name: string;
  priceAmount: number;
}): { type: "bundle"; name: string; bundleId: string; totalMinor: number } {
  return {
    type: "bundle",
    name: bundle.name,
    bundleId: bundle.id,
    totalMinor: bundlePriceMinor(bundle.priceAmount),
  };
}

export type BundlePurchasability =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not_public"
        | "empty"
        | "component_unavailable"
        | "component_out_of_stock"
        // FD6: a component whose product HAS an active variant to choose,
        // but whose bundle slot carries no variant selection at all. The
        // honest remnant of GC7's blanket refusal — un-selectable, not
        // "any variant present".
        | "component_needs_variant";
    };

/** One resolved bundle component, as `bundlePurchasable` consumes it. Callers
 *  build this with `resolveBundleComponent` below rather than by hand, so the
 *  server checkout and any display mirror cannot diverge on the rule. */
export type BundleComponentResolution = {
  /** Bundle-declared count of this product per ONE bundle. */
  quantity: number;
  /** The artist's fixed variant choice for this slot (`BundleItem.variantId`). */
  variantId: string | null;
  /** Whether the product currently has at least one ACTIVE variant to choose
   *  from. Together with `variantId`, this is what distinguishes "no variant
   *  needed" from "un-selectable". */
  productHasActiveVariants: boolean;
  /** The RESOLVED sellable unit: the chosen variant's stock when `variantId`
   *  is set and resolves, the product's own stock when the product has no
   *  active variant. Null when nothing resolved at all (missing/archived/
   *  hidden/undropped product, or a variant id that did not resolve against
   *  THIS product's own variant list — the cross-product / unknown case). */
  resolved: { stock: number | null } | null;
};

/**
 * The catalog facts `resolveBundleComponent` needs for ONE component product,
 * already filtered to the SELLABLE catalog (active + publicly visible +
 * matching currency + dropped, the same read that prices the order).
 */
export type BundleComponentCatalogInfo = {
  /** Whether the product itself resolves as purchasable right now (status,
   *  drop/preorder timing), independent of variants. Callers compute this
   *  with `productAvailability`. */
  available: boolean;
  /** Every ACTIVE variant of this product. */
  activeVariants: { id: string; stock: number | null }[];
  /** The product's own tracked stock, consulted only when it has no active
   *  variant (null = untracked = unlimited). */
  productStock: number | null;
};

/**
 * Resolve ONE bundle component against the live catalog (FD6). Pure and
 * SHARED, so the money path (goods-checkout.ts) and any display mirror (the
 * standalone checkout page's own sellability preview) consult the identical
 * rule instead of maintaining two copies that can drift — which is exactly
 * how GC7's blanket-refusal duplicate lived in two files before this.
 *
 * `info` is null when the component product itself does not resolve at all
 * (missing from the sellable catalog read).
 */
export function resolveBundleComponent(
  variantId: string | null,
  info: BundleComponentCatalogInfo | null,
): Pick<BundleComponentResolution, "productHasActiveVariants" | "resolved"> {
  const productHasActiveVariants = (info?.activeVariants.length ?? 0) > 0;
  if (!info || !info.available) {
    return { productHasActiveVariants, resolved: null };
  }
  if (variantId) {
    // Scoped to THIS product's own active-variant list only — never a global
    // variant lookup. A variant id belonging to a different product (or a
    // hidden/sold-out one, filtered out of activeVariants) simply does not
    // match, which is both the "variant exists" and the "variant belongs to
    // this product" checks in one comparison.
    const variant = info.activeVariants.find((v) => v.id === variantId);
    return {
      productHasActiveVariants,
      resolved: variant ? { stock: variant.stock } : null,
    };
  }
  if (productHasActiveVariants) {
    // Un-selectable: the product requires a choice this slot does not carry.
    return { productHasActiveVariants, resolved: null };
  }
  return { productHasActiveVariants, resolved: { stock: info.productStock } };
}

/**
 * Whether a bundle can be SOLD right now (decision GC6, variant-aware per
 * FD6). Display rules and sale rules deliberately differ: the shop MAY show a
 * bundle while omitting a hidden component (understating the saving, the safe
 * direction for a claim), but the checkout must refuse to charge for a bundle
 * it cannot fulfil whole.
 *
 * The caller resolves each component with `resolveBundleComponent` against
 * the SELLABLE catalog. That keeps this function pure and makes the
 * money-path rule explicit at the call site: an artist can legitimately keep
 * a hidden or archived product inside a bundle (the editor allows it), and
 * the answer is "not purchasable", never "sell it short".
 *
 * Stock is the RESOLVED unit's tracked quantity (`null` = untracked =
 * unlimited, matching the product card's own sold-out rule) — the chosen
 * variant's stock when one is selected, the parent product's otherwise.
 */
export function bundlePurchasable(
  bundle: Bundle,
  components: BundleComponentResolution[],
  /** How many bundles the buyer wants. */
  lineQuantity = 1,
): BundlePurchasability {
  if (!isBundlePublic(bundle)) return { ok: false, reason: "not_public" };
  if (components.length === 0) return { ok: false, reason: "empty" };
  const wanted = Number.isFinite(lineQuantity) ? Math.max(1, lineQuantity) : 1;
  for (const c of components) {
    if (c.productHasActiveVariants && !c.variantId) {
      return { ok: false, reason: "component_needs_variant" };
    }
    if (!c.resolved) return { ok: false, reason: "component_unavailable" };
    const perBundle = Number.isFinite(c.quantity) ? Math.max(1, c.quantity) : 1;
    const { stock } = c.resolved;
    if (stock !== null && stock < perBundle * wanted) {
      return { ok: false, reason: "component_out_of_stock" };
    }
  }
  return { ok: true };
}

export function bundleSavings(
  bundlePriceAmount: number,
  components: { priceAmount: number; quantity: number }[],
): BundleSavings {
  const componentTotal = components.reduce(
    (sum, c) =>
      sum +
      (Number.isFinite(c.priceAmount) ? Math.max(0, c.priceAmount) : 0) *
        (Number.isFinite(c.quantity) ? Math.max(0, c.quantity) : 0),
    0,
  );
  const price = Number.isFinite(bundlePriceAmount)
    ? Math.max(0, bundlePriceAmount)
    : 0;
  const rawSaving = componentTotal - price;
  const savingsAmount = rawSaving > 0 ? rawSaving : 0;
  const savingsPercent =
    componentTotal > 0 && savingsAmount > 0
      ? Math.round((savingsAmount / componentTotal) * 100)
      : 0;
  return {
    componentTotal,
    savingsAmount,
    savingsPercent,
    isSaving: savingsAmount > 0,
  };
}
