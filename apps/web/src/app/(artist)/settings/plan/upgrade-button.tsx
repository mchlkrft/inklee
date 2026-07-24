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
// The order button hands off to Stripe Checkout, which shows the price before pay.
export default function UpgradeButton({ label }: { label: string }) {
  const businessTier = PLUS_BUSINESS_TIER_ENABLED;
  const [open, setOpen] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [immediate, setImmediate] = useState(false);
  const [pending, startTransitionFn] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

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
          Inklee Plus is a monthly subscription. It renews automatically each
          month until you cancel, and you can cancel any time from your plan
          settings. The price is shown on the next step before you pay.
        </p>
      </div>

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
