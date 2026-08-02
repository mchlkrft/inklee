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
// Rate = 3% (D-b), flat across ALL artists and tiers under fee schedule v1 —
// RATIFIED by the founder 2026-07-25 (pricing-model.md OQ-7: no Plus discount;
// the subscription covers the Connect account cost, this fee IS the margin).
//
// CORRECTED 2026-08-01 (FEE-DSP-001/G1): this comment used to say the flat
// rate was permanent. It is not. `packages/shared/src/fee-schedule.ts` defines
// an APPROVED v2 schedule (plus=50bps, legacy=300bps, free=null — cannot
// transact) that P7 activates with accountant sign-off; this file is the v1
// DISPLAY legacy, not a promise about every future tier. Since A3
// (order-fee-sync.ts:56-59) nothing here is charged: every `application_fee_
// amount` comes from `appointmentApplicationFee`, which reads the tier and the
// active schedule. `PLATFORM_FEE_BPS`/`platformFeeCents` stay live ONLY as the
// artist-facing display number on surfaces that quote the deduction before v2
// activates; `appointmentFeeDisplay` (fee-schedule.ts) is the tier-aware
// successor those surfaces should read once a schedule other than v1 is
// active. The fee only applies to deposits collected THROUGH Inklee (active
// Connect); manual deposits paid directly to the artist carry no fee.

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

// ===========================================================================
// A7 (counsel-accountant-handoff-2026-08.md PART 4): "no separate
// card-processing fees" — bound to WHO PAYS Stripe, not to the rate.
// ===========================================================================

/**
 * Mirrors the Custom Connect controller config every connected account is
 * created with (`stripe-connect.ts`: `controller.fees.payer = "application"`)
 * — Inklee's platform balance bears Stripe's processing cost on every charge
 * through that account, never the artist's. Every account created by this
 * codebase sets that, so this is `true` today for all of them; it exists as
 * an explicit, named constant (rather than a bare `true` at each call site)
 * so that IF a future account type or controller config ever paid the
 * processing cost differently, changing THIS constant is the one place that
 * would need to change, and `noSeparateCardProcessingFeesClaimVisible` below
 * reads it instead of re-deriving "who pays" from the fee rate.
 */
export const CONNECT_FEE_PAYER_IS_APPLICATION = true;

/** The accountant's approved wording (A7), valid at ANY fee rate once the
 *  binding conditions hold — never conditioned on the rate itself. */
export const NO_SEPARATE_CARD_PROCESSING_FEES_CLAIM =
  "No separate card-processing fees.";

/**
 * Whether the "no separate card-processing fees" claim may be shown.
 *
 * A7's answer: the claim is true whenever Inklee absorbs the Stripe
 * processing cost (`payerIsApplication`), REGARDLESS of the deposit rate — at
 * 0.5% it is a subsidy (Stripe's ~1.5%+0.25 typically exceeds the fee itself),
 * at 3% it is a straightforward margin, but "who pays Stripe" is the same
 * structural fact either way. The PREVIOUS implementation bound the claim to
 * `feeBps === 300`, which reads as "true because the rate happens to be 3%
 * today" — a future fee-schedule change (v2's Plus 50bps) would silently make
 * that condition false even though the underlying claim stays true, and
 * conversely a hypothetical future payer change could leave a stale `=== 300`
 * check reporting true when it should not. Binding to `payerIsApplication`
 * instead makes the claim track the actual reason it is true.
 *
 * `founderApprovedSubsidyClaim` is the SECOND, independent condition (never a
 * fallback/default): the founder must have recorded the per-transaction
 * subsidy as intended policy before the claim may show at a rate where it is
 * a subsidy rather than a margin. Both conditions are required — this
 * function returns false unless BOTH hold, which is what keeps the claim
 * suppressed by default (no `billing_activation_approvals` row for it exists
 * yet) until that recording happens.
 */
export function noSeparateCardProcessingFeesClaimVisible(input: {
  payerIsApplication: boolean;
  founderApprovedSubsidyClaim: boolean;
}): boolean {
  return input.payerIsApplication && input.founderApprovedSubsidyClaim;
}
