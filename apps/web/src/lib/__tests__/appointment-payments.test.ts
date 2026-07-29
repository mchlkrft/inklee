import { describe, it, expect } from "vitest";
import {
  PAYMENT_REQUEST_STATUSES,
  PAYMENT_REQUEST_TRANSITIONS,
  TERMINAL_PAYMENT_REQUEST_STATUSES,
  PAYABLE_PAYMENT_REQUEST_STATUSES,
  ARTIST_WRITABLE_PAYMENT_REQUEST_STATUSES,
  canTransitionPaymentRequest,
  isTerminalPaymentRequestStatus,
  isPayablePaymentRequestStatus,
  isFrozenPaymentRequest,
  outstandingBalance,
  checkCollectable,
  checkAllocation,
  balanceExtrasFromLines,
  lineTotalMinor,
  requestTotalMinor,
  assertIntegerMinor,
  assertPaymentLineSign,
  isStorableMinor,
  MAX_STORABLE_MINOR,
  MIN_STORABLE_MINOR,
  NEGATIVE_PAYMENT_LINE_CLASSIFICATIONS,
  PAYMENT_LINE_CLASSIFICATIONS,
  type PaymentAllocation,
  type PaymentRequestStatus,
  type PaymentSubject,
} from "@inklee/shared/appointment-payments";

/**
 * The pure model for appointment payments (P9 slice A1).
 *
 * Spec: docs/product/plus-payments-architecture.md sections 3, 4, 7 and 8, and
 * the test obligations in section 12.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. It cannot see a missing RLS policy, a
 * missing constraint or a broken freeze: those live in
 * `apps/web/tests/db/appointment-payments-rls.test.ts` and nowhere else. What
 * it does prove is the arithmetic and the state machine that every one of web,
 * mobile and the A2-A8 cores will read, where a wrong answer is a wrong charge.
 *
 * Every amount below is integer minor units, matching the schema and Stripe.
 */

const BOOKING: PaymentSubject = { kind: "booking", id: "bk-1" };
const PROJECT: PaymentSubject = { kind: "project", id: "pj-1" };

let seq = 0;

/** One allocation row. Defaults describe the ordinary case (a successful
 *  collection on this appointment in eur) so each test overrides only the one
 *  fact it is about. */
function alloc(over: Partial<PaymentAllocation> = {}): PaymentAllocation {
  seq += 1;
  return {
    id: `al-${seq}`,
    artistId: "ar-1",
    bookingId: BOOKING.id,
    projectId: null,
    requestId: null,
    lineId: null,
    paymentIntentId: `pi_${seq}`,
    component: "deposit",
    amountMinor: 5000,
    collectedTotalMinor: 5000,
    currency: "eur",
    status: "succeeded",
    settledAt: "2026-07-29T10:00:00.000Z",
    ...over,
  };
}

function balance(over: {
  subject?: PaymentSubject;
  currency?: string;
  finalServicePriceMinor?: number | null;
  extras?: Parameters<typeof outstandingBalance>[0]["extras"];
  allocations?: readonly PaymentAllocation[];
}) {
  return outstandingBalance({
    subject: over.subject ?? BOOKING,
    currency: over.currency ?? "eur",
    finalServicePriceMinor:
      over.finalServicePriceMinor === undefined
        ? 30000
        : over.finalServicePriceMinor,
    extras: over.extras ?? [],
    allocations: over.allocations ?? [],
  });
}

// ===========================================================================

describe("spec section 4: the four starting states are one model", () => {
  // "Deposit-then-balance, full-payment-only, deposit-equals-full-price, and
  // pay-after-the-session are all the same model with different starting
  // states." Each is checked separately because a special case appearing for
  // any one of them means the model is wrong, and a combined test would not say
  // which one grew the special case.

  it("deposit then balance: the collected deposit reduces what is still collectible", async () => {
    // FALSIFIES IF: `outstandingBalance` stops subtracting `allocatedMinor`, or
    // the deposit's `succeeded` status is dropped from
    // PAYMENT_STATUSES_COUNTING_TOWARD_BALANCE.
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ component: "deposit", amountMinor: 5000 })],
    });
    expect(b.status).toBe("collectible");
    expect(b.grossMinor).toBe(30000);
    expect(b.allocatedMinor).toBe(5000);
    expect(b.remainingMinor).toBe(25000);
    expect(b.maxCollectibleMinor).toBe(25000);
    expect(checkCollectable(b, 25000)).toEqual({
      ok: true,
      amountMinor: 25000,
    });
  });

  it("full payment without a deposit: the whole price is collectible, then nothing is", async () => {
    // FALSIFIES IF: the model requires a prior deposit anywhere, or treats an
    // empty allocation list as "unknown" rather than "nothing collected yet".
    const before = balance({ finalServicePriceMinor: 30000, allocations: [] });
    expect(before.status).toBe("collectible");
    expect(before.remainingMinor).toBe(30000);

    const after = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ component: "full_price", amountMinor: 30000 })],
    });
    expect(after.status).toBe("settled");
    expect(after.remainingMinor).toBe(0);
  });

  it("deposit equal to the full price: settled, with nothing further collectible", async () => {
    // FALSIFIES IF: zero remaining is reported as `collectible`, which is what
    // would let a EUR 0.00 request be created.
    const b = balance({
      finalServicePriceMinor: 5000,
      allocations: [alloc({ component: "deposit", amountMinor: 5000 })],
    });
    expect(b.status).toBe("settled");
    expect(b.remainingMinor).toBe(0);
    expect(checkCollectable(b, 1)).toEqual({
      ok: false,
      reason: "nothing_outstanding",
      maxCollectibleMinor: 0,
    });
  });

  it("pay after the session: nothing is collectible until the artist confirms a final price", async () => {
    // FALSIFIES IF: a null final price is coerced to 0 (which would read as
    // `settled`), or inferred from the deposit. Spec section 4: the final price
    // is NEVER inferred from the deposit, which is why the function takes no
    // deposit argument it could infer from.
    const unknown = balance({
      finalServicePriceMinor: null,
      allocations: [alloc({ component: "deposit", amountMinor: 5000 })],
    });
    expect(unknown.status).toBe("final_price_unknown");
    expect(unknown.maxCollectibleMinor).toBe(0);
    // The deposit is still visible: it is counted, just not collectible against
    // a price nobody has confirmed.
    expect(unknown.allocatedMinor).toBe(5000);
    expect(checkCollectable(unknown, 1)).toEqual({
      ok: false,
      reason: "final_price_unknown",
      maxCollectibleMinor: 0,
    });

    const confirmed = balance({
      finalServicePriceMinor: 40000,
      allocations: [alloc({ component: "deposit", amountMinor: 5000 })],
    });
    expect(confirmed.status).toBe("collectible");
    expect(confirmed.remainingMinor).toBe(35000);
  });

  it("the same model works for a project subject, not only an appointment", async () => {
    // FALSIFIES IF: `allocationCountsTowardBalance` matches on bookingId
    // regardless of the subject kind, which would count nothing for projects.
    const b = outstandingBalance({
      subject: PROJECT,
      currency: "eur",
      finalServicePriceMinor: 30000,
      extras: [],
      allocations: [
        alloc({ bookingId: null, projectId: PROJECT.id, amountMinor: 5000 }),
      ],
    });
    expect(b.remainingMinor).toBe(25000);
    expect(b.countedAllocationIds).toHaveLength(1);
  });
});

