"use client";

import { useState, useTransition } from "react";
import { trackEvent } from "@/lib/track";
import {
  confirmBusinessCheckoutAction,
  startPlusConsumerCheckoutAction,
} from "./actions";
import {
  BUSINESS_DECLARATION_TEXT,
  IMMEDIATE_PERFORMANCE_TEXT,
} from "@/lib/billing-consent-copy";
import { PLUS_BUSINESS_TIER_ENABLED } from "@/lib/plus-launch-config";

// Two-step Plus upgrade. Clicking the primary button opens a pre-checkout
// confirmation with the pre-contract disclosure and an obligation-to-pay order
// button (Art. 8 CRD). v1 is consumer-first (strategy D1): every buyer takes the
// consumer path with no business-use declaration. The B2B declaration control is
// deferred behind PLUS_BUSINESS_TIER_ENABLED for a future business/studio tier.
// When priceLabel is present (resolved server-side from the SAME Stripe Price
// checkout charges), the total price renders on this screen directly above the
// pay button (counsel condition, Art. 8(2)); without it the panel falls back to
// the price-on-next-step sentence and Stripe Checkout still shows the price.
// Yearly (counsel approved 2026-07-25) is offered only when BOTH yearly labels
// resolved server-side; the disclosure and the total line follow the chosen
// interval so the Art. 8(2) wording always states the actual renewal cadence
// and the actual first charge.
export default function UpgradeButton({
  label,
  priceLabel = null,
  yearlyBaseLabel = null,
  yearlyFirstYearLabel = null,
}: {
  label: string;
  priceLabel?: string | null;
  yearlyBaseLabel?: string | null;
  yearlyFirstYearLabel?: string | null;
}) {
  const businessTier = PLUS_BUSINESS_TIER_ENABLED;
  const [open, setOpen] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [immediate, setImmediate] = useState(false);
  const [yearly, setYearly] = useState(false);
  const [pending, startTransitionFn] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  // Yearly is offered only on the consumer path and only fully price-labelled.
  const yearlyAvailable =
    !businessTier && yearlyBaseLabel !== null && yearlyFirstYearLabel !== null;
  const yearlyChosen = yearlyAvailable && yearly;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          trackEvent("plus_upgrade_click");
          setOpen(true);
        }}
        className="inline-flex items-center justify-center rounded-lg bg-brand-red px-5 py-2.5 text-sm font-semibold text-brand-bone transition-colors hover:bg-brand-red/90"
      >
        {label}
      </button>
    );
  }

  const canOrder = businessTier ? declared : true;

  const placeOrder = () => {
    setMessage(null);
    startTransitionFn(async () => {
      const result = businessTier
        ? await confirmBusinessCheckoutAction({ businessUseDeclared: declared })
        : await startPlusConsumerCheckoutAction({
            immediatePerformanceRequested: immediate,
            billingInterval: yearlyChosen ? "yearly" : "monthly",
          });
      if ("url" in result) {
        window.location.href = result.url;
        return;
      }
      setMessage(result.message);
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="space-y-1 text-sm">
        <p className="font-medium text-foreground">Before you order</p>
        <p className="text-muted-foreground">
          {yearlyChosen
            ? `Inklee Plus is a yearly subscription: ${yearlyFirstYearLabel} first year, then ${yearlyBaseLabel}, final price. It renews automatically each year until you cancel, and you can cancel any time from your plan settings.`
            : priceLabel
              ? `Inklee Plus is a monthly subscription for ${priceLabel}, final price. It renews automatically each month at that price until you cancel, and you can cancel any time from your plan settings.`
              : "Inklee Plus is a monthly subscription. It renews automatically each month until you cancel, and you can cancel any time from your plan settings. The price is shown on the next step before you pay."}
        </p>
      </div>

      {/* Billing-interval choice (consumer path; yearly counsel-approved
          2026-07-25). Monthly stays the default; nothing is pre-selected
          toward the longer commitment. */}
      {yearlyAvailable && (
        <fieldset className="space-y-2 text-sm text-foreground">
          <legend className="sr-only">Billing interval</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="billing-interval"
              checked={!yearly}
              onChange={() => setYearly(false)}
              className="mt-0.5 h-4 w-4 accent-brand-red"
            />
            <span>Monthly{priceLabel ? ` — ${priceLabel}` : ""}</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="billing-interval"
              checked={yearly}
              onChange={() => setYearly(true)}
              className="mt-0.5 h-4 w-4 accent-brand-red"
            />
            <span>
              Yearly — {yearlyFirstYearLabel} first year, then {yearlyBaseLabel}
            </span>
          </label>
        </fieldset>
      )}

      {/* Deferred for v1 (consumer-first). A future business tier re-enables the
          separate, unchecked, required business-use declaration (counsel C3). */}
      {businessTier && (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={declared}
            onChange={(e) => setDeclared(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-red"
          />
          <span>{BUSINESS_DECLARATION_TEXT}</span>
        </label>
      )}

      {/* Optional, unchecked immediate-performance request (P3). Never
          pre-selected, never required: leaving it unticked keeps a full refund
          on withdrawal. Consumer path only. */}
      {!businessTier && (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={immediate}
            onChange={(e) => setImmediate(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-red"
          />
          <span>{IMMEDIATE_PERFORMANCE_TEXT}</span>
        </label>
      )}

      <p className="text-xs text-muted-foreground">
        By placing this order you agree to the{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Terms of Service
        </a>
        , which include your 14-day right to withdraw.
      </p>

      {/* The total price sits directly above the pay button on the same screen
          (Art. 8(2); counsel launch-blocking condition 3). */}
      {yearlyChosen ? (
        <p className="text-sm font-semibold text-foreground">
          Total today: {yearlyFirstYearLabel} first year, final price. Renews
          yearly at {yearlyBaseLabel} until cancelled.
        </p>
      ) : (
        priceLabel && (
          <p className="text-sm font-semibold text-foreground">
            Total: {priceLabel}, final price. Renews monthly until cancelled.
          </p>
        )
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={!canOrder || pending}
          onClick={placeOrder}
          className="inline-flex items-center justify-center rounded-lg bg-brand-red px-5 py-2.5 text-sm font-semibold text-brand-bone transition-colors hover:bg-brand-red/90 disabled:opacity-60"
        >
          {pending ? "Starting checkout..." : "Order with obligation to pay"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setDeclared(false);
            setImmediate(false);
            setYearly(false);
            setMessage(null);
          }}
          className="text-sm text-muted-foreground underline disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
