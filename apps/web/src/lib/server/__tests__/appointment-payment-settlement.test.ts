import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted() runs before vi.mock factories, which are hoisted above
// module-level const declarations.

const { mockServiceClient, mockWriteAudit } = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
  mockWriteAudit: vi.fn(),
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

import {
  settlePaymentRequestSuccess,
  settlePaymentRequestRefund,
  settlePaymentRequestDispute,
} from "@/lib/server/appointment-payment-settlement";

// ---------------------------------------------------------------------------
// Chain builder for the recording Supabase double.

type Reply = { data?: unknown; error?: unknown; count?: number };
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
  inFilter: { column: string; values: unknown[] } | null;
};

let ops: RecordedOp[] = [];

function makeChain(op: RecordedOp) {
  const key = `${op.table}:${op.verb}`;
  const self = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) {
        return Promise.resolve({
          ...nextReply(key),
          count: nextReply(`${key}:count`).count ?? 0,
        });
      }
      return self;
    },
    upsert: (data: unknown, _opts?: unknown) => {
      op.payload = data;
      op.verb = "upsert";
      return self;
    },
    update: (data: unknown) => {
      op.payload = data;
      return self;
    },
    insert: (data: unknown) => {
      op.payload = data;
      return self;
    },
    eq: (column: string, value: unknown) => {
      op.filters[column] = value;
      return self;
    },
    neq: (column: string, value: unknown) => {
      op.filters[`neq:${column}`] = value;
      return self;
    },
    in: (column: string, values: unknown[]) => {
      op.inFilter = { column, values };
      return self;
    },
    maybeSingle: () => Promise.resolve(nextReply(key)),
    single: () => Promise.resolve(nextReply(key)),
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
    update: (data: unknown) => {
      const op: RecordedOp = {
        table,
        verb: "update",
        payload: data,
        filters: {},
        inFilter: null,
      };
      ops.push(op);
      return makeChain(op);
    },
    upsert: (data: unknown, upsertOpts?: unknown) => {
      const op: RecordedOp = {
        table,
        verb: "upsert",
        payload: data,
        filters: {},
        inFilter: null,
      };
      ops.push(op);
      return makeChain(op);
    },
    select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
      const op: RecordedOp = {
        table,
        verb: "select",
        payload: null,
        filters: {},
        inFilter: null,
      };
      ops.push(op);
      if (opts?.count) {
        return {
          ...makeChain(op),
          eq: (column: string, value: unknown) => {
            op.filters[column] = value;
            return {
              ...makeChain(op),
              then: (
                onFulfilled?: (value: Reply) => unknown,
                onRejected?: (reason: unknown) => unknown,
              ) =>
                Promise.resolve(nextReply(`${table}:select:count`)).then(
                  onFulfilled,
                  onRejected,
                ),
            };
          },
        };
      }
      return makeChain(op);
    },
    insert: (data: unknown) => {
      const op: RecordedOp = {
        table,
        verb: "insert",
        payload: data,
        filters: {},
        inFilter: null,
      };
      ops.push(op);
      return makeChain(op);
    },
  }));
});

// ---------------------------------------------------------------------------
// Fixtures

function makeIntent(overrides?: Partial<Stripe.PaymentIntent>) {
  return {
    id: "pi_test_123",
    amount: 15000,
    amount_received: 15000,
    currency: "eur",
    metadata: {
      payment_request_id: "req_1",
      artist_id: "artist_1",
      booking_id: "booking_1",
      collects: "full_price",
      revision: "1",
      quoted_amount_minor: "15000",
      application_fee_minor: "75",
      appointment_base_minor: "13000",
      goods_base_minor: "2000",
      fee_schedule_version: "fees-v2-plus-payments",
    },
    ...overrides,
  } as unknown as Stripe.PaymentIntent;
}

function makeCharge(overrides?: Partial<Stripe.Charge>) {
  return {
    id: "ch_test_123",
    payment_intent: "pi_test_123",
    amount: 15000,
    amount_refunded: 0,
    refunded: false,
    currency: "eur",
    ...overrides,
  } as unknown as Stripe.Charge;
}

const LINES = [
  {
    id: "line_1",
    classification: "tattoo_service",
    line_total_minor: 10000,
    currency: "eur",
  },
  {
    id: "line_2",
    classification: "additional_service",
    line_total_minor: 3000,
    currency: "eur",
  },
  {
    id: "line_3",
    classification: "physical_goods",
    line_total_minor: 2000,
    currency: "eur",
  },
];

// ---------------------------------------------------------------------------
// Settlement success

