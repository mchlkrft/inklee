import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeAccountDeletionRefund,
  DELETION_REFUND_POLICY_VERSION,
  buildSubscriptionRefundParams,
  subscriptionRefundIdempotencyKey,
} from "@/lib/billing";

/**
 * Counsel Q12 (docs/legal/counsel-handoff-2026-08-02.md §5.3): account
 * deletion ends an active paid subscription immediately AND refunds the unused
 * part of the current period pro rata.
 *
 * Before this, `deleteOwnAccountCore` cancelled and refunded nothing, which is
 * counsel's rejected "immediate without refund silently forfeits the
 * remainder" option. The tests below are split the way the risk is:
 *
 *   the ARITHMETIC (pure) — that "pro rata" means the unused part and not
 *   something adjacent, including the two boundaries where a naive formula
 *   over-refunds or over-retains;
 *
 *   the ORCHESTRATION (mocked Stripe) — that the money actually moves, that
 *   the withdrawal lane is used inside the 14-day window instead of being
 *   re-implemented, and that a refund failure records the debt without
 *   blocking a statutory erasure.
 *
 * Every "does not refund" assertion is paired with a case that does, because a
 * refund path that refunded nothing would otherwise pass half of this file.
 */

const PERIOD_START = new Date("2026-06-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-07-01T00:00:00.000Z"); // 30 days
const PRICE_MINOR = 300; // 3.00 EUR, the actual Plus price

