"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { formatPrice } from "@/lib/goods";

type QuoteLine = {
  id: string;
  name: string;
  quantity: number;
  unitAmountMinor: number;
  lineTotalMinor: number;
};

type ClientQuote = {
  amountMinor: number;
  totalMinor: number;
  alreadyCollectedMinor: number;
  currency: string;
  collects: string;
  lines: QuoteLine[];
};

const COLLECTS_LABELS: Record<string, string> = {
  deposit: "Deposit",
  balance: "Remaining balance",
  full_price: "Full price",
};

function PaymentInner({
  quote,
  artistName,
}: {
  quote: ClientQuote;
  artistName: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);
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
    setPaid(true);
  };

  if (paid) {
    return (
      <div className="space-y-1 rounded-md border border-border p-4">
        <p className="text-sm font-medium text-foreground">Payment received</p>
        <p className="text-sm text-muted-foreground">
          Your payment of {formatPrice(quote.amountMinor / 100, quote.currency)}{" "}
          to {artistName} went through. You can close this page.
        </p>
      </div>
    );
  }

  const collectsLabel = COLLECTS_LABELS[quote.collects] ?? "Payment";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          {collectsLabel}
        </h1>
        <p className="text-sm text-muted-foreground">
          Payment request from {artistName}
        </p>
      </div>

      <div className="space-y-1 rounded-md border border-border px-4 py-3 text-sm">
        {quote.lines.map((line) => (
          <div
            key={line.id}
            className="flex justify-between text-muted-foreground"
          >
            <span>
              {line.name}
              {line.quantity > 1 ? ` x ${line.quantity}` : ""}
            </span>
            <span>
              {formatPrice(line.lineTotalMinor / 100, quote.currency)}
            </span>
          </div>
        ))}
        {quote.alreadyCollectedMinor > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Already paid</span>
            <span>
              -{formatPrice(quote.alreadyCollectedMinor / 100, quote.currency)}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-1 font-medium text-foreground">
          <span>Total due</span>
          <span>{formatPrice(quote.amountMinor / 100, quote.currency)}</span>
        </div>
      </div>

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
          : `Pay ${formatPrice(quote.amountMinor / 100, quote.currency)} now`}
      </button>
    </div>
  );
}

export default function PaymentForm({
  quote,
  artistName,
  clientSecret,
  stripePublishableKey,
}: {
  quote: ClientQuote;
  artistName: string;
  clientSecret: string;
  stripePublishableKey: string;
}) {
  const [stripePromise] = useState(() => loadStripe(stripePublishableKey));

  return (
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
      <PaymentInner quote={quote} artistName={artistName} />
    </Elements>
  );
}