describe("spec section 12: final price below the deposit, and above the estimate", () => {
  it("a final price BELOW the deposit reports an overpayment and refuses further collection", async () => {
    // A named spec obligation, and the one where a naive `remaining = gross -
    // allocated` would go negative and a naive clamp would hide it entirely.
    // Both facts must survive: nothing more is collectible AND the artist owes
    // a refund.
    //
    // FALSIFIES IF: `rawRemainingMinor` is clamped before `overpaidMinor` is
    // derived from it, or `overpaid` is folded into `settled`.
    const b = balance({
      finalServicePriceMinor: 4000,
      allocations: [alloc({ component: "deposit", amountMinor: 5000 })],
    });
    expect(b.status).toBe("overpaid");
    expect(b.rawRemainingMinor).toBe(-1000);
    expect(b.remainingMinor, "never negative").toBe(0);
    expect(b.overpaidMinor, "A5 refunds this").toBe(1000);
    expect(checkCollectable(b, 1).ok).toBe(false);
  });

  it("a final price ABOVE the earlier estimate is collectible in full, not capped at the estimate", async () => {
    // The estimate is not a stored quantity in this model, and that is the
    // point: what was quoted has no authority over what the artist confirms.
    // The deposit was taken against an estimate of 20000; the confirmed price
    // is 26000, so 21000 remains rather than 15000.
    //
    // FALSIFIES IF: anything caps the balance at a previously quoted total, or
    // derives the price from the deposit's `collectedTotalMinor`.
    const b = balance({
      finalServicePriceMinor: 26000,
      allocations: [
        alloc({
          component: "deposit",
          amountMinor: 5000,
          collectedTotalMinor: 5000,
        }),
      ],
    });
    expect(b.grossMinor).toBe(26000);
    expect(b.remainingMinor).toBe(21000);
    expect(checkCollectable(b, 21000).ok).toBe(true);
  });
});

describe("spec section 4: collection is refused above the outstanding amount", () => {
  it("refuses one minor unit above the maximum and reports the ceiling", async () => {
    // FALSIFIES IF: `checkCollectable` compares with `>=`, or clamps the
    // amount to the maximum instead of refusing.
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ amountMinor: 5000 })],
    });
    const refused = checkCollectable(b, 25001);
    expect(refused).toEqual({
      ok: false,
      reason: "above_outstanding",
      maxCollectibleMinor: 25000,
    });
    // A refusal must NOT carry a collectible amount: a caller that reached for
    // one would charge an amount nobody asked for.
    expect(refused).not.toHaveProperty("amountMinor");
  });

  it("accepts exactly the maximum and any partial amount below it", async () => {
    // POSITIVE CONTROL. Without it, a `checkCollectable` that refused
    // everything would satisfy every refusal test in this file.
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ amountMinor: 5000 })],
    });
    expect(checkCollectable(b, 25000).ok).toBe(true);
    expect(checkCollectable(b, 1).ok).toBe(true);
    expect(checkCollectable(b, 12500).ok).toBe(true);
  });

  it("refuses zero and negative amounts, and THROWS on a non-integer", async () => {
    const b = balance({ finalServicePriceMinor: 30000 });
    for (const amount of [0, -1]) {
      const result = checkCollectable(b, amount);
      expect(result.ok, `amount ${amount}`).toBe(false);
      // Narrowed rather than asserted through `as`: a refusal that stopped
      // carrying a reason should fail the typecheck, not be cast past it.
      expect(result.ok === false && result.reason).toBe("not_positive");
    }
    // 10.5 was pinned here as `not_positive`, which is false about the number:
    // 10.5 IS positive. A float reaching a collection amount is a wrong charge
    // being computed upstream, so it throws like every other amount in this
    // module rather than being refused under a reason that sends the caller
    // looking for a zero.
    expect(() => checkCollectable(b, 10.5)).toThrow(
      /integer number of minor units/,
    );
  });
});

