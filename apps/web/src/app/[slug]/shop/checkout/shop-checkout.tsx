"use client";

import { useMemo, useState, useTransition } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { formatPrice } from "@/lib/goods";
import {
  ORDER_WITH_OBLIGATION_LABEL,
  CUSTOM_MADE_NOTICE,
  summarizeReturnDisclosure,
  type ReturnDisclosureSummary,
  type ReturnDisclosureItem,
} from "@inklee/shared/consumer-disclosures";
import {
  startShopCheckoutAction,
  startCartCheckoutAction,
  addToCartAction,
  addBundleToCartAction,
  updateCartItemQuantityAction,
  removeCartItemAction,
  addToWishlistAction,
  removeFromWishlistByProductAction,
} from "./actions";

// The guest buyer's checkout (GC1 C3). Two phases on one page: pick + email,
// then pay (PaymentElement on the intent the server created). Every amount on
// screen is display-only; the server core recomputes everything from its own
// catalog, so a tampered client can only pay the REAL total or nothing.

export type CheckoutProduct = {
  id: string;
  title: string;
  priceAmount: number;
  currency: string;
  imageUrl: string | null;
  soldOut: boolean;
  /** Announced drop that has not opened yet: rendered, not addable. */
  upcoming?: boolean;
  /** Art. 16(c) exemption (C1.2): no right of return on this item. */
  customMade?: boolean;
  variants: {
    id: string;
    name: string;
    priceAmount: number | null;
    soldOut: boolean;
  }[];
};

export type CheckoutBundle = {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
  /** Display-only saving vs the parts, major units; 0 hides the line. */
  savingsAmount: number;
  /** "2x Print A + Tote bag" style summary of what is inside. */
  componentSummary: string;
  /** Purchasable right now (visible components in stock). Display-only; the
   *  server re-checks at order time. */
  available: boolean;
  /** C1.2: true when ANY component is custom-made (resolveBundleLines' rule,
   *  mirrored here so the bundle listing and the pay-phase disclosure agree). */
  customMade?: boolean;
};

// FD5: the buyer's PERSISTED, seller-scoped cart for THIS artist — separate
// from the local `quantities`/`bundleQuantities` state below, which drives
// the existing self-contained "Buy now" flow (decision: Buy now stays, per
// the ruling, as an independent path rather than being folded into the
// cart). Mirrors shop-cart.ts's `CartDisplay`/`CartDisplayLine` shape rather
// than importing those types from a `server-only` module, matching this
// file's own existing convention of defining its own display types
// (CheckoutProduct/CheckoutBundle above) instead of importing server ones.
export type CartLine = {
  cartItemId: string;
  kind: "product" | "bundle";
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  title: string;
  variantName: string | null;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
  currency: string;
  available: boolean;
  unavailableReason: string | null;
  /** C1.2: true when this line cannot be returned. */
  customMade?: boolean;
};

export type CartState = {
  cartId: string | null;
  lines: CartLine[];
  totalMinor: number;
  currency: string;
};

const MAX_QTY = 10;

type Phase =
  | { step: "pick" }
  | {
      step: "pay";
      clientSecret: string;
      totalMinor: number;
      /** C1.2: fixed at the moment the order was started, from whichever
       *  items (Buy-now selections or cart lines) it actually contains — the
       *  pick-phase panel below is a live, combined preview and can differ
       *  from this once the buyer has moved on. */
      disclosure: ReturnDisclosureSummary;
    };

/** C1.1/C1.2 disclosure panel: the seller block, always shown, plus whichever
 *  of the standard return notice / custom-made notice / both applies. Shared
 *  between the pick screen and the pay screen so the two can never disagree
 *  about wording (only the ITEMS behind `disclosure` differ between them). */
