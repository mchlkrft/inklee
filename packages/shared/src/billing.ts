// Pure billing engine (BM-2.0 Stage 2). No IO, no Stripe, no DB, no env.
//
// This is the deposit/subscription-safe, fully unit-testable core that the
// server billing modules build on. It encodes the founder's 2026-07-23
// amendments as code:
//   - the server-authoritative activation gate (live charging is impossible
//     until the matching approval group is recorded);
//   - customer classification as EVIDENCE (confidence + review), never truth;
//   - VIES gating (only a stored `valid` supports reverse charge);
//   - the tax treatment resolved from an accountant-approved policy's DATA,
//     never invented in code (Stripe Tax stays the calculator);
//   - server-authoritative quote arithmetic;
//   - the Stripe-status -> access resolver (unknown status resolves to free,
//     matching the 0105 no-CHECK decision);
//   - deposit vs subscription ISOLATION as testable constants + a refund-params
//     builder that structurally cannot emit a Connect reverse_transfer.
//
// Everything here is pure so the money-critical decisions can be exhaustively
// tested without a network or a database. Legal/tax VALUES live in data
// (billing_legal_policies, tax_policies) approved by counsel/accountant; this
// module only routes on them.

import type { PlanTier } from "./entitlements";

// ---------------------------------------------------------------------------
// Vocabularies (mirror the 0106 columns; the DB CHECKs are the durable copy).
// ---------------------------------------------------------------------------

export type ContractCustomerType =
  | "unresolved"
  | "business"
  | "consumer"
  | "manual_review";

export type ClassificationSource =
  | "self_declared"
  | "vat_verified"
  | "manually_verified"
  | "system_inferred"
  | "conflicting_evidence"
  | "unresolved";

export type ClassificationConfidence = "low" | "medium" | "high";

export type ClassificationReview =
  | "not_required"
  | "pending"
  | "reviewed"
  | "conflicting";

export type ViesState =
  | "not_submitted"
  | "validation_pending"
  | "valid"
  | "invalid"
  | "provider_unavailable"
  | "manual_review";

export type VatCustomerStatus =
  | "unresolved"
  | "eu_vat_registered_business"
  | "business_without_vat"
  | "private_non_taxable"
  | "non_eu_business"
  | "manual_review";

export type TaxTreatment =
  | "unresolved"
  | "domestic_standard"
  | "reverse_charge"
  | "oss_destination"
  | "zero_rated_export"
  | "out_of_scope"
  | "blocked";

export type TaxBehavior = "inclusive" | "exclusive";

export type ApprovalGroup = "technical" | "b2b" | "b2c";

export type BillingMode = "test" | "live";

// ===========================================================================
// 1. Customer classification (amendments 3 + 4).
//    The professional-use declaration is EVIDENCE. VIES gates reverse charge:
//    only a stored `valid` may support it; `provider_unavailable` /
//    `validation_pending` NEVER silently become valid; conflicting evidence
//    routes to manual review, it never auto-denies consumer protections.
// ===========================================================================

export type ClassificationEvidence = {
  /** The separate, unchecked professional-use control (never preselected). */
  businessUseDeclared: boolean;
  /** A VAT number was entered (its validity is `viesState`, not this flag). */
  vatNumberSubmitted?: boolean;
  /** Current resolved VIES state for a submitted number. */
  viesState?: ViesState;
  /** Customer billing country is inside the EU (null = unknown). */
  countryIsEu?: boolean | null;
  /** An explicit admin decision overrides inference. */
  manualReview?: { decidedType: ContractCustomerType; reviewer: string } | null;
  /** Upstream-detected contradictions (e.g. declared business, consumer card). */
  conflictingSignals?: string[];
};

export type Classification = {
  contractCustomerType: ContractCustomerType;
  vatCustomerStatus: VatCustomerStatus;
  source: ClassificationSource;
  confidence: ClassificationConfidence;
  review: ClassificationReview;
  /** True when a live charge must not proceed without a human decision. */
  blocksCharge: boolean;
  reasons: string[];
};