describe("spec section 4: a zero balance produces no request, not a zero one", () => {
  it("a settled balance offers no collectible amount at all", async () => {
    // The rule is about what the caller CAN do, so the assertion is that there
    // is no amount, including zero, that `checkCollectable` will approve.
    //
    // FALSIFIES IF: `maxCollectibleMinor` stops being clamped to 0, or
    // `checkCollectable` approves 0.
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ amountMinor: 30000 })],
    });
    expect(b.status).toBe("settled");
    expect(b.remainingMinor).toBe(0);
    expect(b.maxCollectibleMinor).toBe(0);
    for (const amount of [0, 1, 100, 30000]) {
      expect(checkCollectable(b, amount).ok, `amount ${amount}`).toBe(false);
    }
  });

  it("distinguishes settled from final-price-unknown, which both read as zero", async () => {
    // The entire reason `status` exists. From `remainingMinor` alone a caller
    // cannot tell "everything is paid" from "we do not know the price", and
    // those demand opposite behaviour: one shows a receipt, the other asks the
    // artist to confirm a price.
    const settled = balance({
      finalServicePriceMinor: 5000,
      allocations: [alloc({ amountMinor: 5000 })],
    });
    const unknown = balance({ finalServicePriceMinor: null });
    expect(settled.remainingMinor).toBe(unknown.remainingMinor);
    expect(settled.status).not.toBe(unknown.status);
  });
});

describe("spec section 4: what does NOT count toward the balance", () => {
  // ONE TEST PER RULE, deliberately. A single combined test tells you the
  // filter broke but not which state leaked through, and these four are exactly
  // the states where counting a payment that never became the artist's money
  // makes them under-collect a real balance.

  const EXPECTED_UNPAID = 30000;

  it("a FAILED payment does not count", async () => {
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ amountMinor: 5000, status: "failed" })],
    });
    expect(b.allocatedMinor).toBe(0);
    expect(b.remainingMinor).toBe(EXPECTED_UNPAID);
    expect(b.ignoredAllocationIds).toHaveLength(1);
  });

  it("a CANCELLED payment does not count", async () => {
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ amountMinor: 5000, status: "cancelled" })],
    });
    expect(b.allocatedMinor).toBe(0);
    expect(b.remainingMinor).toBe(EXPECTED_UNPAID);
  });

  it("a DISPUTED payment does not count while the dispute is open", async () => {
    // The funds are withdrawn while a dispute is open. Counting them would let
    // the artist under-collect against money that may never be theirs.
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ amountMinor: 5000, status: "disputed" })],
    });
    expect(b.allocatedMinor).toBe(0);
    expect(b.remainingMinor).toBe(EXPECTED_UNPAID);
  });

  it("a REFUNDED payment nets to zero through its refund adjustment", async () => {
    // Refunds are not a status in this model: they are negative
    // `refund_adjustment` components, so "not fully refunded" falls out of the
    // arithmetic rather than needing a flag that could disagree with it. The
    // original collection row stays intact, which is what spec section 9
    // requires and what dispute evidence is made of.
    //
    // FALSIFIES IF: the sum stops being signed, or refund adjustments are
    // filtered out of the balance.
    const intent = "pi_refunded";
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [
        alloc({
          paymentIntentId: intent,
          component: "deposit",
          amountMinor: 5000,
        }),
        alloc({
          paymentIntentId: intent,
          component: "refund_adjustment",
          amountMinor: -5000,
        }),
      ],
    });
    expect(b.allocatedMinor).toBe(0);
    expect(b.remainingMinor).toBe(EXPECTED_UNPAID);
    // Both rows still counted: the record of the collection is preserved.
    expect(b.countedAllocationIds).toHaveLength(2);
  });

  it("a partially refunded payment counts at its net amount", async () => {
    const intent = "pi_partial";
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [
        alloc({
          paymentIntentId: intent,
          component: "deposit",
          amountMinor: 5000,
        }),
        alloc({
          paymentIntentId: intent,
          component: "refund_adjustment",
          amountMinor: -2000,
        }),
      ],
    });
    expect(b.allocatedMinor).toBe(3000);
    expect(b.remainingMinor).toBe(27000);
  });

  it("a DISPUTE_LOST payment does not count, and a DISPUTE_WON one does", async () => {
    // POSITIVE CONTROL for the four rules above, in the pair where getting it
    // backwards is most plausible: a won dispute is money the artist keeps.
    const lost = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ amountMinor: 5000, status: "dispute_lost" })],
    });
    expect(lost.allocatedMinor).toBe(0);

    const won = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ amountMinor: 5000, status: "dispute_won" })],
    });
    expect(won.allocatedMinor).toBe(5000);
    expect(won.remainingMinor).toBe(25000);
  });

  it("a PROCESSING payment does not count until it settles", async () => {
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ amountMinor: 5000, status: "processing" })],
    });
    expect(b.allocatedMinor).toBe(0);
  });

  it("a SUCCEEDED payment counts, which is what makes the seven refusals above meaningful", async () => {
    // The overall positive control for this block. Without it, a filter that
    // rejected every status would satisfy all of them.
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ amountMinor: 5000, status: "succeeded" })],
    });
    expect(b.allocatedMinor).toBe(5000);
  });

  it("a payment allocated to a DIFFERENT appointment does not count", async () => {
    // Spec section 8's "cross-appointment deposit application", at the
    // arithmetic layer. The database makes the row unrepresentable; this makes
    // sure the reader would not have counted it even if one existed.
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ bookingId: "bk-OTHER", amountMinor: 5000 })],
    });
    expect(b.allocatedMinor).toBe(0);
    expect(b.ignoredAllocationIds).toEqual(["al-" + seq]);
  });

  it("a payment in a DIFFERENT currency does not count", async () => {
    // Summing 5000 usd into a eur balance under-collects by whatever the rate
    // happens to be, and nothing downstream would report it as an error.
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ currency: "usd", amountMinor: 5000 })],
    });
    expect(b.allocatedMinor).toBe(0);
    expect(b.remainingMinor).toBe(30000);
  });

  it("counts a payment that has no payment request at all", async () => {
    // The deposit taken through the existing booking path (migrations 0006,
    // 0007, 0044) has no payment request, and it must still count. This is what
    // keeps deposit-then-balance from needing a special case.
    //
    // FALSIFIES IF: anything starts requiring `requestId` to be non-null.
    const b = balance({
      finalServicePriceMinor: 30000,
      allocations: [alloc({ requestId: null, amountMinor: 5000 })],
    });
    expect(b.allocatedMinor).toBe(5000);
  });
});

