import { describe, it, expect, vi, beforeEach } from "vitest";

// Artist-initiated goods order refund (FD12): full / by-line / quantity /
// custom-amount, restock SELECTION, deterministic fee + processor-cost
// treatment (reusing the appointment lane's PAY-RFD-002 policy engine), the
// duplicate-refund CLAIM GATE, over-refund prevention, discount cap-release
// gated on genuine full unwind, and historical-purchase-after-archival.

const {
  mockServiceClient,
  mockWriteAudit,
  mockStripe,
  mockExpand,
  mockRestock,
} = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
  mockWriteAudit: vi.fn(),
  mockStripe: {
    paymentIntents: { retrieve: vi.fn() },
    refunds: { create: vi.fn() },
    applicationFees: { createRefund: vi.fn() },
  },
  mockExpand: vi.fn(),
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
vi.mock("@/lib/stripe", () => ({ stripe: mockStripe }));
vi.mock("@/lib/order-fulfillment", () => ({
  expandInventoryMovements: (...a: unknown[]) => mockExpand(...a),
  restockInventory: (...a: unknown[]) => mockRestock(...a),
}));

import { refundGoodsOrderCore } from "@/lib/server/goods-order-refund";

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

// Two calls can share the same (table, verb) — e.g. `sumSucceededRefundedMinor`
// does a plain LIST select on `refunds`, while the claim gate's conflict
// fallback does a SINGLE-ROW select on the same table. `.maybeSingle()` vs a
// bare `await` are genuinely different queries against a real client, so the
// mock key includes which one was used rather than collapsing them.
function makeChain(op: RecordedOp) {
  const baseKey = `${op.table}:${op.verb}`;
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
    in: (column: string, values: unknown[]) => {
      op.filters[`in:${column}`] = values;
      return self;
    },
    maybeSingle: () => Promise.resolve(nextReply(`${baseKey}:single`)),
    then: (
      onFulfilled?: (value: Reply) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve(nextReply(`${baseKey}:list`)).then(
        onFulfilled,
        onRejected,
      ),
  };
  return self;
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  replies = {};
  // Simple passthrough: real bundle expansion is order-fulfillment.ts's own
  // tested concern (order-fulfillment-restock.test.ts). This file's job is to
  // prove WHICH items/quantities this engine hands to it.
  mockExpand.mockImplementation(async (items: unknown[]) => items);
  mockRestock.mockResolvedValue(undefined);
  mockStripe.paymentIntents.retrieve.mockResolvedValue({
    id: "pi_test",
    amount: 10000,
    metadata: {},
    latest_charge: { id: "ch_test", application_fee: "fee_test" },
  });
  mockStripe.refunds.create.mockResolvedValue({
    id: "re_goods_1",
    amount: 0,
    status: "succeeded",
  });
  mockStripe.applicationFees.createRefund.mockResolvedValue({
    id: "fr_1",
    amount: 0,
  });
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
      const op: RecordedOp = { table, verb: "update", payload, filters: {} };
      ops.push(op);
      return makeChain(op);
    },
    delete: () => {
      const op: RecordedOp = {
        table,
        verb: "delete",
        payload: null,
        filters: {},
      };
      ops.push(op);
      return makeChain(op);
    },
    insert: (payload: unknown) => {
      const op: RecordedOp = { table, verb: "insert", payload, filters: {} };
      ops.push(op);
      return makeChain(op);
    },
  }));
});

const ORDER = {
  id: "order_1",
  artist_id: "artist_1",
  status: "paid",
  currency: "eur",
  stripe_payment_intent_id: "pi_test",
  discount_code_id: null,
  goods_fee_amount: 1.0, // 100 minor, applied only on fee-focused tests
  processor_cost_minor: null,
  processor_cost_status: "pending",
  processor_cost_retained_minor: 0,
  fee_refund_policy_version: null,
};

const ITEMS = [
  {
    id: "item_1",
    product_id: "prod_1",
    variant_id: null,
    bundle_id: null,
    type: "product",
    title_snapshot: "Mug",
    variant_snapshot: null,
    quantity: 2,
    unit_amount: 25.0,
    total_amount: 50.0,
  },
  {
    id: "item_2",
    product_id: "prod_2",
    variant_id: null,
    bundle_id: null,
    type: "product",
    title_snapshot: "Sticker pack",
    variant_snapshot: null,
    quantity: 1,
    unit_amount: 50.0,
    total_amount: 50.0,
  },
];

function setupOrder(orderOverrides: Record<string, unknown> = {}) {
  queue("orders:select:single", { data: { ...ORDER, ...orderOverrides } });
  queue("order_items:select:list", { data: ITEMS });
}

function claimOk(id = "refund_led_1") {
  queue("refunds:insert:single", { data: { id } });
}

