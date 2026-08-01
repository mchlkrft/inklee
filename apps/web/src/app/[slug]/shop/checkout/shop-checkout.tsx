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
import { startShopCheckoutAction } from "./actions";

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
};

const MAX_QTY = 10;

type Phase =
  | { step: "pick" }
  | { step: "pay"; clientSecret: string; totalMinor: number };

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
          : `Pay ${formatPrice(totalMinor / 100, "eur")} to ${artistName}`}
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
}: {
  slug: string;
  artistName: string;
  products: CheckoutProduct[];
  bundles?: CheckoutBundle[];
  stripePublishableKey: string;
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
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {p.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatPrice(unit, p.currency)}
                  {soldOut ? " · sold out" : ""}
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
                  disabled={soldOut || qty >= MAX_QTY}
                  aria-label={`More ${p.title}`}
                  className="rounded-md border border-border px-2.5 py-1 text-sm text-foreground disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

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
            Your receipt goes here, and the artist uses it to arrange pickup or
            delivery.
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
            : `Continue (${formatPrice(estimateMinor / 100, "eur")})`}
      </button>
      <p className="text-xs text-muted-foreground">
        The final total, including any discount, is confirmed on the next step
        before you pay.
      </p>
    </div>
  );
}