describe("spec section 4: extras, discounts and manual review", () => {
  it("adds eligible extras and subtracts discounts as a positive magnitude", async () => {
    const b = balance({
      finalServicePriceMinor: 30000,
      extras: [
        {
          classification: "additional_service",
          amountMinor: 4000,
          currency: "eur",
        },
        {
          classification: "physical_goods",
          amountMinor: 2500,
          currency: "eur",
        },
        { classification: "discount", amountMinor: -1500, currency: "eur" },
      ],
    });
    expect(b.extrasMinor).toBe(6500);
    expect(b.discountMinor).toBe(1500);
    expect(b.grossMinor).toBe(35000);
    expect(b.remainingMinor).toBe(35000);
  });

  it("flags a manual_review line rather than guessing its lane", async () => {
    // Spec section 6 excludes different things from each fee base, so guessing
    // a lane here becomes a wrong fee later. The amount is still carried.
    const b = balance({
      finalServicePriceMinor: 30000,
      extras: [
        { classification: "manual_review", amountMinor: 1000, currency: "eur" },
      ],
    });
    expect(b.requiresManualReview).toBe(true);
    expect(b.grossMinor).toBe(31000);
  });

  it("drops tattoo_service lines when deriving extras, so the price is not double counted", async () => {
    // The service price is passed separately and confirmed by the artist.
    // Summing both would double-count it; picking one silently would be
    // inferring the final price, which spec section 4 forbids.
    const extras = balanceExtrasFromLines([
      {
        classification: "tattoo_service",
        lineTotalMinor: 30000,
        currency: "eur",
      },
      { classification: "tip", lineTotalMinor: 2000, currency: "eur" },
      { classification: "discount", lineTotalMinor: -500, currency: "eur" },
    ]);
    expect(extras).toEqual([
      { classification: "tip", amountMinor: 2000, currency: "eur" },
      { classification: "discount", amountMinor: -500, currency: "eur" },
    ]);
  });
});

// ===========================================================================

