import { describe, it, expect, vi, beforeEach } from "vitest";

// TEST-VAC-006 / SHOP-FUL-004: the stock movers' OBSERVABILITY.
//
// Both movers run AFTER a once-only flip (the settlement's pending -> paid
// gate, the refund's terminal-status gate), so neither can be retried: a
// failed stock write is permanent drift between the ledger and reality. The
// design decision is that the write stays best-effort — a failed decrement
// must not 500 a webhook whose money already moved — which means Sentry is
// the ONLY signal that anything went wrong. Deleting a capture site therefore
// changes nothing observable except the alert, and the round-3 verifier
// proved exactly that: mutation a8 (delete the product-level decrement
// capture) survived the full suite, and a repo-wide grep for
// reportStockWriteFailure or either tag across test files returned nothing.
// Nothing observed the observer.
//
// This file is what unblocks SHOP-FUL-004's BEHAVIOURAL verification: until
// these existed, the fix was correct by reading only.
//
// Real movers, recording serviceClient double. The stock READ succeeds and
// the WRITE fails, which is the shape that matters: a failed read skips the
// write entirely (the `if (v && ...)` / `if (p && ...)` guards) and reports
// nothing by design, so a test driving the read into failure would assert the
// absence of a capture and pass with every capture site deleted.

const { mockServiceClient, mockCaptureException } = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
  mockCaptureException: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({ serviceClient: mockServiceClient }));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
  captureMessage: vi.fn(),
}));

import {
  decrementInventory,
  restockInventory,
  type PaidOrderItem,
} from "@/lib/order-fulfillment";

// --- Recording double, keyed replies per table:verb ------------------------

type Reply = { data?: unknown; error?: unknown };
let replies: Record<string, Reply[]> = {};
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

function chain(table: string, verb: string, payload: unknown) {
  const op: RecordedOp = { table, verb, payload, filters: {} };
  ops.push(op);
  const key = `${table}:${verb}`;
  const self = {
    select: () => self,
    eq: (column: string, value: unknown) => {
      op.filters[column] = value;
      return self;
    },
    is: (column: string, value: unknown) => {
      op.filters[column] = value;
      return self;
    },
    single: () => Promise.resolve(nextReply(key)),
    maybeSingle: () => Promise.resolve(nextReply(key)),
    then: (onF?: (v: Reply) => unknown, onR?: (r: unknown) => unknown) =>
      Promise.resolve(nextReply(key)).then(onF, onR),
  };
  return self;
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  replies = {};
  mockServiceClient.from.mockImplementation((table: string) => ({
    select: () => chain(table, "select", null),
    update: (payload: unknown) => chain(table, "update", payload),
    insert: (payload: unknown) => chain(table, "insert", payload),
  }));
});

const item = (over: Partial<PaidOrderItem>): PaidOrderItem => ({
  product_id: null,
  variant_id: null,
  quantity: 1,
  type: "product",
  title_snapshot: "Thing",
  variant_snapshot: null,
  total_amount: 1000,
  ...over,
});

/** A PostgREST-shaped write rejection. Not an Error instance on purpose: that
 *  is what the movers really receive, and `reportStockWriteFailure` has to
 *  wrap it (`new Error(JSON.stringify(error))`) before Sentry will accept it.
 *  Handing the movers a real Error here would skip the wrap and leave that
 *  branch untested. */
const RLS_DENIED = { code: "42501", message: "permission denied for table" };

/** The single captured call, asserted to be the only one. Several tests turn
 *  on "exactly one alert fired", which a `.find()` would quietly hide. */
function onlyCapture(): { error: Error; context: unknown } {
  expect(mockCaptureException).toHaveBeenCalledTimes(1);
  const [error, context] = mockCaptureException.mock.calls[0] as [
    Error,
    unknown,
  ];
  return { error, context };
}

