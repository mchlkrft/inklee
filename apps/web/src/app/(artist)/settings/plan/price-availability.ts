// BILL-UI-003 (founder ruling 16): a displayed authoritative price is a
// PRECONDITION of the Plus order, never deferred to a later Stripe page. This is
// the one decision that gates the obligation-to-pay button, extracted so it is
// unit-testable without a React render harness (none exists in this app).
//
// Consumer path only. The business tier is dormant (PLUS_BUSINESS_TIER_ENABLED)
// and is gated on its own declaration, not on a price shown in this panel, so it
// is never "price-unavailable" here. Yearly, when offered at all, always carries
// a resolved base (the yearly radio only appears when yearlyBaseLabel resolved),
// so the unresolved case is monthly with a null priceLabel.

export function isPlusPriceUnavailable(input: {
  businessTier: boolean;
  /** Whether the yearly interval is the one selected. */
  yearlyChosen: boolean;
  priceLabel: string | null;
  yearlyBaseLabel: string | null;
}): boolean {
  if (input.businessTier) return false;
  return input.yearlyChosen
    ? input.yearlyBaseLabel === null
    : input.priceLabel === null;
}