describe("computeAccountDeletionRefund: the arithmetic", () => {
  it("refunds the UNUSED part and keeps the used part", () => {
    // Deleted exactly 1/3 through a 30-day period (day 10).
    const r = computeAccountDeletionRefund({
      paidGrossMinor: PRICE_MINOR,
      currency: "eur",
      taxRate: 0,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      deletedAt: new Date("2026-06-11T00:00:00.000Z"),
    });
    expect(r.usedFraction).toBeCloseTo(1 / 3, 10);
    expect(r.retainedGrossMinor).toBe(100);
    expect(r.refundGrossMinor).toBe(200);
    expect(r.policyVersion).toBe(DELETION_REFUND_POLICY_VERSION);
  });

  it("DISTINCTION: deleting at the very start refunds the whole period", () => {
    const r = computeAccountDeletionRefund({
      paidGrossMinor: PRICE_MINOR,
      currency: "eur",
      taxRate: 0,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      deletedAt: PERIOD_START,
    });
    expect(r.refundGrossMinor).toBe(PRICE_MINOR);
    expect(r.retainedGrossMinor).toBe(0);
  });

  it("DISTINCTION: deleting at the very end refunds nothing (the period was fully supplied)", () => {
    const r = computeAccountDeletionRefund({
      paidGrossMinor: PRICE_MINOR,
      currency: "eur",
      taxRate: 0,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      deletedAt: PERIOD_END,
    });
    expect(r.refundGrossMinor).toBe(0);
    expect(r.retainedGrossMinor).toBe(PRICE_MINOR);
  });

  it("never refunds more than was paid, even past the period end", () => {
    const r = computeAccountDeletionRefund({
      paidGrossMinor: PRICE_MINOR,
      currency: "eur",
      taxRate: 0,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      deletedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(r.usedFraction).toBe(1);
    expect(r.refundGrossMinor).toBe(0);
  });

  it("unreadable period data refunds everything (the consumer-safe direction)", () => {
    const r = computeAccountDeletionRefund({
      paidGrossMinor: PRICE_MINOR,
      currency: "eur",
      taxRate: 0,
      periodStart: PERIOD_END,
      periodEnd: PERIOD_START, // inverted
      deletedAt: new Date("2026-06-15T00:00:00.000Z"),
    });
    expect(r.usedFraction).toBe(0);
    expect(r.refundGrossMinor).toBe(PRICE_MINOR);
  });

  it("splits the refund into net + VAT preserving the original rate, inventing no cent", () => {
    const r = computeAccountDeletionRefund({
      paidGrossMinor: 2440,
      currency: "eur",
      taxRate: 0.22,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      deletedAt: new Date("2026-06-16T00:00:00.000Z"), // half
    });
    expect(r.refundGrossMinor).toBe(1220);
    expect(r.refundNetMinor + r.refundVatMinor).toBe(r.refundGrossMinor);
    expect(r.refundNetMinor).toBe(1000);
    expect(r.refundVatMinor).toBe(220);
  });

  it("nothing paid means nothing to refund (no negative refund)", () => {
    const r = computeAccountDeletionRefund({
      paidGrossMinor: 0,
      currency: "eur",
      taxRate: 0,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      deletedAt: new Date("2026-06-05T00:00:00.000Z"),
    });
    expect(r.refundGrossMinor).toBe(0);
    expect(r.retainedGrossMinor).toBe(0);
  });
});

describe("the deletion refund does not collide with the withdrawal refund on Stripe", () => {
  it("the withdrawal key is unchanged and the deletion key differs", () => {
    const subId = "bsub_1";
    expect(subscriptionRefundIdempotencyKey(subId)).toBe(`sub_refund_${subId}`);
    const withdrawal = buildSubscriptionRefundParams({
      chargeId: "ch_1",
      amountMinor: 300,
      billingSubscriptionId: subId,
      reason: "consumer_withdrawal",
    });
    const deletion = buildSubscriptionRefundParams({
      chargeId: "ch_1",
      amountMinor: 200,
      billingSubscriptionId: subId,
      reason: "account_deletion",
      idempotencyScope: "deletion",
    });
    // Byte-for-byte unchanged for the existing caller...
    expect(withdrawal.idempotencyKey).toBe(`sub_refund_${subId}`);
    // ...and distinct for the new one, so a deletion after a withdrawal on the
    // SAME subscription is not swallowed by Stripe as a replay.
    expect(deletion.idempotencyKey).not.toBe(withdrawal.idempotencyKey);
  });

  it("neither key can carry a Connect key onto the refund", () => {
    const { params } = buildSubscriptionRefundParams({
      chargeId: "ch_1",
      amountMinor: 200,
      billingSubscriptionId: "bsub_1",
      reason: "account_deletion",
      idempotencyScope: "deletion",
    });
    expect(Object.keys(params).sort()).toEqual([
      "amount",
      "charge",
      "metadata",
    ]);
  });
});

// ===========================================================================
// Orchestration
// ===========================================================================

const h = vi.hoisted(() => ({
  subscriptionsRetrieve: vi.fn(),
  subscriptionsCancel: vi.fn(),
  refundsCreate: vi.fn(),
  paymentIntentsRetrieve: vi.fn(),
  withdrawSubscriptionCore: vi.fn(),
  recordDurableConfirmation: vi.fn(),
  writeWithdrawalCreditNote: vi.fn(),
}));

vi.mock("@/lib/server/billing/client", () => ({
  requireStripe: () => ({
    subscriptions: {
      retrieve: h.subscriptionsRetrieve,
      cancel: h.subscriptionsCancel,
    },
    refunds: { create: h.refundsCreate },
    paymentIntents: { retrieve: h.paymentIntentsRetrieve },
  }),
}));

vi.mock("@/lib/server/billing/tax-snapshot", () => ({
  writeWithdrawalCreditNote: h.writeWithdrawalCreditNote,
}));

vi.mock("@/lib/server/billing/withdrawal", async (importOriginal) => {
  // The Stripe shape readers stay REAL: they are the thing that must not be
  // duplicated, so a test that stubbed them would prove nothing about reuse.
  const actual =
    await importOriginal<typeof import("@/lib/server/billing/withdrawal")>();
  return {
    ...actual,
    withdrawSubscriptionCore: h.withdrawSubscriptionCore,
    recordDurableConfirmation: h.recordDurableConfirmation,
  };
});

import { endSubscriptionForAccountDeletion } from "@/lib/server/billing/deletion-refund";

const NOW = new Date("2026-06-11T00:00:00.000Z"); // day 10 of the period

function stripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_live",
    status: "active",
    customer: "cus_1",
    // Purchased two months before NOW, so the 14-day window has closed.
    start_date: Math.floor(new Date("2026-04-01T00:00:00Z").getTime() / 1000),
    current_period_start: Math.floor(PERIOD_START.getTime() / 1000),
    current_period_end: Math.floor(PERIOD_END.getTime() / 1000),
    items: { data: [{}] },
    metadata: {},
    latest_invoice: {
      id: "in_1",
      amount_paid: PRICE_MINOR,
      currency: "eur",
      payments: {
        data: [{ payment: { payment_intent: "pi_1", charge: "ch_1" } }],
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.subscriptionsRetrieve.mockResolvedValue(stripeSubscription());
  h.subscriptionsCancel.mockResolvedValue({
    id: "sub_live",
    status: "canceled",
  });
  h.refundsCreate.mockResolvedValue({ id: "re_1" });
  h.writeWithdrawalCreditNote.mockResolvedValue("tts_1");
  h.recordDurableConfirmation.mockResolvedValue(undefined);
});

const INPUT = {
  artistId: "artist_1",
  billingSubscriptionId: "bsub_1",
  stripeSubscriptionId: "sub_live",
  contractCustomerType: "consumer",
  now: NOW,
};

describe("endSubscriptionForAccountDeletion: outside the 14-day window", () => {
  it("ends the subscription NOW and refunds the unused part", async () => {
    const outcome = await endSubscriptionForAccountDeletion(INPUT);

    expect(h.subscriptionsCancel).toHaveBeenCalledWith(
      "sub_live",
      undefined,
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(h.refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ charge: "ch_1", amount: 200 }),
      expect.objectContaining({ idempotencyKey: "sub_refund_deletion_bsub_1" }),
    );
    expect(outcome).toMatchObject({
      ended: true,
      refundState: "completed",
      processedAs: "deletion_pro_rata",
      refundGrossMinor: 200,
      stripeRefundId: "re_1",
      stripeChargeId: "ch_1",
    });
  });

  it("writes the credit-note tax record and the durable confirmation for the money that moved", async () => {
    await endSubscriptionForAccountDeletion(INPUT);
    expect(h.writeWithdrawalCreditNote).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeChargeId: "ch_1",
        refundGrossMinor: 200,
        billingSubscriptionId: "bsub_1",
      }),
    );
    expect(h.recordDurableConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "account_deletion", refundMinor: 200 }),
    );
  });

  it("does NOT touch the withdrawal machinery (that lane is for the statutory window)", async () => {
    await endSubscriptionForAccountDeletion(INPUT);
    expect(h.withdrawSubscriptionCore).not.toHaveBeenCalled();
  });

  it("DISTINCTION: an already-canceled subscription is left alone and refunds nothing", async () => {
    h.subscriptionsRetrieve.mockResolvedValue(
      stripeSubscription({ status: "canceled" }),
    );
    const outcome = await endSubscriptionForAccountDeletion(INPUT);
    expect(outcome.ended).toBe(true);
    expect(outcome.refundState).toBe("not_applicable");
    expect(h.subscriptionsCancel).not.toHaveBeenCalled();
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("DISTINCTION: a fully-used period ends the subscription and refunds nothing", async () => {
    const outcome = await endSubscriptionForAccountDeletion({
      ...INPUT,
      now: PERIOD_END,
    });
    expect(h.subscriptionsCancel).toHaveBeenCalled();
    expect(h.refundsCreate).not.toHaveBeenCalled();
    expect(outcome.refundState).toBe("not_applicable");
    expect(outcome.refundGrossMinor).toBe(0);
  });
});

