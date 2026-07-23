import { describe, it, expect } from "vitest";
import {
  classifyCustomer,
  deriveTaxTreatment,
  taxClassFor,
  invoiceNoteForTreatment,
  buildQuote,
  subscriptionGrantsPlus,
  planTierForSubscription,
  evaluateActivationGate,
  assertLiveBillingAllowed,
  activationChain,
  BillingActivationError,
  buildSubscriptionRefundParams,
  subscriptionIdempotencyKey,
  subscriptionRefundIdempotencyKey,
  refundDeltaToTarget,
  FORBIDDEN_SUBSCRIPTION_REFUND_KEYS,
  DEPOSIT_IDEMPOTENCY_PREFIXES,
  SUBSCRIPTION_METADATA_KEYS,
  type TaxPolicy,
  type ActivationContext,
} from "@/lib/billing";

// ---------------------------------------------------------------------------
// 1. Classification (evidence model + VIES gating)
// ---------------------------------------------------------------------------
describe("classifyCustomer", () => {
  it("no declaration => consumer, not blocked", () => {
    const c = classifyCustomer({ businessUseDeclared: false });
    expect(c.contractCustomerType).toBe("consumer");
    expect(c.vatCustomerStatus).toBe("private_non_taxable");
    expect(c.blocksCharge).toBe(false);
  });

  it("business, no VAT number => business_without_vat, no reverse charge", () => {
    const c = classifyCustomer({ businessUseDeclared: true });
    expect(c.contractCustomerType).toBe("business");
    expect(c.vatCustomerStatus).toBe("business_without_vat");
    expect(c.source).toBe("self_declared");
    expect(c.blocksCharge).toBe(false);
  });

  it("business, VIES-valid VAT => eu_vat_registered_business, vat_verified", () => {
    const c = classifyCustomer({
      businessUseDeclared: true,
      vatNumberSubmitted: true,
      viesState: "valid",
      countryIsEu: true,
    });
    expect(c.vatCustomerStatus).toBe("eu_vat_registered_business");
    expect(c.source).toBe("vat_verified");
    expect(c.confidence).toBe("high");
  });

  it("business, VIES-invalid VAT => manual review, blocks charge (no silent business)", () => {
    const c = classifyCustomer({
      businessUseDeclared: true,
      vatNumberSubmitted: true,
      viesState: "invalid",
    });
    expect(c.contractCustomerType).toBe("manual_review");
    expect(c.review).toBe("conflicting");
    expect(c.blocksCharge).toBe(true);
  });

  it("VIES provider_unavailable NEVER becomes valid; reverse charge withheld", () => {
    const c = classifyCustomer({
      businessUseDeclared: true,
      vatNumberSubmitted: true,
      viesState: "provider_unavailable",
    });
    expect(c.contractCustomerType).toBe("business");
    expect(c.vatCustomerStatus).not.toBe("eu_vat_registered_business");
    expect(c.vatCustomerStatus).toBe("manual_review");
    expect(c.review).toBe("pending");
  });

  it("validation_pending is treated the same as unavailable (withheld)", () => {
    const c = classifyCustomer({
      businessUseDeclared: true,
      vatNumberSubmitted: true,
      viesState: "validation_pending",
    });
    expect(c.vatCustomerStatus).toBe("manual_review");
  });

  it("conflicting signals => manual review, blocks charge", () => {
    const c = classifyCustomer({
      businessUseDeclared: true,
      conflictingSignals: ["declared business but consumer card country"],
    });
    expect(c.contractCustomerType).toBe("manual_review");
    expect(c.source).toBe("conflicting_evidence");
    expect(c.blocksCharge).toBe(true);
  });

  it("manual review decision overrides inference", () => {
    const c = classifyCustomer({
      businessUseDeclared: false,
      manualReview: { decidedType: "business", reviewer: "admin@inklee.app" },
    });
    expect(c.contractCustomerType).toBe("business");
    expect(c.source).toBe("manually_verified");
  });

  it("non-EU business with valid VAT is non_eu_business (not EU reverse charge)", () => {
    const c = classifyCustomer({
      businessUseDeclared: true,
      vatNumberSubmitted: true,
      viesState: "valid",
      countryIsEu: false,
    });
    expect(c.vatCustomerStatus).toBe("non_eu_business");
  });
});