describe("lifecycle: no state strands a money event Stripe can still emit", () => {
  it("nothing is terminal, derived from the table rather than restated", async () => {
    // Derived, so a state cannot be terminal in one place and non-terminal in
    // the other. Empty is the ANSWER here: Stripe emits `charge.refunded` and
    // `charge.dispute.created` months later and does not read our lifecycle,
    // and the status alone cannot say whether money was collected (that fact
    // lives in `payment_allocations`).
    expect([...TERMINAL_PAYMENT_REQUEST_STATUSES]).toEqual([]);
    for (const status of PAYMENT_REQUEST_STATUSES) {
      expect(isTerminalPaymentRequestStatus(status), status).toBe(false);
    }
  });

  it.each(["cancelled", "expired", "failed"] as const)(
    "%s can still record a later refund or dispute",
    async (from) => {
      // The hole this closes: `partially_paid -> cancelled` is legal, and
      // `cancelled` was a dead end, so a request that had COLLECTED money could
      // be parked where a real later refund or dispute was unrepresentable.
      // `expired` and `failed` are reachable from `partially_paid` too.
      expect(canTransitionPaymentRequest(from, "disputed").ok).toBe(true);
      expect(canTransitionPaymentRequest(from, "refunded").ok).toBe(true);
      expect(canTransitionPaymentRequest(from, "partially_refunded").ok).toBe(
        true,
      );
    },
  );

  it("refunded can still record a dispute filed on the refunded charge", async () => {
    // `refunded -> disputed` was refused while `paid -> disputed` and
    // `partially_paid -> disputed` were allowed, which is the same Stripe event
    // arriving one state later. Only `disputed`: refund totals converge upward
    // (the cumulative `amount_refunded` rule), so nothing walks back from fully
    // refunded to partially refunded.
    expect(canTransitionPaymentRequest("refunded", "disputed").ok).toBe(true);
    expect(
      canTransitionPaymentRequest("refunded", "partially_refunded").ok,
    ).toBe(false);
  });

  it.each(["cancelled", "refunded"] as const)(
    "%s still refuses every move that would make it payable again",
    async (from) => {
      // POSITIVE CONTROL for the edges added above: admitting the money events
      // must not resurrect a withdrawn or settled request. Spec section 8,
      // "payment after cancellation" and "payment after a full refund".
      for (const to of [
        "draft",
        "ready",
        "sent",
        "viewed",
        "payment_processing",
        "paid",
        "partially_paid",
      ] as const) {
        const result = canTransitionPaymentRequest(from, to);
        expect(result.ok, `${from} -> ${to} must be refused`).toBe(false);
      }
    },
  );

  it("none of the money-reversal targets is artist-writable or payable", async () => {
    // What keeps the wider table from being a widening of ARTIST authority:
    // only A4 on the service role can perform these moves, and none of them can
    // produce a second payable request for one subject.
    for (const to of ["partially_refunded", "refunded", "disputed"] as const) {
      expect(
        (
          ARTIST_WRITABLE_PAYMENT_REQUEST_STATUSES as readonly string[]
        ).includes(to),
        to,
      ).toBe(false);
      expect(isPayablePaymentRequestStatus(to), to).toBe(false);
    }
  });

  it("disputed is deliberately NOT terminal", async () => {
    // A dispute resolves in either direction. Modelling it as an end state
    // would strand won disputes.
    expect(isTerminalPaymentRequestStatus("disputed")).toBe(false);
    expect(canTransitionPaymentRequest("disputed", "paid").ok).toBe(true);
    expect(canTransitionPaymentRequest("disputed", "refunded").ok).toBe(true);
  });

  it("failed is not terminal either", async () => {
    // A failed attempt on a still-valid link is followed by another attempt.
    expect(isTerminalPaymentRequestStatus("failed")).toBe(false);
    expect(canTransitionPaymentRequest("failed", "payment_processing").ok).toBe(
      true,
    );
  });
});

describe("lifecycle: the transition matrix is pinned", () => {
  // A mirror of PAYMENT_REQUEST_TRANSITIONS, kept here on purpose: it IS the
  // assertion. Same shape as booking-fsm.test.ts. If the source matrix changes,
  // this must change in lockstep, which is the safety we want. One test per
  // `from` state so a break names the row it happened in.
  const EXPECTED: Record<PaymentRequestStatus, PaymentRequestStatus[]> = {
    draft: ["ready", "cancelled"],
    ready: ["draft", "sent", "cancelled"],
    sent: ["viewed", "payment_processing", "expired", "cancelled", "failed"],
    viewed: ["payment_processing", "expired", "cancelled", "failed"],
    payment_processing: [
      "paid",
      "partially_paid",
      "failed",
      "cancelled",
      "disputed",
      "partially_refunded",
      "refunded",
    ],
    partially_paid: [
      "payment_processing",
      "paid",
      "partially_refunded",
      "refunded",
      "expired",
      "cancelled",
      "disputed",
    ],
    paid: ["partially_refunded", "refunded", "disputed"],
    expired: ["cancelled", "partially_refunded", "refunded", "disputed"],
    failed: [
      "payment_processing",
      "expired",
      "cancelled",
      "partially_refunded",
      "refunded",
      "disputed",
    ],
    disputed: ["paid", "partially_paid", "partially_refunded", "refunded"],
    partially_refunded: ["refunded", "disputed"],
    cancelled: ["partially_refunded", "refunded", "disputed"],
    refunded: ["disputed"],
  };

  it.each(PAYMENT_REQUEST_STATUSES)(
    "%s allows exactly the expected targets and refuses the rest",
    async (from) => {
      const allowed = PAYMENT_REQUEST_STATUSES.filter(
        (to) => canTransitionPaymentRequest(from, to).ok,
      );
      expect([...allowed].sort()).toEqual([...EXPECTED[from]].sort());
      expect([...PAYMENT_REQUEST_TRANSITIONS[from]].sort()).toEqual(
        [...EXPECTED[from]].sort(),
      );
    },
  );

  it("refuses a no-op move with its own reason", async () => {
    // Almost always a caller that lost track of state rather than an intent.
    const result = canTransitionPaymentRequest("sent", "sent");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("already");
  });

  it("refuses an unknown status rather than treating it as terminal", async () => {
    // The failure mode this avoids: an unrecognised value silently reading as
    // "no transitions allowed", which is indistinguishable from terminal.
    const result = canTransitionPaymentRequest("nonsense", "paid");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("unknown status");
    expect(isTerminalPaymentRequestStatus("nonsense")).toBe(false);
  });

  it("refuses payment after cancellation and after a full refund", async () => {
    // Two of spec section 8's named failure modes, stated as their own test so
    // the intent survives a future edit to the matrix.
    expect(
      canTransitionPaymentRequest("cancelled", "payment_processing").ok,
    ).toBe(false);
    expect(
      canTransitionPaymentRequest("refunded", "payment_processing").ok,
    ).toBe(false);
  });
});

