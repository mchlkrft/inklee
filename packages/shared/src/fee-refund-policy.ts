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
 * The cases an ARTIST may legitimately assert on an artist-initiated refund.
 *
 * The case is a CLASSIFICATION of why money is going back, and it decides what
 * happens to Inklee's fee, so the party with an incentive must not choose it
 * freely (money-path rule; founder default "client input never selects fee or
 * refund-policy versions"). `dispute` and `fraud` are determined by Stripe /
 * chargeback events, and `inklee_error` is an Inklee-side determination that
 * returns the whole fee at Inklee's expense; an artist asserting any of the
 * three would manipulate Inklee's fee. An artist-facing refund is voluntary or
 * an artist cancellation, and nothing else. Validate route input against this.
 */
export const ARTIST_INITIATED_FEE_REFUND_CASES = [
  "voluntary_full",
  "voluntary_partial",
  "artist_cancellation",
] as const satisfies readonly FeeRefundCase[];

export function isArtistInitiatedFeeRefundCase(
  value: unknown,
): value is (typeof ARTIST_INITIATED_FEE_REFUND_CASES)[number] {
  return (
    typeof value === "string" &&
    (ARTIST_INITIATED_FEE_REFUND_CASES as readonly string[]).includes(value)
  );
}

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
  /** The platform fee Inklee KEEPS out of the fee attributable to this refund,
   *  in minor units, or null when not computable. For the computable treatments
   *  `retainMinor + returnMinor` always equals the fee attributable to this
   *  refund, so the two are a partition of that fee rather than independent
   *  numbers. Only `retain_non_recoverable` ever retains a positive amount, and
   *  it is ALWAYS bounded by the actual processor cost supplied, never inferred
   *  from the platform-fee percentage (which is a different value). */
  retainMinor: number | null;
  policyVersion: string;
};

/**
 * The fee attributable to one refund, capped at the fee actually charged. A
 * refund larger than the payment (an over-refund, or a payment amended after
 * the fact) must never touch more fee than was ever taken.
 */
function feeAttributableToRefund(
  fee: number,
  paymentMinor: number,
  refundedMinor: number,
): number {
  if (!(paymentMinor > 0) || !(refundedMinor > 0)) return 0;
  const share = Math.min(1, refundedMinor / paymentMinor);
  return Math.min(fee, Math.round(fee * share));
}

/**
 * How much platform fee to return for one refund, and how much to retain.
 *
 * `feeChargedMinor` is what was actually taken (the recorded actual, never a
 * recomputation), and the two amounts describe the payment being refunded.
 *
 * `nonRecoverableCostMinor` is the ACTUAL third-party processing cost that
 * Stripe does not return on this refund (from balance-transaction data), NOT a
 * percentage of anything. It is only consulted for `retain_non_recoverable`.
 * When it is absent (null/undefined) the outcome is NOT computable and both
 * amounts are null: the caller must fail safe rather than retain an unproven
 * amount. `alreadyRetainedMinor` is the cost already retained by prior refunds
 * on the same collection, so cumulative retention across multiple refunds can
 * never exceed the real cost (or the fee).
 */
export function feeRefundOutcome(input: {
  case: FeeRefundCase;
  feeChargedMinor: number;
  paymentMinor: number;
  refundedMinor: number;
  version?: string;
  nonRecoverableCostMinor?: number | null;
  alreadyRetainedMinor?: number;
}): FeeRefundOutcome {
  const policy = feeRefundPolicyFor(
    input.version ?? ACTIVE_FEE_REFUND_POLICY_VERSION,
  );
  const treatment = policy.cases[input.case];
  const fee = Math.max(0, Math.round(input.feeChargedMinor || 0));

  if (treatment === "return_full") {
    return { treatment, returnMinor: fee, retainMinor: 0, policyVersion: policy.version };
  }
  if (treatment === "return_proportional") {
    const feeShare = feeAttributableToRefund(
      fee,
      input.paymentMinor,
      input.refundedMinor,
    );
    return {
      treatment,
      returnMinor: feeShare,
      retainMinor: 0,
      policyVersion: policy.version,
    };
  }
  if (treatment === "retain_non_recoverable") {
    // Fail safe: without the actual processor cost we cannot know the
    // non-recoverable amount, and inferring it (e.g. from the platform-fee
    // percentage, or by retaining the whole fee) is exactly the PAY-RFD-002
    // defect. Return null so the caller returns the full fee rather than
    // retaining an unproven amount.
    if (input.nonRecoverableCostMinor == null) {
      return {
        treatment,
        returnMinor: null,
        retainMinor: null,
        policyVersion: policy.version,
      };
    }
    const feeShare = feeAttributableToRefund(
      fee,
      input.paymentMinor,
      input.refundedMinor,
    );
    const cost = Math.max(0, Math.round(input.nonRecoverableCostMinor));
    const alreadyRetained = Math.max(0, Math.round(input.alreadyRetainedMinor ?? 0));
    // Never retain more than the fee actually charged: the cost is only
    // recoverable OUT OF the fee Inklee took, so it is capped there.
    const totalRetainable = Math.min(cost, fee);
    // No double-retention across multiple refunds on the same collection.
    const remainingRetainable = Math.max(0, totalRetainable - alreadyRetained);
    const share =
      input.paymentMinor > 0
        ? Math.min(1, input.refundedMinor / input.paymentMinor)
        : 0;
    const costShareThisRefund = Math.round(totalRetainable * share);
    // Retain the cost share, but never more than remains to be retained and
    // never more than the fee being touched by THIS refund.
    const retain = Math.max(
      0,
      Math.min(costShareThisRefund, remainingRetainable, feeShare),
    );
    return {
      treatment,
      returnMinor: feeShare - retain,
      retainMinor: retain,
      policyVersion: policy.version,
    };
  }
  // retain_where_permitted: not computable from arithmetic; needs the legal and
  // contractual position of this specific transaction.
  return {
    treatment,
    returnMinor: null,
    retainMinor: null,
    policyVersion: policy.version,
  };
}

/**
 * The fee refund policy version the SERVER should apply, gated by an explicit
 * activation flag. `ACTIVE_FEE_REFUND_POLICY_VERSION` stays v0 as the pure
 * default for tests and shared code; v1 only enters live behaviour when the
 * server passes `activationEnabled: true` (wired from an env flag AFTER the
 * migration, the transaction-level cost source, and the approval key are in
 * place). Keeping this a pure function of one boolean means the activation
 * decision is testable and cannot depend on ambient module state.
 */
export function resolveActiveFeeRefundPolicyVersion(
  activationEnabled: boolean,
): string {
  return activationEnabled
    ? FEE_REFUND_POLICY_V1.version
    : FEE_REFUND_POLICY_V0.version;
}