// ---------------------------------------------------------------------------
// 2. Tax treatment (accountant-gated, law-in-data)
// ---------------------------------------------------------------------------
const approval = {
  managementBoardApproved: true,
  approvedBy: "Management board",
  approvedAt: "2026-07-23T00:00:00Z",
  approvalBasis: "Estonian small-business posture, unregistered",
  evidenceReferences: ["board-resolution-1"],
  nextMandatoryReviewAt: "2027-01-01T00:00:00Z",
  postureVersion: "ee-unregistered-v1",
};
const approvedPolicy: TaxPolicy = {
  versionLabel: "ee-unregistered-v1",
  sellerCountry: "EE",
  sellerVatRegistered: false,
  ossRegistered: false,
  approval,
  treatmentRules: {
    estonian: { treatment: "small_business_exemption", reverseCharge: false },
    eu_business_vat: { treatment: "reverse_charge", reverseCharge: true },
    eu_business_no_vat: {
      treatment: "place_of_supply_outside_estonia",
      reverseCharge: false,
    },
    eu_consumer: {
      treatment: "cross_border_sme_exemption",
      reverseCharge: false,
    },
    non_eu_business: {
      treatment: "place_of_supply_outside_estonia",
      reverseCharge: false,
    },
    non_eu_consumer: {
      treatment: "place_of_supply_outside_estonia",
      reverseCharge: false,
    },
  },
};

describe("taxClassFor", () => {
  it("distinguishes the six classes", () => {
    expect(
      taxClassFor({
        contractCustomerType: "consumer",
        vatCustomerStatus: "private_non_taxable",
        countryCode: "EE",
      }),
    ).toBe("estonian");
    expect(
      taxClassFor({
        contractCustomerType: "business",
        vatCustomerStatus: "eu_vat_registered_business",
        countryCode: "DE",
      }),
    ).toBe("eu_business_vat");
    expect(
      taxClassFor({
        contractCustomerType: "business",
        vatCustomerStatus: "business_without_vat",
        countryCode: "DE",
      }),
    ).toBe("eu_business_no_vat");
    expect(
      taxClassFor({
        contractCustomerType: "consumer",
        vatCustomerStatus: "private_non_taxable",
        countryCode: "FR",
      }),
    ).toBe("eu_consumer");
    expect(
      taxClassFor({
        contractCustomerType: "business",
        vatCustomerStatus: "non_eu_business",
        countryCode: "US",
      }),
    ).toBe("non_eu_business");
    expect(
      taxClassFor({
        contractCustomerType: "consumer",
        vatCustomerStatus: "private_non_taxable",
        countryCode: "US",
      }),
    ).toBe("non_eu_consumer");
  });

  it("unknown country or a review flag resolves to manual_review (never guessed)", () => {
    expect(
      taxClassFor({
        contractCustomerType: "business",
        vatCustomerStatus: "eu_vat_registered_business",
        countryCode: null,
      }),
    ).toBe("manual_review");
    expect(
      taxClassFor({
        contractCustomerType: "manual_review",
        vatCustomerStatus: "manual_review",
        countryCode: "DE",
      }),
    ).toBe("manual_review");
  });
});