describe("lifecycle: the sets the database mirrors", () => {
  it("the payable set matches the partial unique indexes in 0125", async () => {
    // COUPLED PAIR. This same set is the predicate of
    // `payment_requests_one_payable_per_booking_idx` and its project twin. If
    // they diverge, either the database refuses a send the product believes is
    // legal, or two payable requests exist for one appointment.
    expect([...PAYABLE_PAYMENT_REQUEST_STATUSES]).toEqual([
      "sent",
      "viewed",
      "payment_processing",
      "partially_paid",
    ]);
    expect(isPayablePaymentRequestStatus("sent")).toBe(true);
    expect(isPayablePaymentRequestStatus("draft")).toBe(false);
    expect(isPayablePaymentRequestStatus("paid")).toBe(false);
  });

  it("the artist-writable set excludes every money state", async () => {
    // COUPLED PAIR with the WITH CHECK list on 0125's UPDATE policy. The DB
    // suite proves the policy refuses them; this proves a core would refuse
    // before the round trip, and that the two lists say the same thing.
    expect([...ARTIST_WRITABLE_PAYMENT_REQUEST_STATUSES]).toEqual([
      "draft",
      "ready",
      "sent",
      "viewed",
      "cancelled",
      "expired",
    ]);
    for (const money of [
      "paid",
      "partially_paid",
      "partially_refunded",
      "refunded",
      "disputed",
      "payment_processing",
      "failed",
    ]) {
      expect(
        (
          ARTIST_WRITABLE_PAYMENT_REQUEST_STATUSES as readonly string[]
        ).includes(money),
        `${money} must not be artist-writable`,
      ).toBe(false);
    }
  });

  it("a request is frozen once sent, and by status even if sent_at were lost", async () => {
    // Two conditions rather than one: the latch is the real rule, and the
    // status test is what stops a row that somehow lost its `sent_at` from
    // reading as editable.
    expect(isFrozenPaymentRequest({ status: "draft", sentAt: null })).toBe(
      false,
    );
    expect(isFrozenPaymentRequest({ status: "ready", sentAt: null })).toBe(
      false,
    );
    expect(
      isFrozenPaymentRequest({
        status: "draft",
        sentAt: "2026-07-29T10:00:00Z",
      }),
    ).toBe(true);
    expect(isFrozenPaymentRequest({ status: "paid", sentAt: null })).toBe(true);
  });
});

// ===========================================================================