export function classifyCustomer(
  evidence: ClassificationEvidence,
): Classification {
  const reasons: string[] = [];

  // An explicit admin decision wins over any inference.
  if (evidence.manualReview) {
    return {
      contractCustomerType: evidence.manualReview.decidedType,
      vatCustomerStatus:
        evidence.manualReview.decidedType === "business"
          ? "manual_review"
          : evidence.manualReview.decidedType === "consumer"
            ? "private_non_taxable"
            : "manual_review",
      source: "manually_verified",
      confidence: "high",
      review: "reviewed",
      blocksCharge: evidence.manualReview.decidedType === "manual_review",
      reasons: [`Manually reviewed by ${evidence.manualReview.reviewer}.`],
    };
  }

  // Conflicting evidence never auto-decides; it blocks and routes to review.
  if (evidence.conflictingSignals && evidence.conflictingSignals.length > 0) {
    return {
      contractCustomerType: "manual_review",
      vatCustomerStatus: "manual_review",
      source: "conflicting_evidence",
      confidence: "low",
      review: "conflicting",
      blocksCharge: true,
      reasons: [
        "Conflicting evidence; routed to manual review.",
        ...evidence.conflictingSignals,
      ],
    };
  }

  if (!evidence.businessUseDeclared) {
    // No professional-use declaration => treat as a consumer. Consumer live
    // charging is gated separately by the b2c activation group.
    reasons.push("No professional-use declaration; treated as consumer.");
    return {
      contractCustomerType: "consumer",
      vatCustomerStatus: "private_non_taxable",
      source: "self_declared",
      confidence: "medium",
      review: "not_required",
      blocksCharge: false,
      reasons,
    };
  }

  // Professional use declared.
  reasons.push("Professional use declared.");
  const submitted = evidence.vatNumberSubmitted === true;
  const vies = evidence.viesState ?? "not_submitted";
  const nonEu = evidence.countryIsEu === false;

  if (!submitted) {
    reasons.push("Business without a submitted VAT number.");
    return {
      contractCustomerType: "business",
      vatCustomerStatus: nonEu ? "non_eu_business" : "business_without_vat",
      source: "self_declared",
      confidence: "medium",
      review: "not_required",
      blocksCharge: false,
      reasons,
    };
  }

  // A VAT number was submitted; its VIES state decides reverse-charge support.
  switch (vies) {
    case "valid":
      reasons.push("VAT number VIES-valid; reverse charge supported.");
      return {
        contractCustomerType: "business",
        vatCustomerStatus: nonEu
          ? "non_eu_business"
          : "eu_vat_registered_business",
        source: "vat_verified",
        confidence: "high",
        review: "not_required",
        blocksCharge: false,
        reasons,
      };
    case "invalid":
      // Declared business + an invalid VAT number is contradictory. Do not
      // silently treat as a plain business; block and review.
      reasons.push("Submitted VAT number is VIES-invalid; contradiction.");
      return {
        contractCustomerType: "manual_review",
        vatCustomerStatus: "manual_review",
        source: "conflicting_evidence",
        confidence: "low",
        review: "conflicting",
        blocksCharge: true,
        reasons,
      };
    case "provider_unavailable":
    case "validation_pending":
    case "manual_review":
    case "not_submitted":
    default:
      // Cannot confirm the number. NEVER assume valid. The customer is a
      // business (declared) but reverse charge is NOT granted; hold for a
      // resolved VIES check or a manual review.
      reasons.push(
        `VAT number not confirmed (VIES: ${vies}); reverse charge withheld.`,
      );
      return {
        contractCustomerType: "business",
        vatCustomerStatus: "manual_review",
        source: "self_declared",
        confidence: "medium",
        review: "pending",
        blocksCharge: false,
        reasons,
      };
  }
}

// ===========================================================================
// 2. Tax treatment resolver (amendment 2 + the "law is data" rule).
//    The treatment comes from the accountant-approved policy's DATA. Code only
//    picks the rule for the customer's class and blocks when unapproved or
//    unmapped. It never invents a rate; Stripe Tax computes the amount.
// ===========================================================================

export type TaxTreatmentRule = {
  treatment: TaxTreatment;
  reverseCharge: boolean;
  taxCode?: string;
  note?: string;
};

