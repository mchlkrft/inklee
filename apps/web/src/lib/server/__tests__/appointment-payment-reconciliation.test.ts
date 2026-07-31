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

import { reconcileStalePaymentRequests } from "../appointment-payment-reconciliation";

type Reply = { data?: unknown; error?: unknown };
let selectReply: Reply = { data: [] };
let updateReply: Reply = { data: null };

type RecordedOp = { table: string; verb: string; payload: unknown };
let ops: RecordedOp[] = [];

function makeChain(table: string, verb: string, payload: unknown) {
  const op = { table, verb, payload };
  ops.push(op);
  const chain = {
    eq: () => chain,
    neq: () => chain,
    not: () => chain,
    in: () => chain,
    lt: () => chain,
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
