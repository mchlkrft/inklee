"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// Initialise outside component to avoid recreating on every render
function getStripePromise(publishableKey: string) {
  return loadStripe(publishableKey);
}

function PaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message ?? "payment failed — try again");
      setProcessing(false);
      return;
    }

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50"
      >
        {processing ? "processing…" : "pay deposit"}
      </button>
    </form>
  );
}

export default function DepositPaymentForm({
  publishableKey,
  clientSecret,
  amountEur,
}: {
  publishableKey: string;
  clientSecret: string;
  amountEur: number;
}) {
  const [paid, setPaid] = useState(false);
  const stripePromise = getStripePromise(publishableKey);

  if (paid) {
    return (
      <div className="rounded-md border border-border p-4 space-y-1">
        <p className="text-sm font-medium text-foreground">payment received</p>
        <p className="text-sm text-muted-foreground">
          your €{amountEur.toFixed(2)} deposit has been paid. the artist will
          confirm your booking shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">pay deposit</p>
        <p className="text-sm text-muted-foreground">
          €{amountEur.toFixed(2)} due to confirm your booking
        </p>
      </div>
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
        <PaymentForm onSuccess={() => setPaid(true)} />
      </Elements>
    </div>
  );
}