describe("deriveTaxTreatment", () => {
  it("blocks when the posture is not management-board-approved", () => {
    const d = deriveTaxTreatment({
      policy: {
        ...approvedPolicy,
        approval: { ...approval, managementBoardApproved: false },
      },
      taxClass: "eu_business_vat",
      blocksCharge: false,
    });
    expect(d.blocked).toBe(true);
    expect(d.treatment).toBe("blocked");
  });

  it("manual review when the classification blocks or the class needs review", () => {
    expect(
      deriveTaxTreatment({
        policy: approvedPolicy,
        taxClass: "eu_consumer",
        blocksCharge: true,
      }).blocked,
    ).toBe(true);
    expect(
      deriveTaxTreatment({
        policy: approvedPolicy,
        taxClass: "manual_review",
        blocksCharge: false,
      }).treatment,
    ).toBe("manual_review");
  });

  it("blocks when the posture has no rule for the class", () => {
    const d = deriveTaxTreatment({
      policy: { ...approvedPolicy, treatmentRules: {} },
      taxClass: "estonian",
      blocksCharge: false,
    });
    expect(d.blocked).toBe(true);
    expect(d.blockedReason).toMatch(/No tax rule/);
  });

  it("applies reverse charge only for an EU VAT-registered business", () => {
    const d = deriveTaxTreatment({
      policy: approvedPolicy,
      taxClass: "eu_business_vat",
      blocksCharge: false,
    });
    expect(d.blocked).toBe(false);
    expect(d.treatment).toBe("reverse_charge");
    expect(d.reverseCharge).toBe(true);
    expect(d.invoiceNote).toMatch(/Reverse charge/);
  });

  it("keeps distinct treatments per class, never a generic out_of_scope", () => {
    expect(
      deriveTaxTreatment({
        policy: approvedPolicy,
        taxClass: "estonian",
        blocksCharge: false,
      }).treatment,
    ).toBe("small_business_exemption");
    expect(
      deriveTaxTreatment({
        policy: approvedPolicy,
        taxClass: "eu_consumer",
        blocksCharge: false,
      }).treatment,
    ).toBe("cross_border_sme_exemption");
  });

  it("withholds reverse charge and holds for review if a rule mis-requests it", () => {
    const d = deriveTaxTreatment({
      policy: {
        ...approvedPolicy,
        treatmentRules: {
          eu_business_no_vat: {
            treatment: "reverse_charge",
            reverseCharge: true,
          },
        },
      },
      taxClass: "eu_business_no_vat",
      blocksCharge: false,
    });
    expect(d.reverseCharge).toBe(false);
    expect(d.treatment).toBe("manual_review");
  });

  it("invoice wording is generated from the treatment", () => {
    expect(invoiceNoteForTreatment("reverse_charge")).toMatch(/Reverse charge/);
    expect(invoiceNoteForTreatment("small_business_exemption")).toMatch(
      /small enterprises/,
    );
    expect(
      deriveTaxTreatment({
        policy: approvedPolicy,
        taxClass: "estonian",
        blocksCharge: false,
      }).invoiceNote,
    ).toMatch(/small enterprises/);
  });
});

