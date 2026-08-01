import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockServiceClient, mockWriteAudit, mockStripe } = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
  mockWriteAudit: vi.fn(),
  mockStripe: {
    paymentIntents: { retrieve: vi.fn() },
    refunds: { create: vi.fn() },
    applicationFees: { createRefund: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: mockServiceClient,
}));
vi.mock("@/lib/audit", () => ({
  writeAudit: (...a: unknown[]) => mockWriteAudit(...a),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: mockStripe,
}));

import { refundPaymentRequestCore } from "@/lib/server/appointment-payment-refund";
import {
  FEE_REFUND_POLICY_V1,
  FEE_REFUND_POLICY_V0,
} from "@inklee/shared/fee-refund-policy";

type Reply = { data?: unknown; error?: unknown };
type QueuedReplies = Record<string, Reply[]>;

let replies: QueuedReplies = {};

function queue(key: string, ...rs: Reply[]) {
  replies[key] = [...(replies[key] ?? []), ...rs];
}

function nextReply(key: string): Reply {
  const q = replies[key];
  if (q && q.length > 0) return q.shift() as Reply;
  return { data: null, error: null };
}

type RecordedOp = {
  table: string;
  verb: string;
  payload: unknown;
  filters: Record<string, unknown>;
};

let ops: RecordedOp[] = [];

function makeChain(op: RecordedOp) {
  const key = `${op.table}:${op.verb}`;
  const self = {
    select: () => self,
    eq: (column: string, value: unknown) => {
      op.filters[column] = value;
      return self;
    },
    neq: (column: string, value: unknown) => {
      op.filters[`neq:${column}`] = value;
      return self;
    },
    maybeSingle: () => Promise.resolve(nextReply(key)),
    then: (
      onFulfilled?: (value: Reply) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(nextReply(key)).then(onFulfilled, onRejected),
  };
  return self;
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  replies = {};
  mockServiceClient.from.mockImplementation((table: string) => ({
    select: () => {
      const op: RecordedOp = {
        table,
        verb: "select",
        payload: null,
        filters: {},
      };
      ops.push(op);
      return makeChain(op);
    },
    update: (payload: unknown) => {
      const op: RecordedOp = {
        table,
        verb: "update",
        payload,
        filters: {},
      };
      ops.push(op);
      return makeChain(op);
    },
  }));
  mockStripe.paymentIntents.retrieve.mockResolvedValue({
    id: "pi_test",
    amount: 15000,
    metadata: { application_fee_minor: "450" },
    // Expanded latest_charge so the core can resolve the application-fee id it
    // needs to issue a PARTIAL fee refund (return the margin, retain the cost).
    latest_charge: { id: "ch_test", application_fee: "fee_test" },
  });
  mockStripe.refunds.create.mockResolvedValue({
    id: "re_test_123",
    amount: 15000,
    status: "succeeded",
  });
  mockStripe.applicationFees.createRefund.mockResolvedValue({
    id: "fr_test_1",
    amount: 0,
  });
});

// A stamped v1 collection with a PROVEN processor cost. The core reads the
// policy version from this stored stamp (never from client input), so these
// tests exercise the v1 path through the REAL core without touching the active
// version.
function queueCollection(over: Record<string, unknown> = {}) {
  queue("payment_collections:select", {
    data: {
      processor_cost_minor: 200,
      processor_cost_status: "captured",
      fee_refund_policy_version: FEE_REFUND_POLICY_V1.version,
      processor_cost_retained_minor: 0,
      application_fee_minor: 450,
      ...over,
    },
  });
}

function lastRefundCall() {
  return mockStripe.refunds.create.mock.calls.at(-1)?.[0] as Record<
    string,
    unknown
  >;
}

function collectionUpdate() {
  return ops.find(
    (o) => o.table === "payment_collections" && o.verb === "update",
  );
}

const REQUEST_ROW = {
  id: "req_1",
  artist_id: "artist_1",
  booking_id: "booking_1",
  project_id: null,
  status: "paid",
  payment_intent_id: "pi_test",
  revision: 1,
};

