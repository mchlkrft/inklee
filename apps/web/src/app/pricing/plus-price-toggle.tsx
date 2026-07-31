"use client";

import { useState } from "react";

// The in-card monthly/yearly price display for the featured Plus card. Display
// numbers follow docs/product/pricing-model.md row 3 (yearly: 30 EUR per year;
// counsel approved 2026-07-25); the charged price always resolves from the
// Stripe lookup keys in lib/server/billing/subscription.ts, never from these
// strings. The first-year discount (24 EUR) is a conditional founder offer
// shown only to eligible viewers in the upgrade flow, not on the public page.

type PlusBillingInterval = "monthly" | "yearly";

export default function PlusPriceToggle() {
  const [billing, setBilling] = useState<PlusBillingInterval>("monthly");

  const option = (value: PlusBillingInterval, label: string, hint?: string) => (
    <button
      type="button"
      aria-pressed={billing === value}
      onClick={() => setBilling(value)}
      className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
        billing === value
          ? "bg-brand-mustard text-brand-charcoal"
          : "text-shell-fg-dim hover:text-shell-fg"
      }`}
    >
      {label}
      {hint ? (
        <span className="ml-1.5 text-[0.6rem] font-black uppercase tracking-[0.14em] opacity-70">
          {hint}
        </span>
      ) : null}
    </button>
  );

  // The toggle is a price-related option, so it sits in the same row as the
  // price itself (wrapping below only when the card gets too narrow).
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {billing === "yearly" ? (
          <p className="flex items-baseline gap-1.5">
            <span className="text-5xl font-black tracking-tight text-brand-mustard">
              &euro;30
            </span>
            <span className="text-sm font-bold text-shell-fg-dim">/year</span>
          </p>
        ) : (
          <p className="flex items-baseline gap-1.5">
            <span className="text-5xl font-black tracking-tight text-brand-mustard">
              &euro;3
            </span>
            <span className="text-sm font-bold text-shell-fg-dim">/month</span>
          </p>
        )}
        <div className="inline-flex rounded-full border-[1.5px] border-shell-border p-1">
          {option("monthly", "Monthly")}
          {option("yearly", "Yearly")}
        </div>
      </div>
      {billing === "yearly" ? (
        <p className="text-xs leading-relaxed text-shell-fg-dim">
          30.00 EUR per year. No VAT added.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-shell-fg-dim">
          3.00 EUR per month. No VAT added.
        </p>
      )}
    </div>
  );
}