function DisclosurePanel({
  sellerDisclosureBlock,
  returnNotice,
  disclosure,
}: {
  sellerDisclosureBlock: string;
  returnNotice: string;
  disclosure: ReturnDisclosureSummary;
}) {
  return (
    <div className="space-y-3 rounded-[14px] border border-border p-4 text-sm text-foreground">
      <p className="whitespace-pre-line text-muted-foreground">
        {sellerDisclosureBlock}
      </p>
      {disclosure === "all_custom_made" && <p>{CUSTOM_MADE_NOTICE}</p>}
      {disclosure === "mixed" && (
        <div className="space-y-2">
          <p>
            Some items in your order are custom-made and cannot be returned:
          </p>
          <p>{CUSTOM_MADE_NOTICE}</p>
          <p>The remaining items qualify for the standard return right:</p>
          <p className="whitespace-pre-line">{returnNotice}</p>
        </div>
      )}
      {(disclosure === "all_returnable" || disclosure === "empty") && (
        <p className="whitespace-pre-line">{returnNotice}</p>
      )}
    </div>
  );
}

function PayInner({
  totalMinor,
  artistName,
  onPaid,
}: {
  totalMinor: number;
  artistName: string;
  onPaid: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (stripeError) {
      setError(stripeError.message ?? "Payment failed. Try again.");
      setProcessing(false);
      return;
    }
    onPaid();
  };

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        onClick={handlePay}
        disabled={!stripe || processing}
        className="w-full rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {processing
          ? "Processing..."
          : `${ORDER_WITH_OBLIGATION_LABEL} ${formatPrice(totalMinor / 100, "eur")} to ${artistName}`}
      </button>
    </div>
  );
}

