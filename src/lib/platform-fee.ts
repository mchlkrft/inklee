// Platform fee (RS-4, money-scope reset 2026-06-03). Inklee takes a percentage
// of each in-app deposit as its transaction-fee revenue (DECISIONS.md D-a/D-b).
//
// Model = DEDUCTED (D-a): the customer pays exactly the deposit; the fee comes
// out of the artist's destination transfer via Stripe `application_fee_amount`.
// The customer is never surcharged, so there is NO customer-facing fee line —
// only the artist sees "you receive X, Inklee fee Y".
//
// Because the deposit PaymentIntent carries `on_behalf_of` the connected
// account (the artist is merchant of record, LO-2), Stripe's own processing
// fee is also borne by the artist's account — so the artist net shown here is
// "before card processing fees". Inklee keeps the full application fee.
//
// Rate = 3% (D-b, 2026-06-03), flat across all artists for now. Tier-based
// variation (D-d) is still open; when a plan system exists this becomes a
// per-artist lookup — keep every fee computation flowing through here so that
// change is a one-function edit.
//
// The fee only applies to deposits collected THROUGH Inklee (active Stripe
// Connect). Manual deposits (un-connected artists, paid directly to the artist)
// never touch Inklee's money rails and carry no fee.

/** Platform fee in basis points (100 bps = 1%). 3% = 300 bps. */
export const PLATFORM_FEE_BPS = 300;

/** Human percentage for copy, e.g. `3`. */
export const PLATFORM_FEE_PERCENT = PLATFORM_FEE_BPS / 100;

/**
 * Fee in integer minor units (cents) for a deposit given in cents. Rounded to
 * the nearest cent. Stripe requires `application_fee_amount` to be a positive
 * integer strictly less than the charge amount — true for any positive deposit
 * at a 3% rate (3% of even the €1 minimum is €0.03 < €1).
 */
export function platformFeeCents(depositCents: number): number {
  if (!Number.isFinite(depositCents) || depositCents <= 0) return 0;
  return Math.round((depositCents * PLATFORM_FEE_BPS) / 10000);
}

/** Fee in EUR for a deposit given in EUR (for artist-facing display). */
export function platformFeeEur(depositEur: number): number {
  if (!Number.isFinite(depositEur) || depositEur <= 0) return 0;
  return platformFeeCents(Math.round(depositEur * 100)) / 100;
}

/**
 * What the artist nets after the platform fee, in EUR. This is "before card
 * processing fees" — Stripe's own fee is additionally deducted from the
 * artist's account (see file header).
 */
export function artistNetEur(depositEur: number): number {
  if (!Number.isFinite(depositEur) || depositEur <= 0) return 0;
  const cents = Math.round(depositEur * 100);
  return (cents - platformFeeCents(cents)) / 100;
}
