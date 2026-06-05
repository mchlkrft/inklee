// Platform fee (RS-4 + Slice 79 Custom Connect). Inklee charges a flat 3%
// all-in fee on each in-app deposit (DECISIONS.md D-a/D-b).
//
// Under the Custom Connect model (Slice 79) the connected account is
// platform-controlled with `controller.fees.payer = application`, so Stripe
// bills ITS processing fee to Inklee's platform balance separately rather than
// deducting it from the charge. The deposit PaymentIntent's
// `application_fee_amount` is therefore the FULL 3% (`platformFeeCents`):
//
//   customer pays  = the deposit, exactly (no surcharge)
//   artist net     = deposit − 3%              (always exactly 3%)
//   Inklee gross   = the 3% application fee
//   Inklee net     = 3% − Stripe's fee         (~€2.75 on a €200 deposit)
//
// So the artist always loses exactly 3% on a standard card, Inklee keeps the
// remainder after Stripe's ~1.5%+€0.25, and there is no separate processing
// line shown to anyone. (This replaced the earlier Express model where the
// fee was set to `3% − Stripe fee` because the artist's account bore Stripe's
// cut; under Custom that cut is on Inklee's balance, so the full 3% is set.)
//
// Rate = 3% (D-b), flat across all artists for now. Tier variation (D-d) is
// open; route every computation through here so that's a one-function change.
// The fee only applies to deposits collected THROUGH Inklee (active Connect);
// manual deposits paid directly to the artist carry no fee.

/**
 * Platform fee in basis points (100 bps = 1%). 3% = 300 bps. This is BOTH the
 * artist's all-in deduction (the headline shown to the artist) AND the Stripe
 * `application_fee_amount` set on the deposit intent (see `platformFeeCents`):
 * under Custom Connect, Stripe's processing fee is billed to Inklee's platform
 * balance separately, so the full 3% is the application fee.
 */
export const PLATFORM_FEE_BPS = 300;

/** Human percentage for copy, e.g. `3`. */
export const PLATFORM_FEE_PERCENT = PLATFORM_FEE_BPS / 100;

/**
 * The 3% platform fee in integer cents. This is BOTH the artist's all-in
 * deduction (the artist-facing "Inklee fee (3%)" / net display) AND the Stripe
 * `application_fee_amount` set on the deposit PaymentIntent (Custom Connect:
 * Stripe's processing fee is billed to Inklee's platform balance separately,
 * so the full 3% is the application fee). Rounded to the nearest cent.
 */
export function platformFeeCents(depositCents: number): number {
  if (!Number.isFinite(depositCents) || depositCents <= 0) return 0;
  return Math.round((depositCents * PLATFORM_FEE_BPS) / 10000);
}

/** The artist's all-in 3% deduction in EUR (for display). */
export function platformFeeEur(depositEur: number): number {
  if (!Number.isFinite(depositEur) || depositEur <= 0) return 0;
  return platformFeeCents(Math.round(depositEur * 100)) / 100;
}

/**
 * What the artist receives in EUR after the all-in 3%.
 */
export function artistNetEur(depositEur: number): number {
  if (!Number.isFinite(depositEur) || depositEur <= 0) return 0;
  const cents = Math.round(depositEur * 100);
  return (cents - platformFeeCents(cents)) / 100;
}
