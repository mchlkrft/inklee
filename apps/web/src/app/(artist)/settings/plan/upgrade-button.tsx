"use client";

import { useState, useTransition } from "react";
import { trackEvent } from "@/lib/track";
import { confirmBusinessCheckoutAction } from "./actions";
import { BUSINESS_DECLARATION_TEXT } from "@/lib/billing-consent-copy";

// Two-step B2B upgrade. Clicking the primary button opens a pre-checkout
// confirmation carrying the pre-contract disclosure, a SEPARATE unchecked
// business-use declaration (counsel C3), and an obligation-to-pay order button
// that stays disabled until the declaration is ticked (Art. 8 CRD). The order
// button hands off to Stripe Checkout, which shows the price before payment.
export default function UpgradeButton({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [declared, setDeclared] = useState(false);
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

      {/* Separate, unchecked, required business-use declaration (counsel C3). */}
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={declared}
          onChange={(e) => setDeclared(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand-red"
        />
        <span>{BUSINESS_DECLARATION_TEXT}</span>
      </label>

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
        .
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={!declared || pending}
          onClick={() => {
            setMessage(null);
            startTransitionFn(async () => {
              const result = await confirmBusinessCheckoutAction({
                businessUseDeclared: declared,
              });
              if ("url" in result) {
                window.location.href = result.url;
                return;
              }
              setMessage(result.message);
            });
          }}
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