function alreadyRefundedForOrder(amountMinor: number) {
  queue("refunds:select:list", { data: [{ amount_minor: amountMinor }] });
}

function alreadyRefundedForItem(
  qtyOrRows: number | { amount_minor?: number; quantity_refunded?: number }[],
) {
  const data =
    typeof qtyOrRows === "number"
      ? qtyOrRows === 0
        ? []
        : [{ quantity_refunded: qtyOrRows }]
      : qtyOrRows;
  queue("refund_lines:select:list", { data });
}

function lastRefundCall() {
  return mockStripe.refunds.create.mock.calls.at(-1)?.[0] as Record<
    string,
    unknown
  >;
}

describe("refundGoodsOrderCore: full refund", () => {
  it("refunds the full remaining balance, restocks every line, and releases the discount cap", async () => {
    setupOrder({ discount_code_id: "disc_1" });
    claimOk();
    alreadyRefundedForItem(0); // item_1: nothing refunded yet
    alreadyRefundedForItem(0); // item_2: nothing refunded yet
    queue("orders:update:list", { data: [{ id: "order_1" }] }); // status flip -> refunded

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "full",
      case: "voluntary_full",
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.refundedMinor).toBe(10000); // 5000 + 5000
      expect(result.remainingRefundableMinor).toBe(0);
    }
    expect(lastRefundCall().amount).toBe(10000);

    // Restock: BOTH items at their FULL remaining quantity.
    expect(mockExpand).toHaveBeenCalledWith([
      expect.objectContaining({ id: "item_1", quantity: 2 }),
      expect.objectContaining({ id: "item_2", quantity: 1 }),
    ]);
    expect(mockRestock).toHaveBeenCalled();

    const discountDelete = ops.find(
      (o) => o.table === "discount_redemptions" && o.verb === "delete",
    );
    expect(discountDelete?.filters).toEqual({ order_id: "order_1" });
  });

  it("does NOT release the cap when the refunded flip is lost (once-only gate)", async () => {
    // Round-5 verifier: the release sits inside the `paid|partially_refunded`
    // -> `refunded` flip gate, so a redelivery or a concurrent second caller
    // that loses the flip cannot release the cap twice — but NOTHING PINNED
    // that. Removing the gate survived the whole suite. This is that pin.
    //
    // FAILS IF the `flipped && flipped.length > 0` condition is dropped: the
    // delete fires on a call that moved no row, freeing a discount code's cap
    // a second time for one unwound sale.
    setupOrder({ discount_code_id: "disc_1" });
    claimOk();
    alreadyRefundedForItem(0); // nothing refunded yet -> full refund path
    // The flip returns NO rows: another delivery already converged this order.
    queue("orders:update", { data: [] });

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "full",
      case: "voluntary_full",
    });

    expect(result.status).toBe("ok");
    expect(
      ops.find(
        (o) => o.table === "discount_redemptions" && o.verb === "delete",
      ),
    ).toBeUndefined();
  });

  it("does not release the discount cap on a partial (by-line) refund", async () => {
    setupOrder({ discount_code_id: "disc_1" });
    claimOk();
    alreadyRefundedForItem(0); // item_1 only

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "by_line",
      lines: [{ orderItemId: "item_1" }],
      case: "voluntary_full",
    });

    expect(result.status).toBe("ok");
    const discountDelete = ops.find(
      (o) => o.table === "discount_redemptions" && o.verb === "delete",
    );
    expect(discountDelete).toBeUndefined();
    const partialFlip = ops.find(
      (o) => o.table === "orders" && o.verb === "update",
    );
    expect(partialFlip?.payload).toEqual(
      expect.objectContaining({ status: "partially_refunded" }),
    );
  });

  it("releases the discount cap once cumulative BY-LINE refunds reach full unwind", async () => {
    // item_1 (5000) was already refunded by a PRIOR event; this call finishes
    // item_2 (5000), completing the order's 10000 total.
    setupOrder({ discount_code_id: "disc_1" });
    claimOk();
    alreadyRefundedForOrder(5000); // order-level ledger sum
    alreadyRefundedForItem(0); // item_2: nothing refunded yet
    queue("orders:update:list", { data: [{ id: "order_1" }] });

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "by_line",
      lines: [{ orderItemId: "item_2" }],
      case: "voluntary_full",
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.refundedMinor).toBe(5000);
      expect(result.remainingRefundableMinor).toBe(0);
    }
    const discountDelete = ops.find(
      (o) => o.table === "discount_redemptions" && o.verb === "delete",
    );
    expect(discountDelete).toBeDefined();
  });
});

