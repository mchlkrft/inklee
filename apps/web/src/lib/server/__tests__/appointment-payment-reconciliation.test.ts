import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const { mockServiceClient, mockWriteAudit, mockStripe, mockSettle } =
  vi.hoisted(() => ({
    mockServiceClient: { from: vi.fn() },
    mockWriteAudit: vi.fn(),
    mockStripe: { paymentIntents: { retrieve: vi.fn() } },
    mockSettle: vi.fn(),
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
vi.mock("@/lib/stripe", () => ({ stripe: mockStripe }));
vi.mock("../appointment-payment-settlement", () => ({
  settlePaymentRequestSuccess: (...a: unknown[]) => mockSettle(...a),
}));

import {
  reconcileStalePaymentRequests,
  sweepExpiredPaymentRequests,
} from "../appointment-payment-reconciliation";
import { EXPIRABLE_STATUSES } from "../appointment-payments";

type Reply = { data?: unknown; error?: unknown };
let selectReply: Reply = { data: [] };
let updateReply: Reply = { data: null };

type RecordedOp = {
  table: string;
  verb: string;
  payload: unknown;
  filters: Record<string, unknown>;
  inFilter: { column: string; values: unknown[] } | null;
};
let ops: RecordedOp[] = [];

function makeChain(table: string, verb: string, payload: unknown) {
  const op: RecordedOp = { table, verb, payload, filters: {}, inFilter: null };
  ops.push(op);
  const chain = {
    eq: (column: string, value: unknown) => {
      op.filters[column] = value;
      return chain;
    },
    neq: () => chain,
    not: (column: string) => {
      op.filters[`not:${column}`] = true;
      return chain;
    },
    in: (column: string, values: unknown[]) => {
      op.inFilter = { column, values };
      return chain;
    },
    lt: () => chain,
    lte: (column: string, value: unknown) => {
      op.filters[`lte:${column}`] = value;
      return chain;
    },
    is: () => chain,
    select: () => chain,
    maybeSingle: () =>
      Promise.resolve(verb === "select" ? selectReply : updateReply),
    then: (onF?: (v: Reply) => unknown, onR?: (r: unknown) => unknown) =>
      Promise.resolve(verb === "select" ? selectReply : updateReply).then(
        onF,
        onR,
      ),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  selectReply = { data: [] };
  updateReply = { data: { id: "pr1" } };
  mockServiceClient.from.mockImplementation((table: string) => ({
    select: () => makeChain(table, "select", null),
    update: (d: unknown) => makeChain(table, "update", d),
  }));
});

const STALE_ROW = {
  id: "pr1",
  payment_intent_id: "pi_abc",
  artist_id: "artist1",
  revision: 1,
};

describe("reconcileStalePaymentRequests", () => {
  it("settles a succeeded intent found by reconciliation", async () => {
    selectReply = { data: [STALE_ROW] };
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_abc",
      status: "succeeded",
    });
    mockSettle.mockResolvedValue(true);

    const result = await reconcileStalePaymentRequests();

    expect(result.checked).toBe(1);
    expect(result.settled).toBe(1);
    expect(mockSettle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pi_abc", status: "succeeded" }),
    );
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "appointment_payment_reconciled",
        details: expect.objectContaining({ outcome: "settled" }),
      }),
    );
  });

  it("moves a canceled intent to failed", async () => {
    selectReply = { data: [STALE_ROW] };
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_abc",
      status: "canceled",
    });

    const result = await reconcileStalePaymentRequests();

    expect(result.checked).toBe(1);
    expect(result.failed).toBe(1);
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "appointment_payment_reconciled",
        details: expect.objectContaining({ outcome: "failed" }),
      }),
    );
  });

  it("skips an intent that is still live", async () => {
    selectReply = { data: [STALE_ROW] };
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_abc",
      status: "requires_payment_method",
    });

    const result = await reconcileStalePaymentRequests();

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.settled).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("returns zeros when no stale requests exist", async () => {
    selectReply = { data: [] };

    const result = await reconcileStalePaymentRequests();

    expect(result.checked).toBe(0);
    expect(result.settled).toBe(0);
  });

  it("counts a Stripe retrieve error without crashing", async () => {
    selectReply = { data: [STALE_ROW] };
    mockStripe.paymentIntents.retrieve.mockRejectedValue(
      new Error("Stripe down"),
    );

    const result = await reconcileStalePaymentRequests();

    expect(result.checked).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.settled).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fleet expiry sweep (M9). Closes the verifier's 1c gap: the sweep had zero
// test coverage, so deleting its cron wiring or drifting its WHERE failed
// nothing. The status list is asserted AGAINST the shared constant, not a
// re-typed copy, so this test moves with it.

describe("sweepExpiredPaymentRequests", () => {
  it("expires due rows with the shared status list and the expires_at guards", async () => {
    updateReply = { data: [{ id: "r1" }, { id: "r2" }] };

    const result = await sweepExpiredPaymentRequests({
      now: new Date("2026-08-01T00:00:00.000Z"),
    });
    expect(result).toEqual({ expired: 2 });

    const op = ops.find(
      (o) => o.table === "payment_requests" && o.verb === "update",
    );
    expect(op).toBeDefined();
    expect((op!.payload as Record<string, unknown>).status).toBe("expired");
    // The SAME list the per-artist core uses — imported, not re-typed.
    expect(op!.inFilter?.column).toBe("status");
    expect(op!.inFilter?.values).toEqual(EXPIRABLE_STATUSES);
    // Null-expiry rows are untouchable; only past expiries match.
    expect(op!.filters["not:expires_at"]).toBe(true);
    expect(op!.filters["lte:expires_at"]).toBe("2026-08-01T00:00:00.000Z");

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "appointment_payment_requests_expired",
        details: expect.objectContaining({ count: 2 }),
      }),
    );
  });

  it("returns 0 and writes no audit when nothing is due", async () => {
    updateReply = { data: [] };
    const result = await sweepExpiredPaymentRequests();
    expect(result).toEqual({ expired: 0 });
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("captures and returns 0 on a write error, never throws", async () => {
    updateReply = { data: null, error: { message: "boom" } };
    const result = await sweepExpiredPaymentRequests();
    expect(result).toEqual({ expired: 0 });
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });
});