export type TaxPolicy = {
  versionLabel: string;
  sellerCountry: string;
  sellerVatRegistered: boolean;
  ossRegistered: boolean;
  /** Only an accountant sets this. Founder/dev cannot. Null/false = not live. */
  approvedByAccountant: boolean;
  /** Data: VatCustomerStatus -> rule. Owned by the accountant. */
  treatmentRules: Partial<Record<VatCustomerStatus, TaxTreatmentRule>>;
};

export type TaxDerivation = {
  treatment: TaxTreatment;
  reverseCharge: boolean;
  taxCode?: string;
  blocked: boolean;
  blockedReason?: string;
  reasons: string[];
};

export function deriveTaxTreatment(input: {
  policy: TaxPolicy;
  classification: Pick<
    Classification,
    "vatCustomerStatus" | "blocksCharge"
  >;
}): TaxDerivation {
  const { policy, classification } = input;

  if (!policy.approvedByAccountant) {
    return {
      treatment: "blocked",
      reverseCharge: false,
      blocked: true,
      blockedReason:
        "Tax policy is not accountant-approved; no live treatment may be derived.",
      reasons: [],
    };
  }

  if (classification.blocksCharge) {
    return {
      treatment: "blocked",
      reverseCharge: false,
      blocked: true,
      blockedReason: "Classification blocks the charge (manual review).",
      reasons: [],
    };
  }

  const rule = policy.treatmentRules[classification.vatCustomerStatus];
  if (!rule) {
    // The accountant policy has no mapping for this class. Block rather than
    // guess a treatment.
    return {
      treatment: "blocked",
      reverseCharge: false,
      blocked: true,
      blockedReason: `No tax rule for customer class '${classification.vatCustomerStatus}' in policy '${policy.versionLabel}'.`,
      reasons: [],
    };
  }

  // Reverse charge is only ever emitted when the class is an EU VAT-registered
  // business (VIES-valid). Belt-and-braces against a mis-authored rule.
  const reverseCharge =
    rule.reverseCharge &&
    classification.vatCustomerStatus === "eu_vat_registered_business";

  return {
    treatment: rule.treatment,
    reverseCharge,
    taxCode: rule.taxCode,
    blocked: false,
    reasons: [
      `Applied rule for '${classification.vatCustomerStatus}' from policy '${policy.versionLabel}'.`,
      ...(rule.note ? [rule.note] : []),
      ...(rule.reverseCharge && !reverseCharge
        ? ["Rule requested reverse charge but the class does not support it; withheld."]
        : []),
    ],
  };
}

// ===========================================================================
// 3. Server-authoritative quote arithmetic (P4).
//    The single source of both the displayed price and the Stripe amount.
//    `taxRate` is supplied by Stripe Tax (or 0 for reverse charge / zero-rated);
//    this only does the exact-integer minor-unit split.
// ===========================================================================

export type QuoteInput = {
  /** The Price amount in minor units (its meaning depends on taxBehavior). */
  amountMinor: number;
  taxBehavior: TaxBehavior;
  /** 0..1, from Stripe Tax; forced to 0 when reverseCharge. */
  taxRate: number;
  reverseCharge: boolean;
  currency: string;
};

export type Quote = {
  currency: string;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  taxRate: number;
  taxBehavior: TaxBehavior;
  reverseCharge: boolean;
};

export function buildQuote(input: QuoteInput): Quote {
  const { amountMinor, taxBehavior, currency } = input;
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new Error("amountMinor must be a non-negative integer (minor units).");
  }
  const rate = input.reverseCharge ? 0 : input.taxRate;
  if (rate < 0 || rate > 1) throw new Error("taxRate must be within 0..1.");

  let netMinor: number;
  let grossMinor: number;
  if (taxBehavior === "exclusive") {
    // Amount is net; VAT is added on top.
    netMinor = amountMinor;
    grossMinor = Math.round(netMinor * (1 + rate));
  } else {
    // Amount is gross (VAT included); back out the net.
    grossMinor = amountMinor;
    netMinor = Math.round(grossMinor / (1 + rate));
  }
  const vatMinor = grossMinor - netMinor;

  return {
    currency,
    netMinor,
    vatMinor,
    grossMinor,
    taxRate: rate,
    taxBehavior,
    reverseCharge: input.reverseCharge,
  };
}

