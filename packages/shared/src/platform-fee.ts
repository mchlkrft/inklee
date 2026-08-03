// Platform fee (RS-4 + Slice 79 Custom Connect). Under fee schedule v1, the
// one active today, Inklee charges a flat 3% all-in fee on each in-app deposit
// (DECISIONS.md D-a/D-b). The rate is a property of the SCHEDULE and the
// artist's TIER, not a constant of this module: see `fee-schedule.ts` and the
// 2026-08-01 correction below. This module models more than one rate as of the
// D6 change (`feeRateCoversProcessingCost`), so read the opening sentence as
// "what v1 charges", never as "what Inklee charges".
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
// Safe: fee-schedule.ts imports nothing, so this cannot form a cycle.
import { appointmentFeeDisplay } from "./fee-schedule";

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
 * The VARIABLE component of Stripe's European card processing cost in basis
 * points (~1.5%), quoted from the accountant's own A7 reference figure:
 * "Stripe's ~1.5% + 0.25 exceeds the fee" at the Plus 0.5% rate.
 *
 * A REFERENCE FIGURE FOR COPY, NOT A BILLING INPUT. Nothing charges, settles
 * or reconciles against it; it exists so `feeRateCoversProcessingCost` below
 * compares the fee against a NAMED cost, rather than against a hard-coded
 * `=== 300` that is only true by coincidence of today's headline rate.
 */
export const STRIPE_PROCESSING_RATE_REFERENCE_BPS = 150;

/**
 * Whether a fee rate covers Inklee's card-processing cost — i.e. whether
 * absorbing Stripe's fee at this rate is a MARGIN (3%) or a SUBSIDY (0.5%).
 *
 * This is the distinction the accountant drew in A7 and the one counsel's D6
 * correction turns on: the claim itself is equally true either way (the artist
 * genuinely sees no separate processing line at any rate), but a rate at which
 * Inklee loses money per transaction is a policy the founder has to own, and
 * one where it does not is not.
 *
 * COHORT-LEVEL, DELIBERATELY NOT PER-TRANSACTION. Stripe's cost also carries a
 * fixed ~0.25 per charge, which this omits on purpose: the predicate answers
 * "is this cohort's rate priced above processing cost", which is the question
 * the payouts page can actually ask — that page describes a rate, not a
 * deposit, and has no amount to feed in. Do not repurpose it as a per-charge
 * profitability test.
 *
 * The imprecision is BOUNDED, and only one cohort can feel it:
 *
 *   3%   covers cost above a EUR 16.67 deposit (0.03A = 0.015A + 0.25). Below
 *        that this returns true while the charge is fractionally subsidised,
 *        worst case ~0.25.
 *   0.5% NEVER covers cost, at ANY amount — 0.005A < 0.015A for all A > 0, so
 *        it loses on the variable component alone and the fixed term is not
 *        even what breaks it. For this cohort the predicate is not an
 *        approximation, it is exactly correct.
 *
 * That gap is only ever about small deposits in the covering cohort, and it is
 * DECIDED, not open. Counsel round 4 ruled the claim stands as written and
 * ruled AGAINST making this predicate amount-aware: the founder-approval
 * condition records subsidy by design, and a rate that covers cost in the
 * ordinary case is not that. See CR4-1 in
 * `docs/product/plus-build-time-decisions.md`.
 *
 * Corroborated live 2026-08-03 (G-5): a EUR 1.00 deposit cost EUR 0.27 in
 * Stripe fees, which is the subsidy described above at the magnitude predicted.
 * Measuring it changed nothing and was never going to.
 *
 * If you are about to write 16.67, 1667, or a per-charge profitability test
 * into this file, read CR4-1 first. That change is ruled against.
 *
 * `null` (the v2 Free tier, which cannot transact the appointment lane at all)
 * is NOT a covering rate: an absent rate covers nothing.
 */
export function feeRateCoversProcessingCost(feeBps: number | null): boolean {
  if (feeBps === null || !Number.isFinite(feeBps)) return false;
  return feeBps > STRIPE_PROCESSING_RATE_REFERENCE_BPS;
}

