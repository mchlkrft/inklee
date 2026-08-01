import "server-only";
import type { FeeRefundOutcome } from "@inklee/shared/fee-refund-policy";

// THE fee-treatment DECISION, factored out of appointment-payment-refund.ts's
// original inline block (FD12) so the goods-order refund engine can share the
// SAME PAY-RFD-002 invariant instead of a second copy that could drift.
// appointment-payment-refund.ts keeps its own inline copy UNTOUCHED (this
// slice does not touch that file's tested Stripe-call path at all beyond
// additive changes); a follow-up can point it at this helper as a pure,
// behaviour-preserving refactor. Both copies must stay identical until then.
//
// The invariant this must never break (PAY-RFD-002): Inklee never retains the
// whole application fee merely because some processor cost is non-recoverable.
// Whole-fee retention only happens for retain_where_permitted (dispute/fraud),
// or when the proven cost genuinely meets or exceeds the fee.

export type FeeTreatmentDecision = {
  /** true -> Stripe returns the WHOLE application fee on the refund call. */
  refundApplicationFee: boolean;
  /** > 0 -> issue a SEPARATE application-fee refund for exactly this amount
   *  (the margin), retaining the rest as the non-recoverable cost. */
  partialFeeRefundMinor: number;
  /** The amount to record on the collection's cumulative retained-cost
   *  counter, so a later refund cannot retain the same cost twice. */
  retainedAppliedMinor: number;
  /** Set when a fail-safe path was taken, for audit visibility. */
  retentionNote: string | null;
};

export function decideFeeTreatment(
  feeOutcome: FeeRefundOutcome,
  applicationFeeId: string | null,
): FeeTreatmentDecision {
  const treatment = feeOutcome.treatment;

  if (treatment === "return_full" || treatment === "return_proportional") {
    return {
      refundApplicationFee: true,
      partialFeeRefundMinor: 0,
      retainedAppliedMinor: 0,
      retentionNote: null,
    };
  }

  if (treatment === "retain_non_recoverable") {
    if (feeOutcome.returnMinor == null || feeOutcome.retainMinor == null) {
      // FAIL SAFE: the processor cost is not proven. Never retain an unproven
      // amount and never fall back to retaining the whole fee.
      return {
        refundApplicationFee: true,
        partialFeeRefundMinor: 0,
        retainedAppliedMinor: 0,
        retentionNote: "processor_cost_unavailable",
      };
    }
    if (feeOutcome.retainMinor === 0) {
      // Nothing to retain (zero cost, or already fully retained).
      return {
        refundApplicationFee: true,
        partialFeeRefundMinor: 0,
        retainedAppliedMinor: 0,
        retentionNote: null,
      };
    }
    if (feeOutcome.returnMinor === 0) {
      // The proven cost meets or exceeds the fee touched by this refund:
      // retain it all. The ONLY whole-fee retention this case permits.
      return {
        refundApplicationFee: false,
        partialFeeRefundMinor: 0,
        retainedAppliedMinor: feeOutcome.retainMinor,
        retentionNote: null,
      };
    }
    if (applicationFeeId) {
      // Partial: retain the cost, return the margin via an application-fee
      // refund of exactly the computed return amount.
      return {
        refundApplicationFee: false,
        partialFeeRefundMinor: feeOutcome.returnMinor,
        retainedAppliedMinor: feeOutcome.retainMinor,
        retentionNote: null,
      };
    }
    // A partial fee return is owed but the application-fee id is not
    // resolvable: fail safe by returning the whole fee rather than retaining
    // more than the proven cost.
    return {
      refundApplicationFee: true,
      partialFeeRefundMinor: 0,
      retainedAppliedMinor: 0,
      retentionNote: "application_fee_id_unresolved",
    };
  }

  // retain_where_permitted (dispute/fraud): keep the fee, return nothing.
  return {
    refundApplicationFee: false,
    partialFeeRefundMinor: 0,
    retainedAppliedMinor: 0,
    retentionNote: null,
  };
}
