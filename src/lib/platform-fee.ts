// Platform fee (RS-4, money-scope reset 2026-06-03). Inklee charges a flat 3%
// all-in fee on each in-app deposit (DECISIONS.md D-a/D-b).
//
// Model = DEDUCTED, all-in (D-a + the 2026-06-03 fee-bearer call): the customer
// pays exactly the deposit; the artist's total deduction is a flat 3% that
// ALREADY INCLUDES Stripe's processing fee — Inklee absorbs Stripe's standard
// cut out of its own 3% rather than stacking it on top of the artist. So the
// artist receives ~97% and never sees a separate processing line.
//
// Mechanics (the intent keeps `on_behalf_of`, so the artist stays merchant of
// record per LO-2, and Stripe debits ITS fee from the artist's account):
//
//   artist net = (deposit − application_fee) − actual_stripe_fee
//
// To land artist net at 97% on a standard EU card we therefore set the Stripe
// `application_fee_amount` (= what Inklee KEEPS) to `3% − standard_stripe_fee`,
// not the full 3%. Inklee nets that remainder (~€2.75 on a €200 deposit);
// Stripe takes its ~€3.25; the artist loses exactly €6 (3%).
//
// Edge cases this implies:
//   • Foreign / premium cards cost more than the standard estimate. That excess
//     falls on the artist's account (we keep on_behalf_of → artist is MoR), so
//     on those cards the artist loses a little over 3%. Inklee always keeps its
//     remainder; it never goes negative.
//   • Tiny deposits (< ~€17): the standard Stripe fee already exceeds the whole
//     3%, so the application fee clamps to 0 — Inklee keeps nothing and the
//     artist covers the small shortfall.
//
// Rate = 3% (D-b), flat across all artists for now. Tier variation (D-d) is
// open; route every computation through here so that's a one-function change.
// The fee only applies to deposits collected THROUGH Inklee (active Connect);
// manual deposits paid directly to the artist carry no fee.

/**
 * Platform fee in basis points (100 bps = 1%). 3% = 300 bps. This is the
 * artist's ALL-IN deduction (Inklee's margin + the Stripe fee Inklee absorbs),
 * i.e. the headline number shown to the artist — NOT the Stripe
 * `application_fee_amount` (that's `applicationFeeCents`).
 */
export const PLATFORM_FEE_BPS = 300;

/** Human percentage for copy, e.g. `3`. */
export const PLATFORM_FEE_PERCENT = PLATFORM_FEE_BPS / 100;

// Standard Stripe processing fee we absorb out of the 3% — the EEA card rate
// (1.5% + €0.25). Sizing the application fee against this is what lets Inklee,
// not the artist, eat Stripe's standard cut.
const STRIPE_FEE_BPS = 150;
const STRIPE_FEE_FLAT_CENTS = 25;

/**
 * The artist's ALL-IN deduction in integer cents (the headline 3%). Used for
 * the artist-facing "Inklee fee (3%)" / net display. Rounded to the nearest
 * cent.
 */
export function platformFeeCents(depositCents: number): number {
  if (!Number.isFinite(depositCents) || depositCents <= 0) return 0;
  return Math.round((depositCents * PLATFORM_FEE_BPS) / 10000);
}

/**
 * The Stripe `application_fee_amount` to set on the deposit PaymentIntent —
 * what Inklee actually KEEPS after absorbing Stripe's standard processing fee:
 *
 *   max(0, 3%·deposit − (1.5%·deposit + €0.25))
 *
 * Clamped at 0 (Stripe requires a non-negative integer < charge amount): on
 * deposits below ~€17 the standard Stripe fee already exceeds the full 3%, so
 * Inklee keeps nothing and the artist covers the small shortfall.
 */
export function applicationFeeCents(depositCents: number): number {
  if (!Number.isFinite(depositCents) || depositCents <= 0) return 0;
  const gross = platformFeeCents(depositCents);
  const stripeEstimate =
    Math.round((depositCents * STRIPE_FEE_BPS) / 10000) + STRIPE_FEE_FLAT_CENTS;
  return Math.max(0, gross - stripeEstimate);
}

/** The artist's all-in deduction in EUR (for display). */
export function platformFeeEur(depositEur: number): number {
  if (!Number.isFinite(depositEur) || depositEur <= 0) return 0;
  return platformFeeCents(Math.round(depositEur * 100)) / 100;
}

/**
 * What the artist receives in EUR after the all-in 3% (on a standard EU card —
 * Inklee has absorbed Stripe's standard processing fee).
 */
export function artistNetEur(depositEur: number): number {
  if (!Number.isFinite(depositEur) || depositEur <= 0) return 0;
  const cents = Math.round(depositEur * 100);
  return (cents - platformFeeCents(cents)) / 100;
}