describe("refundGoodsOrderCore: by-line + quantity", () => {
  it("refunds only the requested QUANTITY of a multi-unit line and restocks only that quantity", async () => {
    setupOrder();
    claimOk();
    alreadyRefundedForItem(0); // item_1: nothing refunded yet

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "by_line",
      lines: [{ orderItemId: "item_1", quantity: 1 }], // 1 of 2 mugs
      case: "voluntary_full",
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.refundedMinor).toBe(2500); // 1 * 25.00
    }
    expect(mockExpand).toHaveBeenCalledWith([
      expect.objectContaining({ id: "item_1", quantity: 1 }),
    ]);
  });

  it("caps a requested quantity at the line's own remaining quantity", async () => {
    setupOrder();
    claimOk();
    alreadyRefundedForItem(0);

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "by_line",
      lines: [{ orderItemId: "item_1", quantity: 99 }],
      case: "voluntary_full",
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.refundedMinor).toBe(5000); // capped at 2 * 25.00
    }
  });

  it("refuses when the selected line is already fully exhausted (per-line over-refund prevention)", async () => {
    setupOrder();
    claimOk();
    alreadyRefundedForItem(2); // item_1 already fully refunded (2 of its own 2)

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "by_line",
      lines: [{ orderItemId: "item_1" }],
      case: "voluntary_full",
    });

    expect(result.status).toBe("error");
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });
});

describe("refundGoodsOrderCore: custom amount (no line attribution)", () => {
  it("refunds a bare custom amount without restocking anything", async () => {
    setupOrder();
    claimOk();

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "partial",
      amountMinor: 1500,
      case: "voluntary_partial",
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.refundedMinor).toBe(1500);
    expect(mockExpand).not.toHaveBeenCalled();
    expect(mockRestock).not.toHaveBeenCalled();
  });

  it("refuses a custom amount exceeding the refundable balance", async () => {
    setupOrder();

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "partial",
      amountMinor: 999999,
      case: "voluntary_partial",
    });

    expect(result.status).toBe("error");
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });
});

describe("refundGoodsOrderCore: over-refund prevention (order-level)", () => {
  it("refuses a full refund when the per-item ledger disagrees with the order-level balance, rather than silently misattributing", async () => {
    // Contrived but real: an order-level ledger showing MORE already refunded
    // (9000, e.g. from a prior bare custom-amount refund that touched no
    // per-item row) than the per-item tracking accounts for. Proceeding on
    // the per-item sum alone (5000) would under-report what Stripe actually
    // has left, or — the shape this fix specifically closes — a scenario
    // where per-item sums would exceed the order-level remaining balance and
    // silently over-refund. Refusing forces a human to reconcile instead.
    setupOrder();
    alreadyRefundedForOrder(9000); // order-level ledger: 9000 of 10000 already gone
    alreadyRefundedForItem(0); // item_1: 2 of 2 remaining
    alreadyRefundedForItem(1); // item_2: 1 of 1 already refunded -> 0 remaining

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "full",
      case: "voluntary_full",
    });

    // item_1's full remaining (5000) exceeds maxRefundable (10000-9000=1000).
    expect(result.status).toBe("error");
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("refuses an order not in a refundable status", async () => {
    setupOrder({ status: "pending" });

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "full",
      case: "voluntary_full",
    });

    expect(result.status).toBe("error");
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });
});

describe("refundGoodsOrderCore: duplicate-refund prevention (claim gate)", () => {
  it("refuses outright when an identical refund has already SUCCEEDED", async () => {
    setupOrder();
    queue("refunds:insert:single", { data: null, error: { code: "23505" } });
    queue("refunds:select:single", {
      data: {
        id: "prior_1",
        status: "succeeded",
        stripe_refund_id: "re_prior",
      },
    });

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "full",
      case: "voluntary_full",
    });

    expect(result.status).toBe("error");
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("refuses (rather than double-submit) when a matching refund is already pending", async () => {
    setupOrder();
    queue("refunds:insert:single", { data: null, error: { code: "23505" } });
    queue("refunds:select:single", {
      data: { id: "prior_2", status: "pending", stripe_refund_id: null },
    });

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "full",
      case: "voluntary_full",
    });

    expect(result.status).toBe("error");
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("two DIFFERENT line selections at the same baseline get DIFFERENT idempotency keys (no false collision)", async () => {
    setupOrder();
    claimOk("refund_led_a");
    alreadyRefundedForItem(0); // item_1

    await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "by_line",
      lines: [{ orderItemId: "item_1" }],
      case: "voluntary_full",
    });
    const firstKey = mockStripe.refunds.create.mock.calls.at(-1)?.[1]
      ?.idempotencyKey as string;

    setupOrder();
    claimOk("refund_led_b");
    alreadyRefundedForItem(0); // item_2

    await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "by_line",
      lines: [{ orderItemId: "item_2" }],
      case: "voluntary_full",
    });
    const secondKey = mockStripe.refunds.create.mock.calls.at(-1)?.[1]
      ?.idempotencyKey as string;

    // Both refund exactly 5000 at baseline 0 (item_1's mug line vs item_2's
    // sticker line happen to total the same amount) — a key derived from the
    // amount alone would collide here.
    expect(firstKey).not.toBe(secondKey);
  });
});