describe("endSubscriptionForAccountDeletion: inside the 14-day window", () => {
  it("delegates to the existing withdrawal machinery rather than re-implementing it", async () => {
    h.subscriptionsRetrieve.mockResolvedValue(
      stripeSubscription({
        start_date: Math.floor(
          new Date("2026-06-05T00:00:00Z").getTime() / 1000,
        ),
      }),
    );
    h.withdrawSubscriptionCore.mockResolvedValue({
      status: "completed",
      refundMinor: 300,
      currency: "eur",
      caseId: "case_1",
    });

    const outcome = await endSubscriptionForAccountDeletion(INPUT);

    expect(h.withdrawSubscriptionCore).toHaveBeenCalledWith({
      artistId: "artist_1",
    });
    // The withdrawal core owns the cancel + refund; this path must not issue a
    // SECOND refund of its own on top of the statutory one.
    expect(h.refundsCreate).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      ended: true,
      refundState: "completed",
      processedAs: "withdrawal",
      refundGrossMinor: 300,
    });
  });

  it("a failing withdrawal falls back to the pro-rata lane rather than ending with no refund at all", async () => {
    h.subscriptionsRetrieve.mockResolvedValue(
      stripeSubscription({
        start_date: Math.floor(
          new Date("2026-06-05T00:00:00Z").getTime() / 1000,
        ),
      }),
    );
    h.withdrawSubscriptionCore.mockRejectedValue(new Error("stripe down"));

    const outcome = await endSubscriptionForAccountDeletion(INPUT);
    expect(outcome.processedAs).toBe("deletion_pro_rata");
    expect(h.refundsCreate).toHaveBeenCalled();
    expect(outcome.refundState).toBe("completed");
  });
});

