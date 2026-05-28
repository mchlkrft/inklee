"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Minus, Plus } from "lucide-react";
import { prepareCheckoutAction } from "./actions";
import { MAX_ADDON_QUANTITY } from "@/lib/orders";
import { formatPrice } from "@/lib/goods";

export type AddonVariantView = {
  id: string;
  name: string;
  price: number;
  stock: number | null;
};
export type AddonProductView = {
  id: string;
  title: string;
  imageUrl: string | null;
  price: number;
  stock: number | null;
  variants: AddonVariantView[];
};

type Row = {
  key: string;
  productId: string;
  variantId: string | null;
  label: string;
  sublabel: string | null;
  price: number;
  stock: number | null;
};

function buildRows(products: AddonProductView[]): Row[] {
  const rows: Row[] = [];
  for (const p of products) {
    if (p.variants.length > 0) {
      for (const v of p.variants) {
        rows.push({
          key: v.id,
          productId: p.id,
          variantId: v.id,
          label: p.title,
          sublabel: v.name,
          price: v.price,
          stock: v.stock,
        });
      }
    } else {
      rows.push({
        key: p.id,
        productId: p.id,
        variantId: null,
        label: p.title,
        sublabel: null,
        price: p.price,
        stock: p.stock,
      });
    }
  }
  return rows;
}

function CheckoutInner({
  token,
  depositAmount,
  currency,
  rows,
}: {
  token: string;
  depositAmount: number;
  currency: string;
  rows: Row[];
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rowMax = (row: Row) =>
    Math.min(MAX_ADDON_QUANTITY, row.stock ?? MAX_ADDON_QUANTITY);

  const setRowQty = (row: Row, next: number) =>
    setQty((prev) => ({
      ...prev,
      [row.key]: Math.max(0, Math.min(rowMax(row), next)),
    }));

  const goodsTotal = rows.reduce(
    (sum, r) => sum + r.price * (qty[r.key] ?? 0),
    0,
  );
  const total = depositAmount + goodsTotal;

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);

    const selections = rows
      .filter((r) => (qty[r.key] ?? 0) > 0)
      .map((r) => ({
        productId: r.productId,
        variantId: r.variantId,
        quantity: qty[r.key],
      }));

    // Sync the PaymentIntent + order to the current selection before charging.
    const prep = await prepareCheckoutAction(token, JSON.stringify(selections));
    if ("error" in prep) {
      setError(prep.error);
      setProcessing(false);
      return;
    }

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (stripeError) {
      setError(stripeError.message ?? "Payment failed. Try again.");
      setProcessing(false);
      return;
    }
    setPaid(true);
  };

  if (paid) {
    return (
      <div className="space-y-1 rounded-md border border-border p-4">
        <p className="text-sm font-medium text-foreground">Payment received</p>
        <p className="text-sm text-muted-foreground">
          Your payment of {formatPrice(total, currency)} went through. The
          artist will confirm your booking shortly. Any goods are reserved for
          pickup at your appointment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {rows.length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Add artist goods for pickup
            </p>
            <p className="text-xs text-muted-foreground">
              Optional. Collect at your appointment.
            </p>
          </div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((row) => {
              const count = qty[row.key] ?? 0;
              const soldOut = row.stock !== null && row.stock <= 0;
              return (
                <li
                  key={row.key}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {row.label}
                      {row.sublabel ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {row.sublabel}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(row.price, currency)}
                      {soldOut ? " · sold out" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRowQty(row, count - 1)}
                      disabled={count === 0}
                      aria-label={`Remove one ${row.label}`}
                      className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <span className="w-5 text-center text-sm tabular-nums text-foreground">
                      {count}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRowQty(row, count + 1)}
                      disabled={soldOut || count >= rowMax(row)}
                      aria-label={`Add one ${row.label}`}
                      className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-1 rounded-md border border-border px-4 py-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Deposit</span>
          <span>{formatPrice(depositAmount, currency)}</span>
        </div>
        {goodsTotal > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Goods</span>
            <span>{formatPrice(goodsTotal, currency)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-1 font-medium text-foreground">
          <span>Total</span>
          <span>{formatPrice(total, currency)}</span>
        </div>
      </div>

      <PaymentElement options={{ layout: "tabs" }} />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={handlePay}
        disabled={!stripe || processing}
        className="w-full rounded-full bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {processing
          ? "Processing…"
          : goodsTotal > 0
            ? "Pay deposit and selected items"
            : "Pay deposit"}
      </button>
    </div>
  );
}

export default function AddonsCheckout({
  token,
  depositAmount,
  currency,
  clientSecret,
  publishableKey,
  products,
}: {
  token: string;
  depositAmount: number;
  currency: string;
  clientSecret: string;
  publishableKey: string;
  products: AddonProductView[];
}) {
  // Keep the Stripe promise + rows stable so the PaymentElement isn't remounted
  // when the selection changes (which would reset entered card details).
  const [stripePromise] = useState(() => loadStripe(publishableKey));
  const rows = useMemo(() => buildRows(products), [products]);

  return (
    <div className="space-y-4">
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: "night",
            variables: {
              colorPrimary: "#E8E1D4",
              colorBackground: "#1A1A1D",
              colorText: "#E8E1D4",
              colorTextSecondary: "rgba(232,225,212,0.6)",
              colorDanger: "#E5484D",
              borderRadius: "6px",
              fontSizeBase: "14px",
            },
          },
        }}
      >
        <CheckoutInner
          token={token}
          depositAmount={depositAmount}
          currency={currency}
          rows={rows}
        />
      </Elements>
    </div>
  );
}