describe("spec section 7: allocation components sum to the collected amount", () => {
  it("accepts a mixed allocation whose gross components sum exactly", async () => {
    // A 15000 collection covering a 10000 tattoo balance, 3000 of goods and a
    // 2000 tip is THREE rows, never one row of 15000. Storing a single number
    // forecloses refunds, per-lane fees, tax reporting, receipts,
    // reconciliation and dispute evidence, and no later migration recovers it.
    const result = checkAllocation({
      collectedMinor: 15000,
      currency: "eur",
      components: [
        {
          component: "tattoo_service_balance",
          amountMinor: 10000,
          currency: "eur",
        },
        { component: "physical_goods", amountMinor: 3000, currency: "eur" },
        { component: "tip", amountMinor: 2000, currency: "eur" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.grossAllocatedMinor).toBe(15000);
    expect(result.differenceMinor).toBe(0);
    expect(result.netAllocatedMinor).toBe(15000);
  });

  it("catches an allocation that is short by one minor unit", async () => {
    // FALSIFIES IF: the equality check becomes a tolerance, or `unbalanced`
    // stops being reported. One minor unit is deliberate: a rounding-tolerant
    // check would pass this and is exactly what must not exist on a money path.
    const result = checkAllocation({
      collectedMinor: 15000,
      currency: "eur",
      components: [
        {
          component: "tattoo_service_balance",
          amountMinor: 10000,
          currency: "eur",
        },
        { component: "physical_goods", amountMinor: 4999, currency: "eur" },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("unbalanced");
    expect(result.differenceMinor).toBe(-1);
  });

  it("catches an allocation that is over by one minor unit", async () => {
    const result = checkAllocation({
      collectedMinor: 15000,
      currency: "eur",
      components: [
        {
          component: "tattoo_service_balance",
          amountMinor: 15001,
          currency: "eur",
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("unbalanced");
    expect(result.differenceMinor).toBe(1);
  });

  it("rejects a collection with no components at all", async () => {
    // The "one unclassified total" failure wearing a different shape: zero
    // components sums to zero, so a zero collection would otherwise look
    // balanced.
    const result = checkAllocation({
      collectedMinor: 0,
      currency: "eur",
      components: [],
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("empty");
  });

  it("a refund adjustment moves the net without disturbing the gross", async () => {
    // Spec section 9: the original transaction is preserved. The GROSS
    // components are what must equal the collected amount, and that never
    // changes; the refund moves the NET.
    //
    // FALSIFIES IF: refund adjustments are added into `grossAllocatedMinor`,
    // which would report every refunded payment as unbalanced.
    const result = checkAllocation({
      collectedMinor: 15000,
      currency: "eur",
      components: [
        {
          component: "tattoo_service_balance",
          amountMinor: 15000,
          currency: "eur",
        },
        { component: "refund_adjustment", amountMinor: -5000, currency: "eur" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.grossAllocatedMinor).toBe(15000);
    expect(result.refundAdjustmentMinor).toBe(-5000);
    expect(result.netAllocatedMinor).toBe(10000);
  });

  it("catches a component carrying a sign its classification does not allow", async () => {
    const negativeTip = checkAllocation({
      collectedMinor: 0,
      currency: "eur",
      components: [{ component: "tip", amountMinor: -2000, currency: "eur" }],
    });
    expect(negativeTip.problems).toContain("sign");

    const positiveRefund = checkAllocation({
      collectedMinor: 15000,
      currency: "eur",
      components: [
        {
          component: "tattoo_service_balance",
          amountMinor: 15000,
          currency: "eur",
        },
        { component: "refund_adjustment", amountMinor: 5000, currency: "eur" },
      ],
    });
    expect(positiveRefund.problems).toContain("sign");
  });

  it("catches two components sharing a (component, line) pair", async () => {
    // Mirrors `unique nulls not distinct (payment_intent_id, component,
    // line_id)`. NULLS NOT DISTINCT is what makes two request-wide tips a
    // collision rather than two storable rows, and this reproduces that: both
    // components below have a null line id.
    //
    // FALSIFIES IF: the key stops folding a null line id into one value.
    const result = checkAllocation({
      collectedMinor: 4000,
      currency: "eur",
      components: [
        { component: "tip", amountMinor: 2000, currency: "eur" },
        { component: "tip", amountMinor: 2000, currency: "eur" },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("duplicate_component");
  });

  it("allows the same component on two DIFFERENT lines", async () => {
    // POSITIVE CONTROL for the duplicate rule: per-line refunds depend on this
    // being legal, so a check that rejected every repeated component would
    // break single-line refunds while passing the test above.
    const result = checkAllocation({
      collectedMinor: 4000,
      currency: "eur",
      components: [
        {
          component: "physical_goods",
          amountMinor: 2000,
          currency: "eur",
          lineId: "ln-1",
        },
        {
          component: "physical_goods",
          amountMinor: 2000,
          currency: "eur",
          lineId: "ln-2",
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("catches a component denominated differently from the collection", async () => {
    const result = checkAllocation({
      collectedMinor: 15000,
      currency: "eur",
      components: [
        {
          component: "tattoo_service_balance",
          amountMinor: 15000,
          currency: "usd",
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("currency_mismatch");
  });

  it("reports every distinct problem at once rather than the first", async () => {
    // A caller fixing one problem at a time against a webhook payload is how a
    // partially-written allocation set survives a deploy.
    const result = checkAllocation({
      collectedMinor: 15000,
      currency: "eur",
      components: [
        { component: "tip", amountMinor: -1, currency: "usd" },
        { component: "tip", amountMinor: -1, currency: "usd" },
      ],
    });
    expect([...result.problems].sort()).toEqual([
      "currency_mismatch",
      "duplicate_component",
      "sign",
      "unbalanced",
    ]);
  });
});

describe("integer discipline: minor units only, never a float", () => {
  it("throws on a non-integer amount rather than rounding it", async () => {
    // Every amount is an `integer` column by schema and Stripe takes integer
    // minor units, so a float reaching here means a wrong charge is already
    // being computed upstream. Rounding would hide it; the money-path rules
    // require a failure to be an error rather than a quiet degradation.
    expect(() => assertIntegerMinor(10.5, "amount")).toThrow(TypeError);
    expect(() => assertIntegerMinor(Number.NaN, "amount")).toThrow();
    expect(() =>
      assertIntegerMinor(Number.POSITIVE_INFINITY, "amount"),
    ).toThrow();
    expect(assertIntegerMinor(-5000, "amount")).toBe(-5000);
  });

  it("throws when a float reaches the balance computation", async () => {
    expect(() =>
      balance({
        finalServicePriceMinor: 30000,
        extras: [
          { classification: "tip", amountMinor: 12.34, currency: "eur" },
        ],
      }),
    ).toThrow(/integer number of minor units/);
  });

  it("computes a line total exactly, with no rounding to argue about", async () => {
    expect(lineTotalMinor({ unitAmountMinor: 3333, quantity: 3 })).toBe(9999);
    expect(
      requestTotalMinor([{ lineTotalMinor: 9999 }, { lineTotalMinor: 1 }]),
    ).toBe(10000);
    expect(requestTotalMinor([])).toBe(0);
  });

  it("throws on a product that is not exactly representable, not only on its operands", async () => {
    // FALSIFIES IF: `lineTotalMinor` returns `unit * quantity` without passing
    // the PRODUCT through `assertIntegerMinor`. Both operands are inside int4,
    // so the schema forbids neither input and every per-operand check passes.
    // Recorded RED, against the version that asserted only the operands:
    // `lineTotalMinor({ unitAmountMinor: 2e9, quantity: 2e9 })` returned
    // 4000000000000000000 with no throw. That number is not the product; it is
    // the nearest double, so anything downstream would be charging a fiction.
    expect(() =>
      lineTotalMinor({
        unitAmountMinor: 2_000_000_000,
        quantity: 2_000_000_000,
      }),
    ).toThrow(TypeError);
    expect(() =>
      lineTotalMinor({
        unitAmountMinor: 2_000_000_000,
        quantity: 2_000_000_000,
      }),
    ).toThrow(/lineTotalMinor must be an integer number of minor units/);

    // POSITIVE CONTROL. Without it, a `lineTotalMinor` that threw on every
    // multiplication would satisfy the assertion above.
    expect(lineTotalMinor({ unitAmountMinor: 3333, quantity: 3 })).toBe(9999);
  });

  it("leaves an EXACT but unstorable product as a refusal rather than a throw", async () => {
    // The deliberate split, pinned so nobody "tidies" it into a single rule.
    // 100000 x 1000000 = 1e11 is an exact integer: the value is RIGHT and the
    // int4 column simply cannot hold it, which is artist-fixable input. The A2
    // core answers that with a sentence, and it can only do so if this function
    // returns rather than throws. Recorded RED against the stricter version:
    // the A2 test "refuses a quantity that carries the line total above the
    // integer column" failed with an uncaught RangeError out of validateLines.
    expect(
      lineTotalMinor({ unitAmountMinor: 100_000, quantity: 1_000_000 }),
    ).toBe(100_000_000_000);

    // The bound itself is named once, in the model, so A3/A4/mobile apply the
    // same one instead of re-deriving it from the column type.
    expect(isStorableMinor(100_000_000_000)).toBe(false);
    expect(isStorableMinor(MAX_STORABLE_MINOR)).toBe(true);
    expect(isStorableMinor(MIN_STORABLE_MINOR)).toBe(true);
    expect(isStorableMinor(MAX_STORABLE_MINOR + 1)).toBe(false);
  });
});

// ===========================================================================

describe("the line sign rule, mirroring payment_request_lines_sign_check", () => {
  // WHY THIS BLOCK EXISTS. The database constraint only holds for an amount on
  // its way INTO a row. `outstandingBalance` computes from amounts a CALLER
  // passes in, so a wrong-signed extra is arithmetic here before any row is
  // written, and it moves the collectible ceiling in the dangerous direction.

  it("a positive discount is refused, because it RAISED the collectible ceiling", async () => {
    // FALSIFIES IF: `assertPaymentLineSign` is removed from the per-extra loop
    // in `outstandingBalance`.
    //
    // Recorded RED, against the version with no sign check:
    //   discount +2000 against a 30000 price -> grossMinor 32000
    //   checkCollectable(b, 32000) -> { ok: true, amountMinor: 32000 }
    // A "discount" that approved collecting 32000 against a 30000 debt.
    expect(() =>
      balance({
        finalServicePriceMinor: 30000,
        extras: [
          { classification: "discount", amountMinor: 2000, currency: "eur" },
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      balance({
        finalServicePriceMinor: 30000,
        extras: [
          { classification: "discount", amountMinor: 2000, currency: "eur" },
        ],
      }),
    ).toThrow(/discount line must be negative or zero, received 2000/);
  });

  it("a negative tip is refused, the same defect facing the other way", async () => {
    // Recorded RED: tip -5000 against a 30000 price -> grossMinor 25000, a
    // silent price reduction reading to the client as a tip.
    expect(() =>
      balance({
        finalServicePriceMinor: 30000,
        extras: [
          { classification: "tip", amountMinor: -5000, currency: "eur" },
        ],
      }),
    ).toThrow(/tip line must be positive or zero, received -5000/);
  });

  it("correctly signed extras still compute, so the rule is not just a wall", async () => {
    // POSITIVE CONTROL for the whole block. Without it, an
    // `assertPaymentLineSign` that threw on everything would pass every test
    // above, and the balance would be uncomputable.
    const b = balance({
      finalServicePriceMinor: 30000,
      extras: [
        { classification: "discount", amountMinor: -2000, currency: "eur" },
        { classification: "tip", amountMinor: 5000, currency: "eur" },
      ],
    });
    expect(b.grossMinor).toBe(33000);
    expect(b.maxCollectibleMinor).toBe(33000);
  });

  it.each(PAYMENT_LINE_CLASSIFICATIONS)(
    "pins the permitted sign for a %s line",
    async (classification) => {
      // One case per classification, driven off the exported vocabulary, so a
      // classification added in A3 lands here with no test edit and fails until
      // somebody decides which side of the rule it is on.
      const mustBeNegative =
        NEGATIVE_PAYMENT_LINE_CLASSIFICATIONS.includes(classification);

      // Zero is legal on BOTH sides: the constraint is `<= 0` / `>= 0`.
      expect(assertPaymentLineSign(classification, 0, "amountMinor")).toBe(0);

      const legal = mustBeNegative ? -2000 : 2000;
      const illegal = mustBeNegative ? 2000 : -2000;
      expect(assertPaymentLineSign(classification, legal, "amountMinor")).toBe(
        legal,
      );
      expect(() =>
        assertPaymentLineSign(classification, illegal, "amountMinor"),
      ).toThrow(RangeError);
    },
  );

  it("only `discount` may be negative, matching the constraint's CASE exactly", async () => {
    // The mirror assertion. 0125's check is
    //   case when classification = 'discount' then line_total_minor <= 0
    //        else line_total_minor >= 0 end
    // so this list having a second member means the two encodings disagree and
    // a row the model accepts would be refused by the column.
    expect([...NEGATIVE_PAYMENT_LINE_CLASSIFICATIONS]).toEqual(["discount"]);
  });

  it("refuses a wrong-signed line when extras are DERIVED from stored lines", async () => {
    // The second entry point into the same arithmetic. `balanceExtrasFromLines`
    // reads rows, and a row written before the constraint existed (or by a
    // future path that bypasses it) must not become a silent ceiling change.
    expect(() =>
      balanceExtrasFromLines([
        { classification: "discount", lineTotalMinor: 500, currency: "eur" },
      ]),
    ).toThrow(/discount line must be negative or zero, received 500/);

    // POSITIVE CONTROL on the same call.
    expect(
      balanceExtrasFromLines([
        { classification: "discount", lineTotalMinor: -500, currency: "eur" },
        { classification: "tip", lineTotalMinor: 2000, currency: "eur" },
      ]),
    ).toEqual([
      { classification: "discount", amountMinor: -500, currency: "eur" },
      { classification: "tip", amountMinor: 2000, currency: "eur" },
    ]);
  });
});