/**
 * Whether the "no separate card-processing fees" claim may be shown.
 *
 * A7's answer: the claim is true whenever Inklee absorbs the Stripe
 * processing cost (`payerIsApplication`), REGARDLESS of the deposit rate — at
 * 0.5% it is a subsidy (Stripe's ~1.5%+0.25 typically exceeds the fee itself),
 * at 3% it is a straightforward margin, but "who pays Stripe" is the same
 * structural fact either way. The ORIGINAL implementation bound the claim to
 * `feeBps === 300`, which reads as "true because the rate happens to be 3%
 * today" — a future fee-schedule change (v2's Plus 50bps) would silently make
 * that condition false even though the underlying claim stays true, and
 * conversely a hypothetical future payer change could leave a stale `=== 300`
 * check reporting true when it should not. Binding to `payerIsApplication`
 * makes the claim track the actual reason it is true.
 *
 * CORRECTED 2026-08-03 (counsel deviation D6, counsel-handoff-2026-08-02.md
 * §5.1). The A7 rebuild made `founderApprovedSubsidyClaim` a second REQUIRED
 * condition, so with no approval row recorded the claim rendered nowhere. That
 * over-corrected: the accountant's suppression condition was written about the
 * Plus 0.5% SUBSIDY rate only. For the 3% cohort the claim is a plain margin,
 * the accountant said so, it is live in production today, and withdrawing it
 * from that cohort was never instructed. Counsel: "re-scope, don't withdraw."
 *
 * The corrected binding is one AND over an OR:
 *
 *   payerIsApplication AND (rate covers cost OR founder approved the subsidy)
 *
 * so `founderApprovedSubsidyClaim` gates exactly the case it was written for —
 * a rate BELOW processing cost — and nothing else. `payerIsApplication` stays
 * an unconditional veto: if Inklee ever stops bearing Stripe's cost, no rate
 * and no founder row can make the sentence true.
 *
 * The suppression this must not lose: the 0.5% cohort with no approval row
 * still gets nothing. That is the case the whole condition exists for.
 */
export function noSeparateCardProcessingFeesClaimVisible(input: {
  payerIsApplication: boolean;
  feeBps: number | null;
  founderApprovedSubsidyClaim: boolean;
}): boolean {
  if (!input.payerIsApplication) return false;
  return (
    feeRateCoversProcessingCost(input.feeBps) ||
    input.founderApprovedSubsidyClaim
  );
}

/**
 * The PUBLIC pricing page's deposit-fee answer, derived rather than written.
 *
 * WHY THIS EXISTS. `apps/web/src/app/pricing/page.tsx` hard-coded "Card
 * deposits collected through Inklee carry a flat 3% fee with card processing
 * included." bound to nothing: not to the fee schedule, not to the A7 claim
 * predicate. It happens to be true under v1 and becomes wrong on BOTH counts
 * the moment v2 activates, for the tier most visitors are being sold:
 *
 *   rate      Plus goes to 0.5% (fee-schedule.ts FEE_SCHEDULE_V2), so "flat 3%"
 *             is simply false for them, and Free cannot collect card deposits
 *             at all (`null`, not 0%);
 *   claim     at 0.5% `feeRateCoversProcessingCost` is false for EVERY amount
 *             (0.005A < 0.015A), so "with card processing included" stops being
 *             unconditionally true and becomes a subsidy the founder has to
 *             own per artist.
 *
 * A public page has no artist, so it cannot consult a per-artist approval row
 * and MUST NOT try. The rule here is deliberately stricter than
 * `noSeparateCardProcessingFeesClaimVisible`: the processing-included clause
 * appears only when the rate covers cost on its own. A marketing page is read
 * by people who are not yet customers, and a claim that is true only because
 * someone ticked a box for one artist is not a claim you put in front of them.
 *
 * Deviation D6's lesson runs the other way and is respected too: where the
 * claim IS unconditionally true, it is stated, not withdrawn out of caution.
 */
export function publicDepositFeeAnswer(version?: string): string {
  const free = appointmentFeeDisplay("free", version);
  const plus = appointmentFeeDisplay("plus", version);

  // The processing-included clause, per rate. Space-prefixed so callers never
  // assemble the separator themselves and drift on it.
  const included = (bps: number) =>
    CONNECT_FEE_PAYER_IS_APPLICATION && feeRateCoversProcessingCost(bps)
      ? " with card processing included"
      : "";

  let rateSentence: string;
  if (free && plus && free.bps === plus.bps) {
    // One rate for everyone, which is v1 today.
    rateSentence = `Card deposits collected through Inklee carry a flat ${free.percentLabel}% fee${included(free.bps)}.`;
  } else if (!free && plus) {
    // Free cannot transact the lane at all. PRESENCE, NOT MAGNITUDE: never
    // render this as "0%", which would read as free-of-charge rather than
    // not-available. That distinction is called out in fee-schedule.ts.
    rateSentence = `Collecting card deposits is a Plus feature. On Plus, deposits carry a ${plus.percentLabel}% fee${included(plus.bps)}.`;
  } else if (free && plus) {
    rateSentence = `Card deposits carry a ${free.percentLabel}% fee on Free${included(free.bps)}, and ${plus.percentLabel}% on Plus${included(plus.bps)}.`;
  } else {
    // Neither tier can transact the lane. Reachable only from a malformed
    // schedule, so it says nothing about a rate rather than inventing one.
    rateSentence = "Card deposit collection is not available on your plan.";
  }

  const payerSentence = CONNECT_FEE_PAYER_IS_APPLICATION
    ? " Your client always pays exactly the deposit amount."
    : "";

  return `${rateSentence}${payerSentence} Manual deposit tracking stays free.`;
}