// ---------------------------------------------------------------------------
// 3. Quote arithmetic
// ---------------------------------------------------------------------------
describe("buildQuote", () => {
  it("exclusive: adds VAT on top", () => {
    const q = buildQuote({
      amountMinor: 1000,
      taxBehavior: "exclusive",
      taxRate: 0.2,
      reverseCharge: false,
      currency: "eur",
    });
    expect(q.netMinor).toBe(1000);
    expect(q.vatMinor).toBe(200);
    expect(q.grossMinor).toBe(1200);
  });

  it("inclusive: backs VAT out of the gross", () => {
    const q = buildQuote({
      amountMinor: 1200,
      taxBehavior: "inclusive",
      taxRate: 0.2,
      reverseCharge: false,
      currency: "eur",
    });
    expect(q.grossMinor).toBe(1200);
    expect(q.netMinor).toBe(1000);
    expect(q.vatMinor).toBe(200);
  });

  it("reverse charge forces VAT to zero regardless of rate", () => {
    const q = buildQuote({
      amountMinor: 1000,
      taxBehavior: "exclusive",
      taxRate: 0.2,
      reverseCharge: true,
      currency: "eur",
    });
    expect(q.vatMinor).toBe(0);
    expect(q.grossMinor).toBe(1000);
    expect(q.taxRate).toBe(0);
  });

  it("rejects non-integer minor amounts", () => {
    expect(() =>
      buildQuote({
        amountMinor: 10.5,
        taxBehavior: "exclusive",
        taxRate: 0,
        reverseCharge: false,
        currency: "eur",
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. Subscription status -> access (unknown => free is the safety property)
// ---------------------------------------------------------------------------
describe("subscriptionGrantsPlus / planTierForSubscription", () => {
  it("active and trialing grant plus", () => {
    expect(subscriptionGrantsPlus("active")).toBe(true);
    expect(subscriptionGrantsPlus("trialing")).toBe(true);
    expect(planTierForSubscription("active")).toBe("plus");
  });

  it("canceled/unpaid/incomplete/paused => free", () => {
    for (const s of [
      "canceled",
      "unpaid",
      "incomplete",
      "incomplete_expired",
      "paused",
    ]) {
      expect(subscriptionGrantsPlus(s)).toBe(false);
    }
  });

  it("an unknown/future Stripe status resolves to free (0105 no-CHECK rationale)", () => {
    expect(subscriptionGrantsPlus("some_new_stripe_status")).toBe(false);
    expect(planTierForSubscription("some_new_stripe_status")).toBe("free");
  });

  it("past_due with no grace => free", () => {
    expect(subscriptionGrantsPlus("past_due")).toBe(false);
  });

  it("past_due inside grace => plus; past grace => free", () => {
    const end = new Date("2026-07-01T00:00:00Z");
    const within = new Date("2026-07-05T00:00:00Z");
    const after = new Date("2026-07-10T00:00:00Z");
    expect(
      subscriptionGrantsPlus("past_due", {
        currentPeriodEnd: end,
        now: within,
        graceDays: 7,
      }),
    ).toBe(true);
    expect(
      subscriptionGrantsPlus("past_due", {
        currentPeriodEnd: end,
        now: after,
        graceDays: 7,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Activation gate (the live-billing kill switch)
// ---------------------------------------------------------------------------
const baseCtx: Omit<ActivationContext, "mode" | "approvals"> = {
  requiredKeys: {
    technical: ["schema_deployed", "webhook_tested"],
    b2b: ["tax_policy_approved", "terms_approved"],
    b2c: [
      "consumer_classification_approved",
      "withdrawal_function_operational",
    ],
  },
};
const approve = (
  keys: string[],
  group: ActivationContext["approvals"][number]["approvalGroup"],
) =>
  keys.map((approvalKey) => ({
    approvalKey,
    approvalGroup: group,
    approved: true,
  }));

describe("activation gate", () => {
  it("test mode is always allowed (no live money)", () => {
    const r = evaluateActivationGate("b2c", {
      ...baseCtx,
      mode: "test",
      approvals: [],
    });
    expect(r.allowed).toBe(true);
  });

  it("live mode with no approvals is blocked", () => {
    const r = evaluateActivationGate("b2b", {
      ...baseCtx,
      mode: "live",
      approvals: [],
    });
    expect(r.allowed).toBe(false);
    expect(r.missing).toContain("tax_policy_approved");
    expect(r.missing).toContain("schema_deployed");
  });

  it("b2b is additive: requires technical + b2b keys", () => {
    expect(activationChain("b2b")).toEqual(["technical", "b2b"]);
    const partial = evaluateActivationGate("b2b", {
      ...baseCtx,
      mode: "live",
      approvals: approve(["tax_policy_approved", "terms_approved"], "b2b"), // technical missing
    });
    expect(partial.allowed).toBe(false);
    expect(partial.missing).toEqual(["schema_deployed", "webhook_tested"]);

    const full = evaluateActivationGate("b2b", {
      ...baseCtx,
      mode: "live",
      approvals: [
        ...approve(["schema_deployed", "webhook_tested"], "technical"),
        ...approve(["tax_policy_approved", "terms_approved"], "b2b"),
      ],
    });
    expect(full.allowed).toBe(true);
  });

  it("b2c requires technical + b2b + b2c (approving b2b never approves b2c)", () => {
    expect(activationChain("b2c")).toEqual(["technical", "b2b", "b2c"]);
    const r = evaluateActivationGate("b2c", {
      ...baseCtx,
      mode: "live",
      approvals: [
        ...approve(["schema_deployed", "webhook_tested"], "technical"),
        ...approve(["tax_policy_approved", "terms_approved"], "b2b"),
      ],
    });
    expect(r.allowed).toBe(false);
    expect(r.missing).toContain("consumer_classification_approved");
  });

  it("a stale artifact binding blocks even when approved", () => {
    const ctx: ActivationContext = {
      ...baseCtx,
      mode: "live",
      approvals: [
        ...approve(["schema_deployed", "webhook_tested"], "technical"),
        {
          approvalKey: "tax_policy_approved",
          approvalGroup: "b2b",
          approved: true,
          boundArtifact: "v1",
        },
        {
          approvalKey: "terms_approved",
          approvalGroup: "b2b",
          approved: true,
          boundArtifact: "v1",
        },
      ],
      currentArtifacts: { tax_policy_approved: "v2" }, // v1 approval is stale
    };
    const r = evaluateActivationGate("b2b", ctx);
    expect(r.allowed).toBe(false);
    expect(r.missing).toContain("tax_policy_approved");
  });

  it("assertLiveBillingAllowed throws BillingActivationError when blocked", () => {
    expect(() =>
      assertLiveBillingAllowed("b2b", {
        ...baseCtx,
        mode: "live",
        approvals: [],
      }),
    ).toThrow(BillingActivationError);
  });
});

// ---------------------------------------------------------------------------
// 6. Deposit vs subscription ISOLATION (the regression the founder required)
// ---------------------------------------------------------------------------
describe("deposit/subscription isolation", () => {
  it("a subscription refund carries NO Connect key", () => {
    const { params } = buildSubscriptionRefundParams({
      chargeId: "ch_test_1",
      amountMinor: 200,
      billingSubscriptionId: "sub_row_1",
    });
    const keys = Object.keys(params);
    for (const forbidden of FORBIDDEN_SUBSCRIPTION_REFUND_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
    // it refunds Inklee's OWN charge by id, nothing else
    expect(params.charge).toBe("ch_test_1");
    expect(params.amount).toBe(200);
  });

  it("subscription metadata keys never collide with the deposit path", () => {
    expect(SUBSCRIPTION_METADATA_KEYS).not.toContain("booking_id");
    expect(SUBSCRIPTION_METADATA_KEYS).not.toContain("sponsored_fee_cents");
  });

  it("subscription idempotency keys never start with a deposit prefix", () => {
    const keys = [
      subscriptionIdempotencyKey("checkout", "x"),
      subscriptionIdempotencyKey("reconcile", "x"),
      subscriptionRefundIdempotencyKey("case1"),
    ];
    for (const k of keys) {
      for (const dep of DEPOSIT_IDEMPOTENCY_PREFIXES) {
        expect(k.startsWith(dep)).toBe(false);
      }
    }
  });

  it("rejects a non-positive refund amount", () => {
    expect(() =>
      buildSubscriptionRefundParams({
        chargeId: "ch",
        amountMinor: 0,
        billingSubscriptionId: "s",
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 7. Webhook convergence
// ---------------------------------------------------------------------------
describe("refundDeltaToTarget", () => {
  it("returns only the positive remaining difference", () => {
    expect(
      refundDeltaToTarget({
        targetRefundedMinor: 500,
        alreadyRefundedMinor: 200,
      }),
    ).toBe(300);
  });
  it("never moves money backwards on a redelivery", () => {
    expect(
      refundDeltaToTarget({
        targetRefundedMinor: 500,
        alreadyRefundedMinor: 500,
      }),
    ).toBe(0);
    expect(
      refundDeltaToTarget({
        targetRefundedMinor: 500,
        alreadyRefundedMinor: 800,
      }),
    ).toBe(0);
  });
});
