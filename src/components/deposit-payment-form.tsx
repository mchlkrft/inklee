"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { depositPolicyLines, type DepositPolicy } from "@/lib/deposit-policy";
import { formatPrice } from "@/lib/goods";

function getStripePromise(publishableKey: string) {
  return loadStripe(publishableKey);
}

function PaymentForm({
  amountEur,
  currency,
  policy,
  onSuccess,
}: {
  amountEur: number;
  currency: string;
  policy: DepositPolicy | null;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  // Q9: the client must accept the deposit policy before the pay step.
  const [accepted, setAccepted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !accepted) return;

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

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Q9 pre-payment disclosure: amount + the policy snapshot, shown before
          the card form. The client always pays exactly the deposit (no
          surcharge); Inklee's fee is not shown to the client. */}
      <div className="space-y-2 rounded-md border border-border p-4">
        <p className="text-sm font-medium text-foreground">
          Deposit: {formatPrice(amountEur, currency)}
        </p>
        {policy && (
          <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
            {depositPolicyLines(policy).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex items-start gap-2.5 text-sm text-foreground">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 accent-brand-mustard"
        />
        <span>I have read and accept the deposit policy.</span>
      </label>

      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || processing || !accepted}
        className="w-full rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {processing ? "Processing..." : "Pay deposit"}
      </button>
    </form>
  );
}

export default function DepositPaymentForm({
  publishableKey,
  clientSecret,
  amountEur,
  currency = "eur",
  policy = null,
}: {
  publishableKey: string;
  clientSecret: string;
  amountEur: number;
  currency?: string;
  policy?: DepositPolicy | null;
}) {
  const [paid, setPaid] = useState(false);
  const stripePromise = getStripePromise(publishableKey);

  if (paid) {
    return (
      <div className="space-y-1 rounded-md border border-border p-4">
        <p className="text-sm font-medium text-foreground">Payment received</p>
        <p className="text-sm text-muted-foreground">
          Your {formatPrice(amountEur, currency)} deposit has been paid. The
          artist will confirm your booking shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Pay deposit</p>
        <p className="text-sm text-muted-foreground">
          {formatPrice(amountEur, currency)} due to confirm your booking
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
        <PaymentForm
          amountEur={amountEur}
          currency={currency}
          policy={policy}
          onSuccess={() => setPaid(true)}
        />
      </Elements>
    </div>
  );
}