describe("settlePaymentRequestSuccess", () => {
  it("claims the request, writes allocations, and returns true", async () => {
    // Claim succeeds
    queue("payment_requests:update", { data: { id: "req_1" } });
    // Lines read
    queue("payment_request_lines:select", { data: LINES });
    // Allocation upsert
    queue("payment_allocations:upsert", { data: null });

    const result = await settlePaymentRequestSuccess(makeIntent());

    expect(result).toBe(true);

    // The claim UPDATE targeted status=payment_processing with the correct PI.
    const claimOp = ops.find(
      (o) => o.table === "payment_requests" && o.verb === "update",
    );
    expect(claimOp).toBeDefined();
    expect(claimOp!.filters.status).toBe("payment_processing");
    expect(claimOp!.filters.payment_intent_id).toBe("pi_test_123");
    expect(claimOp!.filters.revision).toBe(1);
    expect((claimOp!.payload as Record<string, unknown>).status).toBe("paid");

    // Allocation upsert was called.
    const allocOp = ops.find(
      (o) => o.table === "payment_allocations" && o.verb === "upsert",
    );
    expect(allocOp).toBeDefined();
    const allocPayload = allocOp!.payload as Array<Record<string, unknown>>;
    expect(allocPayload).toHaveLength(3);

    // Verify component mapping for full_price collects.
    expect(allocPayload[0].component).toBe("full_price");
    expect(allocPayload[0].amount_minor).toBe(10000);
    expect(allocPayload[1].component).toBe("additional_service");
    expect(allocPayload[1].amount_minor).toBe(3000);
    expect(allocPayload[2].component).toBe("physical_goods");
    expect(allocPayload[2].amount_minor).toBe(2000);

    // All carry the collected total.
    for (const a of allocPayload) {
      expect(a.collected_total_minor).toBe(15000);
      expect(a.status).toBe("succeeded");
      expect(a.payment_intent_id).toBe("pi_test_123");
    }

    // Audit entry was written.
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "appointment_payment_settled",
        details: expect.objectContaining({
          payment_request_id: "req_1",
          payment_intent_id: "pi_test_123",
          amount_minor: 15000,
        }),
      }),
    );
  });

  it("maps tattoo_service to deposit when collects=deposit", async () => {
    queue("payment_requests:update", { data: { id: "req_1" } });
    queue("payment_request_lines:select", {
      data: [
        {
          id: "l1",
          classification: "tattoo_service",
          line_total_minor: 5000,
          currency: "eur",
        },
      ],
    });
    queue("payment_allocations:upsert", { data: null });

    const intent = makeIntent();
    (intent.metadata as Record<string, string>).collects = "deposit";

    await settlePaymentRequestSuccess(intent);

    const allocOp = ops.find((o) => o.table === "payment_allocations");
    const payload = allocOp!.payload as Array<Record<string, unknown>>;
    expect(payload[0].component).toBe("deposit");
  });

  it("maps tattoo_service to tattoo_service_balance when collects=balance", async () => {
    queue("payment_requests:update", { data: { id: "req_1" } });
    queue("payment_request_lines:select", {
      data: [
        {
          id: "l1",
          classification: "tattoo_service",
          line_total_minor: 5000,
          currency: "eur",
        },
      ],
    });
    queue("payment_allocations:upsert", { data: null });

    const intent = makeIntent();
    (intent.metadata as Record<string, string>).collects = "balance";

    await settlePaymentRequestSuccess(intent);

    const allocOp = ops.find((o) => o.table === "payment_allocations");
    const payload = allocOp!.payload as Array<Record<string, unknown>>;
    expect(payload[0].component).toBe("tattoo_service_balance");
  });

  it("returns false on redelivery (claim finds no matching row)", async () => {
    // Claim fails (already settled — no matching row)
    queue("payment_requests:update", { data: null });

    const result = await settlePaymentRequestSuccess(makeIntent());

    expect(result).toBe(false);
    // No allocation upsert should have happened.
    expect(ops.filter((o) => o.table === "payment_allocations")).toHaveLength(
      0,
    );
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("returns false when metadata has no payment_request_id", async () => {
    const intent = makeIntent();
    delete (intent.metadata as Record<string, string>).payment_request_id;

    const result = await settlePaymentRequestSuccess(intent);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Refund settlement

describe("settlePaymentRequestRefund", () => {
  function setupRefundAllocations() {
    queue("payment_allocations:select", {
      data: [
        {
          id: "alloc_1",
          artist_id: "artist_1",
          booking_id: "booking_1",
          project_id: null,
          request_id: "req_1",
          line_id: "line_1",
          component: "full_price",
          amount_minor: 10000,
          currency: "eur",
        },
        {
          id: "alloc_2",
          artist_id: "artist_1",
          booking_id: "booking_1",
          project_id: null,
          request_id: "req_1",
          line_id: "line_2",
          component: "additional_service",
          amount_minor: 3000,
          currency: "eur",
        },
        {
          id: "alloc_3",
          artist_id: "artist_1",
          booking_id: "booking_1",
          project_id: null,
          request_id: "req_1",
          line_id: "line_3",
          component: "discount",
          amount_minor: -1000,
          currency: "eur",
        },
      ],
    });
  }

  it("distributes a full refund proportionally across positive components", async () => {
    setupRefundAllocations();
    // Per-allocation upserts (2 positive components)
    queue("payment_allocations:upsert", { data: [{ id: "adj_1" }] });
    queue("payment_allocations:upsert", { data: [{ id: "adj_2" }] });
    // Status update
    queue("payment_requests:update", { data: null });

    const charge = makeCharge({
      amount: 12000,
      amount_refunded: 12000,
      refunded: true,
    });

    const result = await settlePaymentRequestRefund(charge);
    expect(result).toBe(true);

    // Two refund_adjustment upserts (one per positive component).
    const adjOps = ops.filter(
      (o) =>
        o.table === "payment_allocations" &&
        o.verb === "upsert" &&
        (o.payload as Record<string, unknown>).component ===
          "refund_adjustment",
    );
    expect(adjOps).toHaveLength(2);

    // full_price: -round(12000 * 10000/13000) = -9231
    // additional: -(12000 - 9231) = -2769 (last absorbs rounding)
    const amounts = adjOps.map(
      (o) => (o.payload as Record<string, unknown>).amount_minor,
    );
    expect(amounts[0]).toBe(-Math.round((12000 * 10000) / 13000));
    expect(amounts.reduce((a, b) => (a as number) + (b as number), 0)).toBe(
      -12000,
    );

    // Status flipped to refunded.
    const statusOp = ops.find(
      (o) => o.table === "payment_requests" && o.verb === "update",
    );
    expect(statusOp).toBeDefined();
    expect((statusOp!.payload as Record<string, unknown>).status).toBe(
      "refunded",
    );
  });

  it("distributes a partial refund and sets partially_refunded", async () => {
    setupRefundAllocations();
    queue("payment_allocations:upsert", { data: [{ id: "adj_1" }] });
    queue("payment_allocations:upsert", { data: [{ id: "adj_2" }] });
    queue("payment_requests:update", { data: null });

    const charge = makeCharge({
      amount: 12000,
      amount_refunded: 6000,
      refunded: false,
    });

    const result = await settlePaymentRequestRefund(charge);
    expect(result).toBe(true);

    const adjOps = ops.filter(
      (o) =>
        o.table === "payment_allocations" &&
        o.verb === "upsert" &&
        (o.payload as Record<string, unknown>).component ===
          "refund_adjustment",
    );
    const amounts = adjOps.map(
      (o) => (o.payload as Record<string, unknown>).amount_minor,
    );
    expect(amounts.reduce((a, b) => (a as number) + (b as number), 0)).toBe(
      -6000,
    );

    const statusOp = ops.find(
      (o) => o.table === "payment_requests" && o.verb === "update",
    );
    expect((statusOp!.payload as Record<string, unknown>).status).toBe(
      "partially_refunded",
    );
  });

  it("returns false when no allocations exist for the PI", async () => {
    queue("payment_allocations:select", { data: [] });

    const result = await settlePaymentRequestRefund(
      makeCharge({ amount_refunded: 5000 }),
    );
    expect(result).toBe(false);
  });

  it("returns false when amount_refunded is zero", async () => {
    const result = await settlePaymentRequestRefund(
      makeCharge({ amount_refunded: 0 }),
    );
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dispute settlement

describe("settlePaymentRequestDispute", () => {
  it("marks allocations as disputed and transitions request", async () => {
    // Update allocations
    queue("payment_allocations:update", {
      data: [{ request_id: "req_1" }],
    });
    // Update request
    queue("payment_requests:update", { data: null });

    const dispute = { id: "dp_1", status: "needs_response" } as Stripe.Dispute;
    const result = await settlePaymentRequestDispute(
      dispute,
      "pi_test_123",
      "needs_response",
    );

    expect(result).toBe(true);

    const allocOp = ops.find(
      (o) => o.table === "payment_allocations" && o.verb === "update",
    );
    expect((allocOp!.payload as Record<string, unknown>).status).toBe(
      "disputed",
    );

    const reqOp = ops.find(
      (o) => o.table === "payment_requests" && o.verb === "update",
    );
    expect((reqOp!.payload as Record<string, unknown>).status).toBe("disputed");
  });

  it("restores to paid when dispute is won", async () => {
    queue("payment_allocations:update", {
      data: [{ request_id: "req_1" }],
    });
    queue("payment_requests:update", { data: null });

    const dispute = { id: "dp_1", status: "won" } as Stripe.Dispute;
    await settlePaymentRequestDispute(dispute, "pi_test_123", "won");

    const reqOp = ops.find(
      (o) => o.table === "payment_requests" && o.verb === "update",
    );
    expect((reqOp!.payload as Record<string, unknown>).status).toBe("paid");
  });

  it("sets refunded when dispute is lost", async () => {
    queue("payment_allocations:update", {
      data: [{ request_id: "req_1" }],
    });
    queue("payment_requests:update", { data: null });

    const dispute = { id: "dp_1", status: "lost" } as Stripe.Dispute;
    await settlePaymentRequestDispute(dispute, "pi_test_123", "lost");

    const reqOp = ops.find(
      (o) => o.table === "payment_requests" && o.verb === "update",
    );
    expect((reqOp!.payload as Record<string, unknown>).status).toBe("refunded");
  });
});