const ALLOCATIONS = [
  {
    id: "a1",
    line_id: "l1",
    component: "full_price",
    amount_minor: 10000,
    currency: "eur",
    collected_total_minor: 15000,
  },
  {
    id: "a2",
    line_id: "l2",
    component: "additional_service",
    amount_minor: 3000,
    currency: "eur",
    collected_total_minor: 15000,
  },
  {
    id: "a3",
    line_id: "l3",
    component: "physical_goods",
    amount_minor: 2000,
    currency: "eur",
    collected_total_minor: 15000,
  },
];

function setupStandardRefund() {
  queue("payment_requests:select", { data: REQUEST_ROW });
  queue("payment_allocations:select", { data: ALLOCATIONS });
  queue("payment_allocations:select", { data: [] }); // existing adjustments
}

describe("refundPaymentRequestCore", () => {
  it("creates a full refund with reverse_transfer and fee refund", async () => {
    setupStandardRefund();

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "voluntary_full",
    });

    expect(result).toEqual({
      status: "ok",
      refundId: "re_test_123",
      refundedMinor: 15000,
    });

    expect(mockStripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: "pi_test",
        amount: 15000,
        reverse_transfer: true,
        refund_application_fee: true,
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "appointment_payment_refund_initiated",
        details: expect.objectContaining({
          refund_type: "full",
          amount_minor: 15000,
          fee_treatment: "return_full",
        }),
      }),
    );
  });

  it("creates a partial refund for the specified amount", async () => {
    setupStandardRefund();

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "partial",
      amountMinor: 5000,
      case: "voluntary_partial",
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.refundedMinor).toBe(5000);
    }

    expect(mockStripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        refund_application_fee: true,
      }),
      expect.any(Object),
    );
  });

  it("refunds specific line items by line_id", async () => {
    setupStandardRefund();

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "by_line",
      lineIds: ["l2", "l3"],
      case: "voluntary_full",
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.refundedMinor).toBe(5000); // 3000 + 2000
    }
  });

  it("refuses refund when request is not in a refundable status", async () => {
    queue("payment_requests:select", {
      data: { ...REQUEST_ROW, status: "draft" },
    });

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "voluntary_full",
    });

    expect(result).toEqual({
      status: "error",
      message: 'Cannot refund a request in status "draft".',
    });
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("refuses when partial amount exceeds refundable balance", async () => {
    setupStandardRefund();

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "partial",
      amountMinor: 20000,
      case: "voluntary_partial",
    });

    expect(result.status).toBe("error");
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("subtracts already-refunded amount from refundable balance", async () => {
    queue("payment_requests:select", {
      data: { ...REQUEST_ROW, status: "partially_refunded" },
    });
    queue("payment_allocations:select", { data: ALLOCATIONS });
    queue("payment_allocations:select", {
      data: [{ amount_minor: -5000 }],
    });

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "voluntary_full",
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.refundedMinor).toBe(10000); // 15000 - 5000
    }
  });

  it("retains the fee on artist_cancellation (v0 returns full, but treatment is return_full)", async () => {
    setupStandardRefund();

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "artist_cancellation",
    });

    expect(result.status).toBe("ok");
    // v0 returns full for artist_cancellation
    expect(mockStripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({
        refund_application_fee: true,
      }),
      expect.any(Object),
    );
  });

  it("does not refund the fee on dispute cases", async () => {
    setupStandardRefund();

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "dispute",
    });

    expect(result.status).toBe("ok");
    expect(mockStripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({
        refund_application_fee: false,
      }),
      expect.any(Object),
    );
  });

  it("returns error when request not found", async () => {
    queue("payment_requests:select", { data: null });

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_999",
      refundType: "full",
      case: "voluntary_full",
    });

    expect(result.status).toBe("error");
  });

  it("returns error when no matching line allocations for by_line", async () => {
    queue("payment_requests:select", { data: REQUEST_ROW });
    queue("payment_allocations:select", { data: ALLOCATIONS });
    queue("payment_allocations:select", { data: [] });

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "by_line",
      lineIds: ["nonexistent"],
      case: "voluntary_full",
    });

    expect(result.status).toBe("error");
  });
});