describe("refundGoodsOrderCore: fee + processor-cost treatment", () => {
  it("returns the full fee proportionally on a voluntary partial refund", async () => {
    setupOrder({ goods_fee_amount: 1.0 }); // 100 minor
    claimOk();
    alreadyRefundedForItem(0);

    await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "by_line",
      lines: [{ orderItemId: "item_1" }], // 5000 of 10000 = half
      case: "voluntary_partial",
    });

    expect(lastRefundCall().refund_application_fee).toBe(true);
    expect(mockStripe.applicationFees.createRefund).not.toHaveBeenCalled();
  });

  it("retains ONLY the proven non-recoverable processor cost on artist_cancellation under v1, never the whole fee", async () => {
    setupOrder({
      goods_fee_amount: 1.0, // 100 minor
      processor_cost_minor: 40,
      processor_cost_status: "captured",
      fee_refund_policy_version: "fee-refunds-v1-approved",
    });
    claimOk();
    alreadyRefundedForItem(0); // item_1
    alreadyRefundedForItem(0); // item_2

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "full",
      case: "artist_cancellation",
    });

    expect(result.status).toBe("ok");
    expect(lastRefundCall().refund_application_fee).toBe(false);
    // Full refund -> whole fee (100) attributable; cost 40 retained, 60 margin returned.
    expect(mockStripe.applicationFees.createRefund).toHaveBeenCalledWith(
      "fee_test",
      { amount: 60 },
      expect.any(Object),
    );
    const orderCostUpdate = ops.find(
      (o) =>
        o.table === "orders" &&
        o.verb === "update" &&
        (o.payload as Record<string, unknown>).processor_cost_retained_minor !==
          undefined,
    );
    expect(orderCostUpdate?.payload).toEqual({
      processor_cost_retained_minor: 40,
    });
  });

  it("never retains the same processor cost twice across repeated refunds", async () => {
    setupOrder({
      goods_fee_amount: 1.0,
      processor_cost_minor: 40,
      processor_cost_status: "captured",
      processor_cost_retained_minor: 40, // already fully retained by a prior refund
      fee_refund_policy_version: "fee-refunds-v1-approved",
    });
    claimOk();
    alreadyRefundedForItem(0);

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "by_line",
      lines: [{ orderItemId: "item_1" }],
      case: "artist_cancellation",
    });

    expect(result.status).toBe("ok");
    // Nothing left to retain -> the fee is returned in full this time.
    expect(lastRefundCall().refund_application_fee).toBe(true);
    expect(mockStripe.applicationFees.createRefund).not.toHaveBeenCalled();
  });

  it("fails safe (returns the full fee) when the processor cost is unavailable, e.g. on an add-on order", async () => {
    // Add-on orders never get processor-cost columns populated (0139): both
    // stay at their defaults (null / 'pending').
    setupOrder({
      goods_fee_amount: 1.0,
      processor_cost_minor: null,
      processor_cost_status: "pending",
    });
    claimOk();
    alreadyRefundedForItem(0);
    alreadyRefundedForItem(0);

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "full",
      case: "artist_cancellation",
    });

    expect(result.status).toBe("ok");
    expect(lastRefundCall().refund_application_fee).toBe(true);
    expect(mockStripe.applicationFees.createRefund).not.toHaveBeenCalled();
  });
});

describe("refundGoodsOrderCore: historical purchases survive archival", () => {
  it("still refunds a line whose linked product was deleted (order_items keeps its own snapshot)", async () => {
    setupOrder();
    claimOk();
    const archivedItems = [
      { ...ITEMS[0], product_id: null }, // product hard-deleted; snapshot remains
      ITEMS[1],
    ];
    replies["order_items:select:list"] = [{ data: archivedItems }];
    alreadyRefundedForItem(0);

    const result = await refundGoodsOrderCore({
      artistId: "artist_1",
      orderId: "order_1",
      refundType: "by_line",
      lines: [{ orderItemId: "item_1" }],
      case: "voluntary_full",
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.refundedMinor).toBe(5000);
    // Restock is still ATTEMPTED with the snapshot data (product_id null);
    // order-fulfillment.ts's own classifier is what skips a null product_id,
    // proven in its own test file, not re-proven here.
    expect(mockExpand).toHaveBeenCalledWith([
      expect.objectContaining({ id: "item_1", product_id: null }),
    ]);
  });
});
