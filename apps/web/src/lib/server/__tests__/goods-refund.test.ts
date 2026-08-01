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
vi.mock("@/lib/order-fulfillment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/order-fulfillment")>()),
  // The stock MOVER is mocked; the expansion rule (expandInventoryMovements,
  // SHOP-FUL-001) stays REAL so its line classification is under test here.
  // Product-only fixtures pass through it without any DB read.
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
/** How many queued replies for `key` are still UNCONSUMED.
 *
 *  This is the anti-vacuity instrument (TEST-VAC-002). An unqueued key silently
 *  answers `{data: null}`, so a "did not restock" assertion passes both when the
 *  guard held AND when the guard was removed but the read came back empty. With
 *  rows queued, `pending(key) === 1` proves the code never performed the read at
 *  all, and the same rows are what a removed guard would have restocked. */
function pending(key: string): number {
  return replies[key]?.length ?? 0;
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

// Two lines, one of them variant-bearing, because restockInventory takes a
// different branch per line and a single unvarianted row would let a
// variant-blind restock pass.
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
  {
    product_id: "p2",
    variant_id: "v2",
    quantity: 1,
    type: "product",
    title_snapshot: "Tee",
    variant_snapshot: "L",
    total_amount: 25,
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

    // The lines are read for THIS order and for product lines only. Fails if
    // either .eq is dropped from the order_items read: without eq(order_id) a
    // refund restocks the whole table, without eq(type,'product') it tries to
    // restock the deposit line.
    const lineRead = ops.find(
      (o) => o.table === "order_items" && o.verb === "select",
    );
    expect(lineRead).toBeDefined();
    expect(lineRead!.filters.order_id).toBe("o1");
    // Round-2 verifier (SHOP-FUL-001 residual): the read carries NO type
    // filter, deliberately. Refund used to keep a second SQL classifier in
    // front of the one expansion rule, which settle does not have; a future
    // inventory-moving type would then be honoured on settle and silently
    // dropped here. expandInventoryMovements is the ONLY classifier on both
    // sides (it drops deposit/unknown lines itself — pinned by its own
    // suite). Fails if a type filter reappears on this read.
    expect(lineRead!.inFilter).toBeNull();
    expect(lineRead!.filters.type).toBeUndefined();
    // The queued rows were actually consumed: this is the positive control for
    // the two negative restock tests below, which assert the SAME rows stay
    // unconsumed. Fails if the read moves outside the flip gate and the rows
    // arrive somewhere else, or not at all.
    expect(pending("order_items:select")).toBe(0);

    // Restock receives the specific rows, not merely "was called". Fails if the
    // list is filtered, truncated, or passed as [] (the pre-TEST-VAC-002 state
    // this test could not distinguish from correct behaviour).
    expect(mockRestock).toHaveBeenCalledTimes(1);
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
          // The audit's own count must match the rows restocked. Fails if the
          // restock list and the reported number ever diverge.
          restocked_lines: 2,
          redemption_released: true,
        }),
      }),
    );
  });

  it("REDELIVERY: the lost flip skips restock and redemption release (once-only)", async () => {
    queue("orders:select", { data: ORDER });
    queue("orders:update", { data: [] }); // flip lost — another delivery won
    // TEST-VAC-002 instrument, revised for SHOP-FUL-002: the read + expansion
    // now deliberately run BEFORE the flip (so an expansion failure cannot
    // consume the once-only gate), which means the queued rows ARE consumed in
    // this lost-flip race window. The double-restock mutant is still killed,
    // now directly: the movements are in hand when the gate decides, so
    // removing the `if (!flipped || flipped.length === 0) return` line makes
    // restock fire with exactly these rows, and the not-called assertion goes
    // red. (A true redelivery in production exits earlier still, at the order
    // lookup, because the row is already `refunded` — the "no order" test.)
    queue("order_items:select", { data: PRODUCT_ITEMS });

    const outcome = await settleGoodsOrderRefund(fullCharge());
    expect(outcome).toBe("refunded");

    expect(pending("order_items:select")).toBe(0); // read pre-flip, by design
    expect(mockRestock).not.toHaveBeenCalled();

    expect(ops.find((o) => o.table === "discount_redemptions")).toBeUndefined();
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("SHOP-FUL-002: a snapshot read failure returns none WITHOUT consuming the flip", async () => {
    queue("orders:select", { data: ORDER });
    // A bundle line forces the expansion to read the 0135 snapshot; that read
    // errors. The expansion throws by design (a silent skip is the drift the
    // one-rule expansion exists to prevent).
    queue("order_items:select", {
      data: [
        {
          id: "oi9",
          bundle_id: "b1",
          product_id: null,
          variant_id: null,
          quantity: 1,
          type: "bundle",
          title_snapshot: "Starter kit",
          variant_snapshot: null,
          total_amount: 40,
        },
      ],
    });
    queue("order_item_bundle_components:select", {
      data: null,
      error: { message: "boom" },
    });

    const outcome = await settleGoodsOrderRefund(fullCharge());
    expect(outcome).toBe("none");

    // THE point of the fix: the once-only flip was never issued, so the order
    // is still `paid` and a redelivery or manual replay can settle everything
    // later. Fails if the expansion moves back below the flip (the pre-fix
    // shape): the update would be recorded here, the gate consumed, and the
    // restock + redemption release + audit lost with no retry path.
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "update"),
    ).toBeUndefined();
    expect(mockRestock).not.toHaveBeenCalled();
    expect(ops.find((o) => o.table === "discount_redemptions")).toBeUndefined();
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("FULL refund of a BUNDLE order: restocks the snapshot components, not the bundle line", async () => {
    queue("orders:select", { data: ORDER });
    queue("order_items:select", {
      data: [
        {
          id: "oi9",
          bundle_id: "b1",
          product_id: null,
          variant_id: null,
          quantity: 2, // two bundles bought
          type: "bundle",
          title_snapshot: "Starter kit",
          variant_snapshot: null,
          total_amount: 80,
        },
      ],
    });
    queue("order_item_bundle_components:select", {
      data: [
        { product_id: "p1", title_snapshot: "Print", quantity: 3 },
        { product_id: null, title_snapshot: "Deleted thing", quantity: 1 },
      ],
    });
    queue("orders:update", { data: [{ id: "o1" }] }); // flip won

    const outcome = await settleGoodsOrderRefund(fullCharge());
    expect(outcome).toBe("refunded");

    // The mover receives the EXPANDED component movement (3 per bundle x 2
    // bundles = 6), never the raw bundle line, and the deleted component is
    // skipped. Fails if the refund side stops expanding (the SHOP-FUL-001
    // one-way drift: decremented at settle, never restocked) or multiplies
    // wrongly.
    expect(mockRestock).toHaveBeenCalledTimes(1);
    expect(mockRestock).toHaveBeenCalledWith([
      expect.objectContaining({
        product_id: "p1",
        variant_id: null,
        quantity: 6,
        type: "product",
      }),
    ]);
    // The audit reports MOVEMENTS (what actually went back to stock).
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ restocked_lines: 1 }),
      }),
    );
  });

  it("PARTIAL refund: visibility-only (paid -> partially_refunded), no restock, no release", async () => {
    queue("orders:select", { data: ORDER });
    // TEST-VAC-002: same instrument as the redelivery test. On an entangled PI
    // a partial refund may be entirely the deposit's, so restocking goods here
    // would hand back stock for items the buyer still has. The rows are
    // present precisely so that mistake would be observable.
    queue("order_items:select", { data: PRODUCT_ITEMS });

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

    // Fails if restock/release is hoisted out of the `if (charge.refunded)`
    // branch to run on every refund event.
    expect(pending("order_items:select")).toBe(1);
    expect(ops.find((o) => o.table === "order_items")).toBeUndefined();
    expect(mockRestock).not.toHaveBeenCalled();
    expect(ops.find((o) => o.table === "discount_redemptions")).toBeUndefined();
    expect(mockWriteAudit).not.toHaveBeenCalled();
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