// PAY-RFD-002 remediation, exercised through the REAL refund core. The policy
// version is read from the stored collection stamp (never from input), so these
// prove the v1 path end to end without touching ACTIVE_FEE_REFUND_POLICY_VERSION.
// The invariant every test defends: Inklee never retains the whole application
// fee as a stand-in for a processor cost it cannot prove.
describe("refundPaymentRequestCore v1 non-recoverable cost retention", () => {
  it("v1 artist_cancellation retains ONLY the proven Stripe cost and returns the margin", async () => {
    setupStandardRefund();
    queueCollection(); // v1, cost 200, fee 450, retained 0

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "artist_cancellation",
    });

    expect(result.status).toBe("ok");
    const call = lastRefundCall();
    // NOT the whole-fee auto-return: the margin is returned via a partial
    // application-fee refund, and only the 200 cost is kept.
    expect(call.refund_application_fee).toBe(false);
    expect(call.reverse_transfer).toBe(true);
    expect(mockStripe.applicationFees.createRefund).toHaveBeenCalledWith(
      "fee_test",
      { amount: 250 }, // fee 450 - cost 200 = margin returned
      expect.any(Object),
    );
    // The retained cost is recorded so a later refund cannot keep it again.
    expect(collectionUpdate()?.payload).toEqual({
      processor_cost_retained_minor: 200,
    });
  });

  it("v1 retains nothing when the proven cost is zero", async () => {
    setupStandardRefund();
    queueCollection({ processor_cost_minor: 0 });

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "artist_cancellation",
    });

    expect(result.status).toBe("ok");
    expect(lastRefundCall().refund_application_fee).toBe(true); // full fee back
    expect(mockStripe.applicationFees.createRefund).not.toHaveBeenCalled();
    expect(collectionUpdate()).toBeUndefined();
  });

  it("v1 caps retention at the fee when the cost meets or exceeds it", async () => {
    setupStandardRefund();
    queueCollection({ processor_cost_minor: 900 }); // exceeds the 450 fee

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "artist_cancellation",
    });

    expect(result.status).toBe("ok");
    // Whole fee retained, but ONLY because the real cost justifies it, and never
    // more than the fee (retained 450, not 900).
    expect(lastRefundCall().refund_application_fee).toBe(false);
    expect(mockStripe.applicationFees.createRefund).not.toHaveBeenCalled();
    expect(collectionUpdate()?.payload).toEqual({
      processor_cost_retained_minor: 450,
    });
  });

  it("v1 allocates retained cost proportionally on a partial refund", async () => {
    setupStandardRefund();
    queueCollection(); // cost 200, fee 450

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "partial",
      amountMinor: 7500, // half of the 15000 payment
      case: "artist_cancellation",
    });

    expect(result.status).toBe("ok");
    expect(lastRefundCall().amount).toBe(7500);
    expect(lastRefundCall().refund_application_fee).toBe(false);
    // feeShare 225; cost share 100; return 125, retain 100.
    expect(mockStripe.applicationFees.createRefund).toHaveBeenCalledWith(
      "fee_test",
      { amount: 125 },
      expect.any(Object),
    );
    expect(collectionUpdate()?.payload).toEqual({
      processor_cost_retained_minor: 100,
    });
  });

  it("v1 does not retain the same cost twice across repeated refunds", async () => {
    setupStandardRefund();
    queueCollection({ processor_cost_retained_minor: 200 }); // cost already retained

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "artist_cancellation",
    });

    expect(result.status).toBe("ok");
    // Nothing left to retain -> the whole fee is returned, not kept again.
    expect(lastRefundCall().refund_application_fee).toBe(true);
    expect(mockStripe.applicationFees.createRefund).not.toHaveBeenCalled();
    expect(collectionUpdate()).toBeUndefined();
  });

  it("v1 FAILS SAFE when the processor cost is unavailable: returns the full fee, never retains it", async () => {
    setupStandardRefund();
    queue("payment_collections:select", {
      data: {
        processor_cost_minor: null,
        processor_cost_status: "pending", // not captured -> cost unproven
        fee_refund_policy_version: FEE_REFUND_POLICY_V1.version,
        processor_cost_retained_minor: 0,
        application_fee_minor: 450,
      },
    });

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "artist_cancellation",
    });

    expect(result.status).toBe("ok");
    // The old defect was retaining the whole fee here. The fix returns it.
    expect(lastRefundCall().refund_application_fee).toBe(true);
    expect(mockStripe.applicationFees.createRefund).not.toHaveBeenCalled();
    expect(collectionUpdate()).toBeUndefined();
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          retention_note: "processor_cost_unavailable",
        }),
      }),
    );
  });

  it("v1 leaves a voluntary (client-cancellation) refund returning the full fee, unchanged", async () => {
    setupStandardRefund();
    queueCollection(); // v1 stamp + a cost present

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "voluntary_full",
    });

    expect(result.status).toBe("ok");
    expect(lastRefundCall().refund_application_fee).toBe(true);
    expect(mockStripe.applicationFees.createRefund).not.toHaveBeenCalled();
  });

  it("resolves the policy version from the stored stamp: a null stamp falls back to v0, unchanged even with a cost present", async () => {
    setupStandardRefund();
    queue("payment_collections:select", {
      data: {
        processor_cost_minor: 200,
        processor_cost_status: "captured",
        fee_refund_policy_version: null, // no stamp -> active (v0)
        processor_cost_retained_minor: 0,
        application_fee_minor: 450,
      },
    });

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "artist_cancellation",
    });

    expect(result.status).toBe("ok");
    // v0 artist_cancellation = return_full: the fee is returned even though a
    // cost is on record, because the collection was not settled under v1.
    expect(FEE_REFUND_POLICY_V0.cases.artist_cancellation).toBe("return_full");
    expect(lastRefundCall().refund_application_fee).toBe(true);
    expect(mockStripe.applicationFees.createRefund).not.toHaveBeenCalled();
  });

  // Authz-review Finding B (core half): cancelled / expired / failed can hold
  // collected money, and the transition matrix gives each its own refund edges.
  // The artist must be able to return that money without support intervention.
  // The amount stays bounded by the real allocations, so a cancelled request
  // with nothing collected still refuses ("Nothing to refund.").
  it("refunds collected money from a CANCELLED request (Finding B)", async () => {
    queue("payment_requests:select", {
      data: { ...REQUEST_ROW, status: "cancelled" },
    });
    queue("payment_allocations:select", { data: ALLOCATIONS });
    queue("payment_allocations:select", { data: [] }); // no prior adjustments

    const result = await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "voluntary_full",
    });

    expect(result).toEqual({
      status: "ok",
      refundId: "re_test_123",
      refundedMinor: 15000,
    });
    expect(lastRefundCall().reverse_transfer).toBe(true);
  });

  // M11: the idempotency key was `...-${Date.now()}`, so every retry got a
  // fresh key and Stripe created a SECOND refund on a retried request. It is now
  // derived from the refund's logical identity (request + amount + cumulative
  // already-refunded), which is stable across a retry and distinct across a
  // genuinely separate later refund.
  function lastIdempotencyKey(): string | undefined {
    return mockStripe.refunds.create.mock.calls.at(-1)?.[1]?.idempotencyKey as
      | string
      | undefined;
  }

  it("uses a deterministic idempotency key that a retry reuses (M11)", async () => {
    setupStandardRefund();
    await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "voluntary_full",
    });
    const firstKey = lastIdempotencyKey();

    // A retry: identical state, no refund_adjustment written yet (the webhook
    // writes it, only on success), so already-refunded is still 0.
    setupStandardRefund();
    await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "full",
      case: "voluntary_full",
    });
    const retryKey = lastIdempotencyKey();

    expect(firstKey).toBe(retryKey);
    // request + amount (15000 = the full 10000+3000+2000) + already-refunded (0).
    expect(firstKey).toBe("refund-apt-req_1-15000-0");
    // No timestamp component: the whole defect was a fresh number per call.
    expect(firstKey).not.toMatch(/\d{13}/);
  });

  it("advances the idempotency key once a prior refund has settled (M11)", async () => {
    // 5000 already refunded (a refund_adjustment allocation the webhook wrote),
    // so a further partial refund gets a DIFFERENT key and is not deduped.
    queue("payment_requests:select", {
      data: { ...REQUEST_ROW, status: "partially_refunded" },
    });
    queue("payment_allocations:select", { data: ALLOCATIONS });
    queue("payment_allocations:select", { data: [{ amount_minor: -5000 }] });

    await refundPaymentRequestCore({
      artistId: "artist_1",
      requestId: "req_1",
      refundType: "partial",
      amountMinor: 2000,
      case: "voluntary_partial",
    });

    expect(lastIdempotencyKey()).toBe("refund-apt-req_1-2000-5000");
  });
});