describe("failure handling: erasure is never blocked on the refund, only on the cancel", () => {
  it("a failed REFUND records the debt and still lets the deletion proceed", async () => {
    h.refundsCreate.mockRejectedValue(new Error("card_declined"));
    const outcome = await endSubscriptionForAccountDeletion(INPUT);
    expect(outcome.ended).toBe(true); // deletion continues (counsel §3)
    expect(outcome.refundState).toBe("pending");
    expect(outcome.refundGrossMinor).toBe(200);
    // Everything needed to complete it by hand after the account is gone.
    expect(outcome.stripeChargeId).toBe("ch_1");
    expect(outcome.error).toContain("card_declined");
  });

  it("DISTINCTION: a failed CANCEL does block, because an unended subscription keeps charging", async () => {
    h.subscriptionsCancel.mockRejectedValue(new Error("stripe down"));
    h.subscriptionsRetrieve
      .mockResolvedValueOnce(stripeSubscription())
      .mockResolvedValueOnce(stripeSubscription()); // still active on re-read
    const outcome = await endSubscriptionForAccountDeletion(INPUT);
    expect(outcome.ended).toBe(false);
    expect(outcome.refundState).toBe("failed_cancel");
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("a cancel that actually succeeded despite throwing is not treated as a failure", async () => {
    h.subscriptionsCancel.mockRejectedValue(new Error("timeout"));
    h.subscriptionsRetrieve
      .mockResolvedValueOnce(stripeSubscription())
      .mockResolvedValueOnce(stripeSubscription({ status: "canceled" }));
    const outcome = await endSubscriptionForAccountDeletion(INPUT);
    expect(outcome.ended).toBe(true);
    expect(outcome.refundState).toBe("completed");
  });

  it("an owed refund with no resolvable charge is recorded as pending, not dropped", async () => {
    h.subscriptionsRetrieve.mockResolvedValue(
      stripeSubscription({
        latest_invoice: {
          id: "in_1",
          amount_paid: PRICE_MINOR,
          currency: "eur",
          payments: { data: [] },
        },
      }),
    );
    const outcome = await endSubscriptionForAccountDeletion(INPUT);
    expect(outcome.ended).toBe(true);
    expect(outcome.refundState).toBe("pending");
    expect(outcome.refundGrossMinor).toBe(200);
    expect(outcome.stripeChargeId).toBeNull();
  });
});