describe("decrementInventory: a failed stock write is REPORTED (SHOP-FUL-004)", () => {
  it("captures with the inventory_decrement tag and the VARIANT id when the variant write fails", async () => {
    queue("product_variants:select", { data: { stock_quantity: 5 } });
    queue("product_variants:update", { data: null, error: RLS_DENIED });

    await decrementInventory([
      item({ product_id: "p1", variant_id: "v1", quantity: 3 }),
    ]);

    // The write was genuinely attempted: without this the assertions below
    // would also pass on a mover that captured without ever writing.
    const write = ops.find(
      (o) => o.table === "product_variants" && o.verb === "update",
    );
    expect(write!.payload).toEqual({ stock_quantity: 2 }); // 5 - 3
    expect(write!.filters).toEqual({ id: "v1" });

    // Fails if the `if (error) reportStockWriteFailure(...)` block is deleted
    // from the variant decrement branch. Nothing else in the system changes
    // when it goes: the mover still returns normally, the webhook still
    // answers 200, the sale still completes. The only difference is that a
    // variant silently keeps stock it no longer has, forever, and the first
    // person to notice is a buyer ordering something that is gone.
    const { error, context } = onlyCapture();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("42501");
    // Exact, not a subset. The TAG is what routes the alert (a decrement
    // reported under the restock tag points an investigation at the wrong
    // money path), and the ID is the only thing that makes the alert
    // actionable — a capture with no id says "some stock is wrong somewhere".
    expect(context).toEqual({
      tags: { action: "inventory_decrement" },
      extra: { variantId: "v1", qty: 3 },
    });
  });

  it("captures with the inventory_decrement tag and the PRODUCT id when the product-level write fails", async () => {
    // Mutation a8's exact site: this is the capture the round-3 verifier
    // deleted and watched the whole suite stay green.
    queue("products:select", { data: { quantity: 4 } });
    queue("products:update", { data: null, error: RLS_DENIED });
    // checkLowStock's own read, which still runs after the failed write.
    queue("products:select", { data: null });

    await decrementInventory([item({ product_id: "p1", quantity: 3 })]);

    const write = ops.find(
      (o) => o.table === "products" && o.verb === "update",
    );
    expect(write!.payload).toEqual({ quantity: 1 }); // 4 - 3
    expect(write!.filters).toEqual({ id: "p1" });

    const { error, context } = onlyCapture();
    expect(error.message).toContain("42501");
    expect(context).toEqual({
      tags: { action: "inventory_decrement" },
      extra: { productId: "p1", qty: 3 },
    });
  });

  it("a SUCCESSFUL write reports nothing", async () => {
    // The positive control for both tests above. Without it, a mover that
    // captured unconditionally — on every write, success or not — would pass
    // them and bury the real failures in noise, which is the same outcome as
    // no alerting at all.
    queue("products:select", { data: { quantity: 4 } });
    queue("products:update", { data: null, error: null });
    queue("products:select", { data: null });

    await decrementInventory([item({ product_id: "p1", quantity: 3 })]);

    expect(
      ops.find((o) => o.table === "products" && o.verb === "update"),
    ).toBeDefined();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

describe("restockInventory: a failed stock write is REPORTED (SHOP-FUL-004)", () => {
  it("captures with the inventory_restock tag and the PRODUCT id when the product-level write fails", async () => {
    queue("products:select", { data: { quantity: 4 } });
    queue("products:update", { data: null, error: RLS_DENIED });

    await restockInventory([item({ product_id: "p1", quantity: 3 })]);

    const write = ops.find(
      (o) => o.table === "products" && o.verb === "update",
    );
    // 4 + 3, and the low-stock stamp cleared so a later run-down re-alerts.
    expect(write!.payload).toEqual({
      quantity: 7,
      low_stock_alerted_at: null,
    });

    // The restock side is the WORSE half to lose: it runs after a refund the
    // buyer has already been given, so the goods are back on the shelf while
    // the ledger still says they are sold. Fails if this capture is deleted.
    const { error, context } = onlyCapture();
    expect(error.message).toContain("42501");
    // `inventory_restock`, not `inventory_decrement`. Fails if the two movers
    // are ever given the same tag: the alert would no longer say which
    // direction the drift went, and the two are repaired differently.
    expect(context).toEqual({
      tags: { action: "inventory_restock" },
      extra: { productId: "p1", qty: 3 },
    });
  });

  it("captures with the inventory_restock tag and the VARIANT id when the variant write fails", async () => {
    queue("product_variants:select", { data: { stock_quantity: 5 } });
    queue("product_variants:update", { data: null, error: RLS_DENIED });

    await restockInventory([
      item({ product_id: "p1", variant_id: "v1", quantity: 3 }),
    ]);

    const write = ops.find(
      (o) => o.table === "product_variants" && o.verb === "update",
    );
    expect(write!.payload).toEqual({ stock_quantity: 8 }); // 5 + 3

    const { error, context } = onlyCapture();
    expect(error.message).toContain("42501");
    expect(context).toEqual({
      tags: { action: "inventory_restock" },
      extra: { variantId: "v1", qty: 3 },
    });
  });

  it("a SUCCESSFUL restock reports nothing", async () => {
    queue("product_variants:select", { data: { stock_quantity: 5 } });
    queue("product_variants:update", { data: null, error: null });

    await restockInventory([
      item({ product_id: "p1", variant_id: "v1", quantity: 3 }),
    ]);

    expect(
      ops.find((o) => o.table === "product_variants" && o.verb === "update"),
    ).toBeDefined();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
