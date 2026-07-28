// Fee refund policy as VERSIONED DATA (Plus build P5a, spec section 11).
//
// The question this answers is narrow and specific: when money goes back to a
// client, what happens to the Inklee PLATFORM FEE on that transaction? It says
// nothing about whether a refund happens at all, which is between the artist
// and their client, and nothing about Stripe's processing cost, whose
// recoverability depends on Stripe's own pricing and behaviour and is
// therefore reported separately rather than folded in.
//
// Versioned for the same reason the fee schedule is: a policy change must not
// silently rewrite how an old transaction was treated. The version a refund is
// decided under is stamped alongside the fee schedule version.
//
// NOT ACTIVE. This encodes the approved DIRECTION so the refund paths, the
// tests and the eventual Terms wording share one source. Two of the six cases
// deliberately resolve to "decide case by case" rather than an automatic
// outcome, because "where legally and contractually permitted" is not
// something a function can evaluate. The live refund path keeps today's
// behaviour until P7 activates this with accountant and Terms review.

export const FEE_REFUND_CASES = [
  "voluntary_full",
  "voluntary_partial",
  "dispute",
  "fraud",
  "artist_cancellation",
  "inklee_error",
] as const;
export type FeeRefundCase = (typeof FEE_REFUND_CASES)[number];

/**
 * What happens to the platform fee.
 *
 * `proportional` and `full` are computable. `retain_where_permitted` and
 * `retain_non_recoverable` are NOT: they depend on the legal and contractual
 * position of a specific transaction, so the engine surfaces them for a
 * decision instead of guessing. Encoding a guess as an automatic outcome is
 * how a policy that reads correctly in a document quietly becomes something
 * else in production.
 */
export type FeeRefundTreatment =
  | "return_full"
  | "return_proportional"
  | "retain_where_permitted"
  | "retain_non_recoverable";

export type FeeRefundPolicyVersion = {
  version: string;
  effectiveFrom: string;
  cases: Record<FeeRefundCase, FeeRefundTreatment>;
  notes: string;
};

/** What the live refund path does TODAY, recorded honestly so the delta to the
 *  approved policy is visible rather than assumed. */
export const FEE_REFUND_POLICY_V0: FeeRefundPolicyVersion = {
  version: "fee-refunds-v0-current",
  effectiveFrom: "2026-07-04",
  cases: {
    voluntary_full: "return_full",
    voluntary_partial: "return_proportional",
    // No dispute handling exists at all: `charge.dispute.*` webhooks are not
    // subscribed to, so a chargeback currently reaches no Inklee code path.
    dispute: "retain_where_permitted",
    fraud: "retain_where_permitted",
    // The live behaviour, and the clearest delta from the approved policy: an
    // artist cancellation currently returns the fee ALWAYS, rather than
    // retaining non-recoverable costs.
    artist_cancellation: "return_full",
    inklee_error: "return_full",
  },
  notes:
    "Describes today's implemented behaviour, not the approved policy. Deltas: artist cancellation returns the fee in full, and disputes have no code path.",
};

/** The APPROVED direction (spec section 11). Defined, not yet active. */
export const FEE_REFUND_POLICY_V1: FeeRefundPolicyVersion = {
  version: "fee-refunds-v1-approved",
  effectiveFrom: "", // set when P7 activates it
  cases: {
    voluntary_full: "return_full",
    voluntary_partial: "return_proportional",
    dispute: "retain_where_permitted",
    fraud: "retain_where_permitted",
    artist_cancellation: "retain_non_recoverable",
    inklee_error: "return_full",
  },
  notes:
    "Subject to final accountant and Terms implementation review. Stripe processing costs stay separate in every case.",
};

export const FEE_REFUND_POLICIES: Record<string, FeeRefundPolicyVersion> = {
  [FEE_REFUND_POLICY_V0.version]: FEE_REFUND_POLICY_V0,
  [FEE_REFUND_POLICY_V1.version]: FEE_REFUND_POLICY_V1,
};

/** Still v0: activating the approved policy is a deliberate P7 act. */
export const ACTIVE_FEE_REFUND_POLICY_VERSION = FEE_REFUND_POLICY_V0.version;

export function feeRefundPolicyFor(version: string): FeeRefundPolicyVersion {
  return FEE_REFUND_POLICIES[version] ?? FEE_REFUND_POLICY_V0;
}

export type FeeRefundOutcome = {
  treatment: FeeRefundTreatment;
  /** The fee to return in minor units, or null when the treatment is not
   *  computable and a human has to decide. Null is NOT zero: zero means
   *  "return nothing", null means "this needs a decision", and collapsing the
   *  two would quietly retain fees nobody chose to retain. */
  returnMinor: number | null;
  policyVersion: string;
};

/**
 * How much platform fee to return for one refund.
 *
 * `feeChargedMinor` is what was actually taken (the recorded actual, never a
 * recomputation), and the two amounts describe the payment being refunded.
 */
export function feeRefundOutcome(input: {
  case: FeeRefundCase;
  feeChargedMinor: number;
  paymentMinor: number;
  refundedMinor: number;
  version?: string;
}): FeeRefundOutcome {
  const policy = feeRefundPolicyFor(
    input.version ?? ACTIVE_FEE_REFUND_POLICY_VERSION,
  );
  const treatment = policy.cases[input.case];
  const fee = Math.max(0, Math.round(input.feeChargedMinor || 0));

  if (treatment === "return_full") {
    return { treatment, returnMinor: fee, policyVersion: policy.version };
  }
  if (treatment === "return_proportional") {
    if (!(input.paymentMinor > 0) || !(input.refundedMinor > 0)) {
      return { treatment, returnMinor: 0, policyVersion: policy.version };
    }
    // Capped at the fee actually charged: a refund larger than the payment
    // (an over-refund, or a payment amended after the fact) must never return
    // more fee than was ever taken.
    const share = Math.min(1, input.refundedMinor / input.paymentMinor);
    return {
      treatment,
      returnMinor: Math.min(fee, Math.round(fee * share)),
      policyVersion: policy.version,
    };
  }
  // Not computable: needs the legal and contractual position of this specific
  // transaction.
  return { treatment, returnMinor: null, policyVersion: policy.version };
}
