import { describe, it, expect, vi, beforeEach } from "vitest";

// reconcileVariants' removed-variant guard (FD6 fix). Before this file, the
// guard checked only booking_interests.variant_id and order_items.variant_id
// before hard-deleting a variant the artist removed from the form. Bundles
// (0135/0138) can sell a variant WITHOUT ever writing an order_items row for
// it — the sale lives in order_item_bundle_components' composition snapshot
// instead — so a variant sold only inside a bundle looked unreferenced and
// was hard-deleted. The FK's ON DELETE SET NULL (0138) then nulls the
// snapshot's variant_id, and a later refund's restock falls through to the
// product-level branch, which is untracked by convention for a
// variant-tracked product, and moves nothing back. Real function, recording
// serviceClient double: which tables are queried, and with what filter, is
// exactly what is under test.

const { mockServiceClient } = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: mockServiceClient }));

import { reconcileVariants } from "@/lib/server/goods-variants";

type Reply = { data?: unknown; error?: unknown; count?: number | null };
let replies: Record<string, Reply[]> = {};
function queue(key: string, ...rs: Reply[]) {
  replies[key] = [...(replies[key] ?? []), ...rs];
}
function nextReply(key: string): Reply {
  const q = replies[key];
  if (q && q.length > 0) return q.shift() as Reply;
  return { data: null, error: null };
}

type Op = {
  table: string;
  verb: string;
  filters: Record<string, unknown>;
  payload: unknown;
};
let ops: Op[] = [];

function chain(table: string, verb: string, payload: unknown) {
  const op: Op = { table, verb, filters: {}, payload };
  ops.push(op);
  const key = `${table}:${verb}`;
  const self: Record<string, unknown> = {
    select: () => self,
    eq: (c: string, v: unknown) => {
      op.filters[c] = v;
      return self;
    },
    then: (onF: (v: Reply) => unknown, onR?: (e: unknown) => unknown) =>
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
    update: (p: unknown) => chain(table, "update", p),
    insert: (p: unknown) => chain(table, "insert", p),
    delete: () => chain(table, "delete", null),
  }));
});

const PRODUCT = "p1";

function queueExisting(rows: { id: string; status: string }[]) {
  queue("product_variants:select", { data: rows });
}

describe("reconcileVariants: removed-variant reference guard", () => {
  it("hard-deletes a removed variant with NO references anywhere (positive control)", async () => {
    queueExisting([{ id: "v-gone", status: "active" }]);
    queue("booking_interests:select", { count: 0 });
    queue("order_items:select", { count: 0 });
    queue("order_item_bundle_components:select", { count: 0 });
    queue("product_variants:delete", { data: null });

    await reconcileVariants(PRODUCT, []); // artist removed the only variant

    // Without a positive control, "referenced -> hidden" tests below could
    // also pass on a function that hides every removed variant unconditionally.
    expect(
      ops.some((o) => o.table === "product_variants" && o.verb === "delete"),
    ).toBe(true);
    expect(
      ops.some((o) => o.table === "product_variants" && o.verb === "update"),
    ).toBe(false);
  });

  it("hides (never deletes) a removed variant referenced by a DIRECT order line (baseline, unchanged)", async () => {
    queueExisting([{ id: "v-sold-direct", status: "active" }]);
    queue("booking_interests:select", { count: 0 });
    queue("order_items:select", { count: 1 });
    queue("order_item_bundle_components:select", { count: 0 });
    queue("product_variants:update", { data: null });

    await reconcileVariants(PRODUCT, []);

    const upd = ops.find(
      (o) => o.table === "product_variants" && o.verb === "update",
    );
    expect(upd?.payload).toMatchObject({ status: "hidden" });
    expect(
      ops.some((o) => o.table === "product_variants" && o.verb === "delete"),
    ).toBe(false);
  });

  it("FD6: hides (never deletes) a removed variant sold ONLY inside a bundle", async () => {
    queueExisting([{ id: "v-sold-in-bundle", status: "active" }]);
    queue("booking_interests:select", { count: 0 });
    queue("order_items:select", { count: 0 }); // no DIRECT order line at all
    queue("order_item_bundle_components:select", { count: 1 }); // sold via bundle
    queue("product_variants:update", { data: null });

    await reconcileVariants(PRODUCT, []);

    // FAILS IF the order_item_bundle_components leg is removed (reverting to
    // the pre-fix two-leg check): the variant would be hard-deleted despite
    // being part of paid order history, and the FK's SET NULL would erase the
    // snapshot's variant_id, breaking a later refund's restock.
    const upd = ops.find(
      (o) => o.table === "product_variants" && o.verb === "update",
    );
    expect(upd?.payload).toMatchObject({ status: "hidden" });
    expect(
      ops.some((o) => o.table === "product_variants" && o.verb === "delete"),
    ).toBe(false);
  });

  it("scopes the bundle-components reference check to THIS variant's id", async () => {
    queueExisting([{ id: "v-x", status: "active" }]);
    queue("booking_interests:select", { count: 0 });
    queue("order_items:select", { count: 0 });
    queue("order_item_bundle_components:select", { count: 0 });
    queue("product_variants:delete", { data: null });

    await reconcileVariants(PRODUCT, []);

    const bundleRefCheck = ops.find(
      (o) => o.table === "order_item_bundle_components" && o.verb === "select",
    );
    expect(bundleRefCheck).toBeDefined();
    expect(bundleRefCheck!.filters).toEqual({ variant_id: "v-x" });
  });
});