// ===========================================================================
// 4. Stripe subscription status -> access resolver.
//    Unknown/extended statuses resolve to `free` (why 0105 stores the raw
//    status with NO CHECK). past_due keeps access only inside an optional grace.
// ===========================================================================

/** Raw Stripe statuses that grant access with no grace consideration. */
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function subscriptionGrantsPlus(
  status: string,
  opts?: { currentPeriodEnd?: Date | null; now?: Date; graceDays?: number },
): boolean {
  if (ACTIVE_STATUSES.has(status)) return true;
  if (status === "past_due") {
    const graceDays = opts?.graceDays ?? 0;
    if (graceDays <= 0) return false;
    const end = opts?.currentPeriodEnd;
    const now = opts?.now;
    if (!end || !now) return false;
    const graceEnd = new Date(end.getTime() + graceDays * 24 * 60 * 60 * 1000);
    return now.getTime() <= graceEnd.getTime();
  }
  // canceled, unpaid, incomplete, incomplete_expired, paused, and any future
  // status Stripe adds => no access.
  return false;
}

/** The plan tier an entitlement resolver should write for a subscription. */
export function planTierForSubscription(
  status: string,
  opts?: { currentPeriodEnd?: Date | null; now?: Date; graceDays?: number },
): PlanTier {
  return subscriptionGrantsPlus(status, opts) ? "plus" : "free";
}

// ===========================================================================
// 5. Activation gate (amendment 11). The single server-authoritative check
//    that makes LIVE charging impossible until the matching approval group is
//    recorded. Groups are ADDITIVE: b2b requires technical + b2b; b2c requires
//    technical + b2b + b2c. A frontend flag can never open this.
// ===========================================================================

export type ActivationApproval = {
  approvalKey: string;
  approvalGroup: ApprovalGroup;
  approved: boolean;
  /** The artifact version this approval was bound to (terms/policy hash). */
  boundArtifact?: string | null;
};

export type ActivationContext = {
  mode: BillingMode;
  approvals: ActivationApproval[];
  /** Keys each group requires to be approved. */
  requiredKeys: Record<ApprovalGroup, string[]>;
  /** Optional version binding: key -> the artifact version that must match. */
  currentArtifacts?: Record<string, string>;
};

export type ActivationResult = {
  allowed: boolean;
  missing: string[];
  reasons: string[];
};

/** The additive chain of groups that a target group depends on. */
export function activationChain(group: ApprovalGroup): ApprovalGroup[] {
  switch (group) {
    case "technical":
      return ["technical"];
    case "b2b":
      return ["technical", "b2b"];
    case "b2c":
      return ["technical", "b2b", "b2c"];
  }
}

export function evaluateActivationGate(
  group: ApprovalGroup,
  ctx: ActivationContext,
): ActivationResult {
  // Test mode charges no live money, so the live gate is a no-op there. This is
  // what lets the whole flow be dogfooded end to end with the gate still closed.
  if (ctx.mode === "test") {
    return {
      allowed: true,
      missing: [],
      reasons: ["Test mode: no live money; live activation gate not required."],
    };
  }

  const chain = activationChain(group);
  const requiredKeys = chain.flatMap((g) => ctx.requiredKeys[g] ?? []);
  const byKey = new Map(ctx.approvals.map((a) => [a.approvalKey, a]));

  const missing: string[] = [];
  const reasons: string[] = [];
  for (const key of requiredKeys) {
    const a = byKey.get(key);
    if (!a || !a.approved) {
      missing.push(key);
      continue;
    }
    if (ctx.currentArtifacts && key in ctx.currentArtifacts) {
      const expected = ctx.currentArtifacts[key];
      if ((a.boundArtifact ?? null) !== expected) {
        missing.push(key);
        reasons.push(
          `Approval '${key}' is bound to a stale artifact (expected '${expected}').`,
        );
      }
    }
  }

  const allowed = missing.length === 0;
  if (allowed) {
    reasons.push(
      `Live billing allowed for '${group}': all ${requiredKeys.length} required approval(s) present.`,
    );
  } else {
    reasons.unshift(
      `Live billing BLOCKED for '${group}': ${missing.length} approval(s) missing or stale.`,
    );
  }
  return { allowed, missing, reasons };
}

