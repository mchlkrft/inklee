import { describe, it, expect, vi, beforeEach } from "vitest";

// restockInventory (goods refund, GC1 Phase 1): the inverse of decrementInventory.
// Adds refunded quantities back and clears the low-stock flag on product-level
// restocks. Null stock = unlimited (untouched).

const { mockServiceClient } = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: mockServiceClient }));

import { restockInventory, type PaidOrderItem } from "@/lib/order-fulfillment";

type Row = Record<string, unknown>;
let selectData: Record<string, Row | null>;
let updates: { table: string; payload: Row }[];

function chain(table: string) {
  const op: { payload?: Row } = {};
  const self: Record<string, unknown> = {
    select: () => self,
    update: (payload: Row) => {
      op.payload = payload;
      return self;
    },
    eq: () => self,
    single: () => Promise.resolve({ data: selectData[table] ?? null }),
    then: (
      onF: (v: { error: null }) => unknown,
      onR?: (e: unknown) => unknown,
    ) => {
      if (op.payload !== undefined)
        updates.push({ table, payload: op.payload });
      return Promise.resolve({ error: null }).then(onF, onR);
    },
  };
  return self;
}

beforeEach(() => {
  updates = [];
  selectData = {};
  mockServiceClient.from.mockImplementation((t: string) => chain(t));
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

describe("restockInventory", () => {
  it("adds quantity back to a tracked variant", async () => {
    selectData["product_variants"] = { stock_quantity: 2 };
    await restockInventory([item({ variant_id: "v1", quantity: 3 })]);
    expect(updates).toEqual([
      { table: "product_variants", payload: { stock_quantity: 5 } },
    ]);
  });

  it("adds quantity back to a product-level item AND clears the low-stock flag", async () => {
    selectData["products"] = { quantity: 1 };
    await restockInventory([item({ product_id: "p1", quantity: 2 })]);
    expect(updates).toEqual([
      {
        table: "products",
        payload: { quantity: 3, low_stock_alerted_at: null },
      },
    ]);
  });

  it("leaves unlimited (null) stock untouched", async () => {
    selectData["product_variants"] = { stock_quantity: null };
    selectData["products"] = { quantity: null };
    await restockInventory([
      item({ variant_id: "v1", quantity: 3 }),
      item({ product_id: "p1", quantity: 2 }),
    ]);
    expect(updates).toEqual([]);
  });

  it("skips non-positive quantities", async () => {
    selectData["products"] = { quantity: 5 };
    await restockInventory([
      item({ product_id: "p1", quantity: 0 }),
      item({ product_id: "p1", quantity: -2 }),
    ]);
    expect(updates).toEqual([]);
  });
});
