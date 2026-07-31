import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const { mockServiceClient, mockWriteAudit, mockStripe } = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
  mockWriteAudit: vi.fn(),
  mockStripe: {
    paymentIntents: { retrieve: vi.fn() },
    refunds: { create: vi.fn() },
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
  }));
  mockStripe.paymentIntents.retrieve.mockResolvedValue({
    id: "pi_test",
    amount: 15000,
    metadata: { application_fee_minor: "450" },
  });
  mockStripe.refunds.create.mockResolvedValue({
    id: "re_test_123",
    amount: 15000,
    status: "succeeded",
  });
});

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
