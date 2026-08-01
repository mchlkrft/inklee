import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// Goods order refund settlement (GC1 C1): the recon's goods refund hole. Pins
// the entangled-PI rules — full refund converges + restocks + releases the
// redemption ONCE via the flip gate; partial is visibility-only; and the pure
// deposit-refund-amount decision that stops refundDepositCore dragging goods
// money back.

const { mockServiceClient, mockWriteAudit, mockRestock } = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
  mockWriteAudit: vi.fn(),
  mockRestock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: mockServiceClient }));
vi.mock("@/lib/audit", () => ({
  writeAudit: (...a: unknown[]) => mockWriteAudit(...a),
}));
vi.mock("@/lib/order-fulfillment", () => ({
  restockInventory: (...a: unknown[]) => mockRestock(...a),
}));

import {
  settleGoodsOrderRefund,
  resolveDepositRefundAmountMinor,
} from "@/lib/server/goods-refund";

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
  inFilter: { column: string; values: unknown[] } | null;
};
let ops: RecordedOp[] = [];

function makeChain(op: RecordedOp) {
  const key = `${op.table}:${op.verb}`;
  const chain = {
    eq: (column: string, value: unknown) => {
      op.filters[column] = value;
      return chain;
    },
    in: (column: string, values: unknown[]) => {
      op.inFilter = { column, values };
      return chain;
    },
    select: () => chain,
    maybeSingle: () => Promise.resolve(nextReply(key)),
    then: (onF?: (v: Reply) => unknown, onR?: (r: unknown) => unknown) =>
      Promise.resolve(nextReply(key)).then(onF, onR),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  replies = {};
  mockRestock.mockResolvedValue(undefined);
  mockServiceClient.from.mockImplementation((table: string) => ({
    select: () => {
      const op: RecordedOp = {
        table,
        verb: "select",
        payload: null,
        filters: {},
        inFilter: null,
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
        inFilter: null,
      };
      ops.push(op);
      return makeChain(op);
    },
    delete: () => {
      const op: RecordedOp = {
        table,
        verb: "delete",
        payload: null,
        filters: {},
        inFilter: null,
      };
      ops.push(op);
      return makeChain(op);
    },
  }));
});

const ORDER = {
  id: "o1",
  artist_id: "a1",
  status: "paid",
  discount_code_id: "dc1",
};

const PRODUCT_ITEMS = [
  {
    product_id: "p1",
    variant_id: null,
    quantity: 2,
    type: "product",
    title_snapshot: "Print",
    variant_snapshot: null,
    total_amount: 40,
  },
];

function fullCharge(over: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    id: "ch1",
    payment_intent: "pi1",
    amount: 15000,
    amount_refunded: 15000,
    refunded: true,
    currency: "eur",
    ...over,
  } as unknown as Stripe.Charge;
}

describe("settleGoodsOrderRefund", () => {
  it("FULL refund: converges to refunded, restocks product lines, releases the redemption", async () => {
    queue("orders:select", { data: ORDER });
    queue("orders:update", { data: [{ id: "o1" }] }); // flip won
    queue("order_items:select", { data: PRODUCT_ITEMS });

    const outcome = await settleGoodsOrderRefund(fullCharge());
    expect(outcome).toBe("refunded");

    const flip = ops.find((o) => o.table === "orders" && o.verb === "update");
    expect((flip!.payload as Record<string, unknown>).status).toBe("refunded");
    expect(flip!.filters.id).toBe("o1");
    expect(flip!.inFilter?.values).toEqual(["paid", "partially_refunded"]);

    expect(mockRestock).toHaveBeenCalledWith(PRODUCT_ITEMS);

    const del = ops.find(
      (o) => o.table === "discount_redemptions" && o.verb === "delete",
    );
    expect(del).toBeDefined();
    expect(del!.filters.order_id).toBe("o1");

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "goods_order_refunded",
        details: expect.objectContaining({
          order_id: "o1",
          redemption_released: true,
        }),
      }),
    );
  });

  it("REDELIVERY: the lost flip skips restock and redemption release (once-only)", async () => {
    queue("orders:select", { data: ORDER });
    queue("orders:update", { data: [] }); // flip lost — another delivery won

    const outcome = await settleGoodsOrderRefund(fullCharge());
    expect(outcome).toBe("refunded");
    expect(mockRestock).not.toHaveBeenCalled();
    expect(ops.find((o) => o.table === "discount_redemptions")).toBeUndefined();
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("PARTIAL refund: visibility-only (paid -> partially_refunded), no restock, no release", async () => {
    queue("orders:select", { data: ORDER });

    const outcome = await settleGoodsOrderRefund(
      fullCharge({ refunded: false, amount_refunded: 5000 }),
    );
    expect(outcome).toBe("partially_refunded");

    const upd = ops.find((o) => o.table === "orders" && o.verb === "update");
    expect((upd!.payload as Record<string, unknown>).status).toBe(
      "partially_refunded",
    );
    // Converge only FROM paid: a fully-refunded order never walks back.
    expect(upd!.filters.status).toBe("paid");
    expect(mockRestock).not.toHaveBeenCalled();
  });

  it("no order on the PI: none, and nothing is written", async () => {
    const outcome = await settleGoodsOrderRefund(fullCharge());
    expect(outcome).toBe("none");
    expect(ops.filter((o) => o.verb !== "select")).toHaveLength(0);
  });

  it("zero amount_refunded: none (a bare event moves nothing)", async () => {
    const outcome = await settleGoodsOrderRefund(
      fullCharge({ refunded: false, amount_refunded: 0 }),
    );
    expect(outcome).toBe("none");
    expect(ops).toHaveLength(0);
  });
});

describe("resolveDepositRefundAmountMinor", () => {
  it("returns undefined when no order shares the intent (whole-intent refund)", () => {
    expect(resolveDepositRefundAmountMinor(null)).toBeUndefined();
  });

  it("returns undefined for a deposit-only order (goods 0)", () => {
    expect(
      resolveDepositRefundAmountMinor({ deposit_amount: 50, goods_amount: 0 }),
    ).toBeUndefined();
  });

  it("returns the order's OWN deposit portion in minor units when goods share the PI", () => {
    expect(
      resolveDepositRefundAmountMinor({
        deposit_amount: 50,
        goods_amount: 35.5,
      }),
    ).toBe(5000);
    // The rounding matches the checkout's own major->minor conversion.
    expect(
      resolveDepositRefundAmountMinor({
        deposit_amount: 49.99,
        goods_amount: 10,
      }),
    ).toBe(4999);
  });

  it("fails open to whole-intent on garbage amounts (never invents a number)", () => {
    expect(
      resolveDepositRefundAmountMinor({
        deposit_amount: "x",
        goods_amount: 10,
      }),
    ).toBeUndefined();
  });
});