/** Throwing variant for the money path. */
export function assertLiveBillingAllowed(
  group: ApprovalGroup,
  ctx: ActivationContext,
): void {
  const r = evaluateActivationGate(group, ctx);
  if (!r.allowed) {
    throw new BillingActivationError(group, r.missing, r.reasons.join(" "));
  }
}

export class BillingActivationError extends Error {
  readonly group: ApprovalGroup;
  readonly missing: string[];
  constructor(group: ApprovalGroup, missing: string[], message: string) {
    super(message);
    this.name = "BillingActivationError";
    this.group = group;
    this.missing = missing;
  }
}

// ===========================================================================
// 6. Deposit vs subscription ISOLATION (amendment 6), as testable code.
//    A subscription refund is refunds.create on Inklee's OWN charge. It must
//    NEVER carry a Connect key (reverse_transfer / refund_application_fee /
//    transfer_data / on_behalf_of), which would pull money from an artist's
//    Connect balance the way a DEPOSIT refund does. The builder below cannot
//    emit those keys, and the constant lets tests assert it.
// ===========================================================================

export const SUBSCRIPTION_IDEMPOTENCY_PREFIX = "sub_";
export const SUBSCRIPTION_REFUND_IDEMPOTENCY_PREFIX = "sub_refund_";

/** Deposit-path idempotency prefixes, for the collision regression test. */
export const DEPOSIT_IDEMPOTENCY_PREFIXES = [
  "deposit-intent-",
  "refund-deposit-",
] as const;

/** Metadata keys the subscription path uses. Deliberately disjoint from the
 *  deposit path's (booking_id / artist_id / sponsored_fee_cents). */
export const SUBSCRIPTION_METADATA_KEYS = [
  "billing_flow",
  "billing_subscription_id",
  "pricing_plan_id",
  "contract_customer_type",
  "inklee_env",
] as const;

/** Connect-only keys that must never appear on a subscription refund. */
export const FORBIDDEN_SUBSCRIPTION_REFUND_KEYS = [
  "reverse_transfer",
  "refund_application_fee",
  "transfer_data",
  "on_behalf_of",
  "application_fee_amount",
] as const;

export function subscriptionIdempotencyKey(
  kind: "checkout" | "reconcile" | "cancel",
  id: string,
): string {
  return `${SUBSCRIPTION_IDEMPOTENCY_PREFIX}${kind}_${id}`;
}

export function subscriptionRefundIdempotencyKey(
  refundCaseId: string,
): string {
  return `${SUBSCRIPTION_REFUND_IDEMPOTENCY_PREFIX}${refundCaseId}`;
}

export type SubscriptionRefundParams = {
  charge: string;
  amount: number;
  metadata: Record<string, string>;
};

/** Build the params for a subscription refund. Structurally cannot include a
 *  Connect key: it returns a closed object shape with only charge/amount/
 *  metadata. Kept pure so the isolation guarantee is unit-tested. */
export function buildSubscriptionRefundParams(input: {
  chargeId: string;
  amountMinor: number;
  billingSubscriptionId: string;
  reason?: string;
}): { params: SubscriptionRefundParams; idempotencyKey: string } {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Refund amount must be a positive integer (minor units).");
  }
  return {
    params: {
      charge: input.chargeId,
      amount: input.amountMinor,
      metadata: {
        billing_flow: "plus_subscription",
        billing_subscription_id: input.billingSubscriptionId,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    },
    idempotencyKey: subscriptionRefundIdempotencyKey(input.billingSubscriptionId),
  };
}

// ===========================================================================
// 7. Webhook convergence helper (money-path rule: converge to a target under a
//    lock, never add a delta). For cumulative refund amounts, compute only the
//    remaining difference to apply.
// ===========================================================================

export function refundDeltaToTarget(input: {
  targetRefundedMinor: number;
  alreadyRefundedMinor: number;
}): number {
  const delta = input.targetRefundedMinor - input.alreadyRefundedMinor;
  // Never move money backwards from a webhook; a redelivery reports the same or
  // a higher cumulative total.
  return delta > 0 ? delta : 0;
}
