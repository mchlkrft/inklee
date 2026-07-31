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
import { isPlusPriceUnavailable } from "./price-availability";

// Two-step Plus upgrade. Clicking the primary button opens a pre-checkout
// confirmation with the pre-contract disclosure and an obligation-to-pay order
// button (Art. 8 CRD). v1 is consumer-first (strategy D1): every buyer takes the
// consumer path with no business-use declaration. The B2B declaration control is
// deferred behind PLUS_BUSINESS_TIER_ENABLED for a future business/studio tier.
// When priceLabel is present (resolved server-side from the SAME Stripe Price
// checkout charges), the total price renders on this screen directly above the
// pay button (counsel condition, Art. 8(2)); without it the panel falls back to
// the price-on-next-step sentence and Stripe Checkout still shows the price.
// The four Art. 8(2) elements all sit inside this panel, adjacent to the order
// button: the service's main characteristics (the `benefits` summary), the total
// price, the billing interval, and the auto-renewal notice.
// Yearly (counsel approved 2026-07-25) is offered when the yearly base price
// resolved server-side. The first-year label is optional (founder offer); when
// absent the yearly option still shows at the list price. The disclosure and
// total line follow the chosen interval so the Art. 8(2) wording always states
// the actual renewal cadence and the actual first charge.
export default function UpgradeButton({
  label,
  benefits = [],
  priceLabel = null,
  yearlyBaseLabel = null,
  yearlyFirstYearLabel = null,
}: {
  label: string;
  benefits?: readonly string[];
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
  // Yearly is offered on the consumer path when the yearly price resolved.
  // The first-year discount is an optional founder offer, not a prerequisite.
  const yearlyAvailable = !businessTier && yearlyBaseLabel !== null;
  const yearlyChosen = yearlyAvailable && yearly;

  // BILL-UI-003 (founder ruling 16): a displayed authoritative price is a
  // PRECONDITION of the order, not decoration. When the price for the chosen
  // interval could not be resolved server-side, block the obligation-to-pay
  // button and show a retryable error that confirms nothing was charged, rather
  // than deferring the total to a later Stripe page. Decision in ./price-availability.
  const priceUnavailable = isPlusPriceUnavailable({
    businessTier,
    yearlyChosen,
    priceLabel,
    yearlyBaseLabel,
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          trackEvent("plus_upgrade_click");
          setOpen(true);
        }}
        className="inline-flex items-center justify-center rounded-lg bg-brand-mustard px-5 py-2.5 text-sm font-semibold text-brand-charcoal transition-opacity hover:opacity-90"
      >
        {label}
      </button>
    );
  }

  const canOrder = businessTier ? declared : !priceUnavailable;

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
        {priceUnavailable ? (
          <p className="text-muted-foreground">
            We couldn&apos;t load the price just now, so we can&apos;t take your
            order. Nothing has been charged. Please try again in a moment.
          </p>
        ) : (
          <p className="text-muted-foreground">
            {yearlyChosen
              ? yearlyFirstYearLabel
                ? `Inklee Plus is a yearly subscription: ${yearlyFirstYearLabel} first year, then ${yearlyBaseLabel}, final price. It renews automatically each year until you cancel, and you can cancel any time from your account settings.`
                : `Inklee Plus is a yearly subscription for ${yearlyBaseLabel}, final price. It renews automatically each year until you cancel, and you can cancel any time from your account settings.`
              : priceLabel
                ? `Inklee Plus is a monthly subscription for ${priceLabel}, final price. It renews automatically each month at that price until you cancel, and you can cancel any time from your account settings.`
                : "Inklee Plus is a monthly subscription. It renews automatically each month until you cancel, and you can cancel any time from your account settings."}
          </p>
        )}
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
              className="mt-0.5 h-4 w-4 accent-brand-mustard"
            />
            <span>Monthly{priceLabel ? ` (${priceLabel})` : ""}</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="billing-interval"
              checked={yearly}
              onChange={() => setYearly(true)}
              className="mt-0.5 h-4 w-4 accent-brand-mustard"
            />
            <span>
              {yearlyFirstYearLabel
                ? `Yearly: ${yearlyFirstYearLabel} first year, then ${yearlyBaseLabel}`
                : `Yearly (${yearlyBaseLabel})`}
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
            className="mt-0.5 h-4 w-4 accent-brand-mustard"
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
            className="mt-0.5 h-4 w-4 accent-brand-mustard"
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

      {/* Main characteristics of the service, restated directly above the pay
          button so all four Art. 8(2) elements (characteristics, price,
          interval, auto-renewal) are adjacent to the order, not only on the card
          above the panel. Single-sourced from PLUS_BENEFITS via page.tsx. */}
      {benefits.length > 0 && (
        <div className="text-sm text-foreground">
          <p className="font-medium">What you get</p>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {/* The total price sits directly above the pay button on the same screen
          (Art. 8(2); counsel launch-blocking condition 3). */}
      {yearlyChosen ? (
        <p className="text-sm font-semibold text-foreground">
          {yearlyFirstYearLabel
            ? `Total today: ${yearlyFirstYearLabel} first year, final price. Renews yearly at ${yearlyBaseLabel} until cancelled.`
            : `Total: ${yearlyBaseLabel}, final price. Renews yearly until cancelled.`}
        </p>
      ) : (
        priceLabel && (
          <p className="text-sm font-semibold text-foreground">
            Total: {priceLabel}, final price. Renews monthly until cancelled.
          </p>
        )
      )}

      <div className="flex flex-wrap items-center gap-4">
        {priceUnavailable ? (
          // No obligation-to-pay button without a price on screen (ruling 16):
          // offer a retry that re-runs the server-side price resolution instead.
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-lg bg-brand-mustard px-5 py-2.5 text-sm font-semibold text-brand-charcoal transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        ) : (
          <button
            type="button"
            disabled={!canOrder || pending}
            onClick={placeOrder}
            className="inline-flex items-center justify-center rounded-lg bg-brand-mustard px-5 py-2.5 text-sm font-semibold text-brand-charcoal transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Starting checkout..." : "Order with obligation to pay"}
          </button>
        )}
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