export function ShopCheckout({
  slug,
  artistName,
  products,
  bundles = [],
  stripePublishableKey,
  initialCart,
  wishlistedKeys = [],
  sellerDisclosureBlock,
  returnNotice,
}: {
  slug: string;
  artistName: string;
  products: CheckoutProduct[];
  bundles?: CheckoutBundle[];
  stripePublishableKey: string;
  /** FD5: the buyer's persisted cart for THIS artist, resolved server-side
   *  (guest cookie) before render. Absent buyer -> empty cart, never an
   *  error. */
  initialCart?: CartState;
  /** `${productId}::${variantId ?? ""}` keys already on the buyer's
   *  wishlist, for the heart button's initial filled/unfilled state. */
  wishlistedKeys?: string[];
  /** C1.1 verbatim seller block, pre-rendered server-side from the artist's
   *  real seller data (the page already enforces sellerDataComplete). */
  sellerDisclosureBlock: string;
  /** C1.2 verbatim standard return notice, pre-rendered server-side. */
  returnNotice: string;
}) {
  const stripePromise = useMemo(
    () => loadStripe(stripePublishableKey),
    [stripePublishableKey],
  );
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>({ step: "pick" });
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  // quantities keyed by `${productId}::${variantId ?? ""}`.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // Bundle quantities keyed by bundle id.
  const [bundleQuantities, setBundleQuantities] = useState<
    Record<string, number>
  >({});
  // The chosen variant per product (products with variants need one).
  const [variantChoice, setVariantChoice] = useState<Record<string, string>>(
    {},
  );

  // FD5: persisted cart + wishlist. Separate pending/error state from the
  // Buy-now flow above — a cart mutation must never disable or block the
  // independent Buy-now "Continue" button, and vice versa.
  const [cart, setCart] = useState<CartState>(
    initialCart ?? { cartId: null, lines: [], totalMinor: 0, currency: "eur" },
  );
  const [wishlisted, setWishlisted] = useState<Set<string>>(
    () => new Set(wishlistedKeys),
  );
  const [cartBusyKey, setCartBusyKey] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [, startCartTransition] = useTransition();

  const wishlistKey = (productId: string, variantId: string | null) =>
    `${productId}::${variantId ?? ""}`;

  const toggleWishlist = (productId: string, variantId: string | null) => {
    const key = wishlistKey(productId, variantId);
    const isWishlisted = wishlisted.has(key);
    // Optimistic: a heart toggle is low-stakes and instant feedback matters
    // more here than anywhere else on this page.
    setWishlisted((prev) => {
      const next = new Set(prev);
      if (isWishlisted) next.delete(key);
      else next.add(key);
      return next;
    });
    startCartTransition(async () => {
      const result = isWishlisted
        ? await removeFromWishlistByProductAction({ productId, variantId })
        : await addToWishlistAction({ slug, productId, variantId });
      if (!result.ok) {
        // Revert the optimistic flip and surface why.
        setWishlisted((prev) => {
          const next = new Set(prev);
          if (isWishlisted) next.add(key);
          else next.delete(key);
          return next;
        });
        setCartError(result.error);
      }
    });
  };

  const addProductToCart = (productId: string, variantId: string | null) => {
    setCartError(null);
    const key = wishlistKey(productId, variantId);
    setCartBusyKey(key);
    startCartTransition(async () => {
      const result = await addToCartAction({
        slug,
        productId,
        variantId,
        quantity: 1,
      });
      setCartBusyKey(null);
      if (!result.ok) {
        setCartError(result.error);
        return;
      }
      setCart(result.cart);
    });
  };

  const addBundleToCart = (bundleId: string) => {
    setCartError(null);
    setCartBusyKey(`bundle::${bundleId}`);
    startCartTransition(async () => {
      const result = await addBundleToCartAction({
        slug,
        bundleId,
        quantity: 1,
      });
      setCartBusyKey(null);
      if (!result.ok) {
        setCartError(result.error);
        return;
      }
      setCart(result.cart);
    });
  };

  const setCartLineQuantity = (cartItemId: string, quantity: number) => {
    setCartError(null);
    setCartBusyKey(cartItemId);
    startCartTransition(async () => {
      const result = await updateCartItemQuantityAction({
        slug,
        cartItemId,
        quantity,
      });
      setCartBusyKey(null);
      if (!result.ok) {
        setCartError(result.error);
        return;
      }
      setCart(result.cart);
    });
  };

  const removeCartLine = (cartItemId: string) => {
    setCartError(null);
    setCartBusyKey(cartItemId);
    startCartTransition(async () => {
      const result = await removeCartItemAction({ slug, cartItemId });
      setCartBusyKey(null);
      if (!result.ok) {
        setCartError(result.error);
        return;
      }
      setCart(result.cart);
    });
  };

  const cartAvailableCount = cart.lines.filter((l) => l.available).length;

  const startCartCheckout = () => {
    setCartError(null);
    startTransition(async () => {
      const result = await startCartCheckoutAction({
        slug,
        email,
        discountCode: discountCode.trim() || undefined,
      });
      if (!result.ok) {
        setCartError(result.error);
        return;
      }
      setPhase({
        step: "pay",
        clientSecret: result.clientSecret,
        totalMinor: result.totalMinor,
        disclosure: disclosureForCart,
      });
    });
  };

  const setQty = (key: string, qty: number) =>
    setQuantities((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(MAX_QTY, Math.trunc(qty))),
    }));

  const setBundleQty = (id: string, qty: number) =>
    setBundleQuantities((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(MAX_QTY, Math.trunc(qty))),
    }));

  const selections = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([key, quantity]) => {
          const [productId, variantId] = key.split("::");
          return {
            productId,
            variantId: variantId || null,
            quantity,
          };
        }),
    [quantities],
  );

  const bundleSelections = useMemo(
    () =>
      Object.entries(bundleQuantities)
        .filter(([, qty]) => qty > 0)
        .map(([bundleId, quantity]) => ({ bundleId, quantity })),
    [bundleQuantities],
  );

  const nothingPicked =
    selections.length === 0 && bundleSelections.length === 0;

  // Display-only estimate; the server total is authoritative and shown on the
  // pay button once the intent exists.
  const estimateMinor = useMemo(() => {
    let sum = 0;
    for (const s of selections) {
      const p = products.find((x) => x.id === s.productId);
      if (!p) continue;
      const v = s.variantId
        ? p.variants.find((x) => x.id === s.variantId)
        : null;
      const unit = v?.priceAmount ?? p.priceAmount;
      sum += Math.round(unit * 100) * s.quantity;
    }
    for (const s of bundleSelections) {
      const b = bundles.find((x) => x.id === s.bundleId);
      if (!b) continue;
      sum += Math.round(b.priceAmount * 100) * s.quantity;
    }
    return sum;
  }, [selections, products, bundleSelections, bundles]);

  // C1.2: the Buy-now selections currently on screen, as disclosure items —
  // fixed into the Phase at the moment checkout actually starts, since the
  // buyer's picks are free to keep changing after that.
  const selectionDisclosureItems = useMemo((): ReturnDisclosureItem[] => {
    const items: ReturnDisclosureItem[] = [];
    for (const s of selections) {
      const p = products.find((x) => x.id === s.productId);
      if (p) items.push({ customMade: p.customMade === true });
    }
    for (const s of bundleSelections) {
      const b = bundles.find((x) => x.id === s.bundleId);
      if (b) items.push({ customMade: b.customMade === true });
    }
    return items;
  }, [selections, products, bundleSelections, bundles]);
  const disclosureForSelections = summarizeReturnDisclosure(
    selectionDisclosureItems,
  );

  // Same idea for the persisted cart, scoped to lines that are actually
  // payable (an unavailable line is refused at checkout, so it never becomes
  // a real order line).
  const cartDisclosureItems = useMemo(
    (): ReturnDisclosureItem[] =>
      cart.lines
        .filter((l) => l.available)
        .map((l) => ({ customMade: l.customMade === true })),
    [cart.lines],
  );
  const disclosureForCart = summarizeReturnDisclosure(cartDisclosureItems);

  // Combined, live preview shown on the pick screen: a superset of both
  // checkout avenues, since the buyer can act on either button from there.
  const pickDisclosure = summarizeReturnDisclosure([
    ...selectionDisclosureItems,
    ...cartDisclosureItems,
  ]);

  const startCheckout = () => {
    setError(null);
    startTransition(async () => {
      const result = await startShopCheckoutAction({
        slug,
        email,
        selections,
        bundles: bundleSelections,
        discountCode: discountCode.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPhase({
        step: "pay",
        clientSecret: result.clientSecret,
        totalMinor: result.totalMinor,
        disclosure: disclosureForSelections,
      });
    });
  };

  if (paid) {
    return (
      <div className="space-y-1 rounded-[14px] border border-border p-4">
        <p className="text-sm font-medium text-foreground">Order placed</p>
        <p className="text-sm text-muted-foreground">
          Thanks. Your payment went through, and a receipt is on its way to your
          email. {artistName} will be in touch about pickup or delivery.
        </p>
      </div>
    );
  }

  if (phase.step === "pay") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setPhase({ step: "pick" })}
          className="text-sm text-muted-foreground underline"
        >
          Back to items
        </button>
        <DisclosurePanel
          sellerDisclosureBlock={sellerDisclosureBlock}
          returnNotice={returnNotice}
          disclosure={phase.disclosure}
        />
        <Elements
          stripe={stripePromise}
          options={{ clientSecret: phase.clientSecret }}
        >
          <PayInner
            totalMinor={phase.totalMinor}
            artistName={artistName}
            onPaid={() => setPaid(true)}
          />
        </Elements>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/[0.04] px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {bundles.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-foreground">Bundles</h2>
          <ul className="space-y-2">
            {bundles.map((b) => {
              const qty = bundleQuantities[b.id] ?? 0;
              return (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {b.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatPrice(b.priceAmount, b.currency)}
                      {b.savingsAmount > 0
                        ? ` · save ${formatPrice(b.savingsAmount, b.currency)}`
                        : ""}
                      {b.available ? "" : " · unavailable"}
                      {b.customMade ? " · custom-made, no returns" : ""}
                    </p>
                    {b.componentSummary && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {b.componentSummary}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBundleQty(b.id, qty - 1)}
                      disabled={qty === 0}
                      aria-label={`Fewer ${b.name}`}
                      className="rounded-md border border-border px-2.5 py-1 text-sm text-foreground disabled:opacity-40"
                    >
                      -
                    </button>
                    <span className="w-6 text-center text-sm text-foreground">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBundleQty(b.id, qty + 1)}
                      disabled={!b.available || qty >= MAX_QTY}
                      aria-label={`More ${b.name}`}
                      className="rounded-md border border-border px-2.5 py-1 text-sm text-foreground disabled:opacity-40"
                    >
                      +
                    </button>
                    {/* FD5: adds to the PERSISTED, seller-scoped cart —
                        independent of the Buy-now stepper above. */}
                    <button
                      type="button"
                      onClick={() => addBundleToCart(b.id)}
                      disabled={
                        !b.available || cartBusyKey === `bundle::${b.id}`
                      }
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
                    >
                      Add to cart
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ul className="space-y-2">
        {products.map((p) => {
          const hasVariants = p.variants.length > 0;
          const chosenVariant = hasVariants
            ? (variantChoice[p.id] ?? p.variants[0]?.id ?? "")
            : "";
          const key = `${p.id}::${hasVariants ? chosenVariant : ""}`;
          const qty = quantities[key] ?? 0;
          const variant = hasVariants
            ? p.variants.find((v) => v.id === chosenVariant)
            : null;
          const unit = variant?.priceAmount ?? p.priceAmount;
          const soldOut = hasVariants ? (variant?.soldOut ?? true) : p.soldOut;
          const effectiveVariantId = hasVariants ? chosenVariant || null : null;
          const isWishlisted = wishlisted.has(
            wishlistKey(p.id, effectiveVariantId),
          );
          const addBusyKey = wishlistKey(p.id, effectiveVariantId);
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-foreground">
                    {p.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleWishlist(p.id, effectiveVariantId)}
                    aria-label={
                      isWishlisted
                        ? `Remove ${p.title} from wishlist`
                        : `Save ${p.title} to wishlist`
                    }
                    aria-pressed={isWishlisted}
                    className="shrink-0 text-sm leading-none text-muted-foreground hover:text-foreground"
                  >
                    {isWishlisted ? "♥" : "♡"}
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatPrice(unit, p.currency)}
                  {p.upcoming ? " · drops soon" : soldOut ? " · sold out" : ""}
                  {p.customMade ? " · custom-made, no returns" : ""}
                </p>
                {hasVariants && (
                  <select
                    value={chosenVariant}
                    aria-label={`${p.title} option`}
                    onChange={(e) =>
                      setVariantChoice((prev) => ({
                        ...prev,
                        [p.id]: e.target.value,
                      }))
                    }
                    className="mt-1 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground"
                  >
                    {p.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.soldOut ? " (sold out)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQty(key, qty - 1)}
                  disabled={qty === 0}
                  aria-label={`Fewer ${p.title}`}
                  className="rounded-md border border-border px-2.5 py-1 text-sm text-foreground disabled:opacity-40"
                >
                  -
                </button>
                <span className="w-6 text-center text-sm text-foreground">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(key, qty + 1)}
                  disabled={soldOut || p.upcoming === true || qty >= MAX_QTY}
                  aria-label={`More ${p.title}`}
                  className="rounded-md border border-border px-2.5 py-1 text-sm text-foreground disabled:opacity-40"
                >
                  +
                </button>
                {/* FD5: adds to the PERSISTED, seller-scoped cart —
                    independent of the Buy-now stepper's local `qty`. */}
                <button
                  type="button"
                  onClick={() => addProductToCart(p.id, effectiveVariantId)}
                  disabled={
                    soldOut || p.upcoming === true || cartBusyKey === addBusyKey
                  }
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
                >
                  Add to cart
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {(cart.lines.length > 0 || cartError) && (
        <div className="space-y-2 rounded-[14px] border border-border p-4">
          <h2 className="text-sm font-medium text-foreground">
            Your cart{cartAvailableCount > 0 ? ` (${cartAvailableCount})` : ""}
          </h2>
          {cartError && <p className="text-sm text-destructive">{cartError}</p>}
          {cart.lines.length > 0 && (
            <ul className="space-y-2">
              {cart.lines.map((line) => (
                <li
                  key={line.cartItemId}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {line.title}
                      {line.variantName ? ` · ${line.variantName}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatPrice(line.unitAmount, line.currency)} ×{" "}
                      {line.quantity}
                      {line.available
                        ? ` = ${formatPrice(line.lineTotal, line.currency)}`
                        : ` · ${line.unavailableReason ?? "unavailable"}`}
                      {line.customMade ? " · custom-made, no returns" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCartLineQuantity(line.cartItemId, line.quantity - 1)
                      }
                      disabled={cartBusyKey === line.cartItemId}
                      aria-label={`Fewer ${line.title}`}
                      className="rounded-md border border-border px-2.5 py-1 text-sm text-foreground disabled:opacity-40"
                    >
                      -
                    </button>
                    <span className="w-6 text-center text-sm text-foreground">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCartLineQuantity(line.cartItemId, line.quantity + 1)
                      }
                      disabled={
                        cartBusyKey === line.cartItemId ||
                        line.quantity >= MAX_QTY
                      }
                      aria-label={`More ${line.title}`}
                      className="rounded-md border border-border px-2.5 py-1 text-sm text-foreground disabled:opacity-40"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCartLine(line.cartItemId)}
                      disabled={cartBusyKey === line.cartItemId}
                      aria-label={`Remove ${line.title}`}
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-foreground">Your email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
            autoComplete="email"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">
            {/* C1.4 verbatim (docs/legal/counsel-accountant-handoff-2026-08.md
                PART 4): "We use your email for your receipt and so [artist]
                can arrange delivery. It is kept as part of the order record.
                [Privacy policy]". Plain <a>, not <Link> (same reasoning as
                cookie-banner.tsx): /privacy is apex-only and the host.ts
                safety net rewrites a plain anchor correctly on an artist
                subdomain, where a client-side RSC navigation would not. */}
            We use your email for your receipt and so {artistName} can arrange
            delivery. It is kept as part of the order record.{" "}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/privacy"
              className="text-foreground underline underline-offset-4"
            >
              Privacy policy
            </a>
            .
          </span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-foreground">
            Discount code (optional)
          </span>
          <input
            value={discountCode}
            onChange={(e) => setDiscountCode(e.target.value)}
            placeholder="CODE"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      </div>

      <DisclosurePanel
        sellerDisclosureBlock={sellerDisclosureBlock}
        returnNotice={returnNotice}
        disclosure={pickDisclosure}
      />

      <button
        type="button"
        onClick={startCheckout}
        disabled={pending || nothingPicked || !email.includes("@")}
        className="w-full rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending
          ? "Preparing..."
          : nothingPicked
            ? "Pick something to buy"
            : `Buy now (${formatPrice(estimateMinor / 100, "eur")})`}
      </button>

      {cartAvailableCount > 0 && (
        <button
          type="button"
          onClick={startCartCheckout}
          disabled={pending || !email.includes("@")}
          className="w-full rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground disabled:opacity-50"
        >
          {pending
            ? "Preparing..."
            : `Checkout cart (${formatPrice(cart.totalMinor / 100, cart.currency)})`}
        </button>
      )}

      <p className="text-xs text-muted-foreground">
        The final total, including any discount, is confirmed on the next step
        before you pay. Buy now and your cart are separate: {artistName} is the
        seller either way, and a cart never combines items from more than one
        artist.
      </p>
    </div>
  );
}
