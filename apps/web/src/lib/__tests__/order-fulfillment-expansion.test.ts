import { describe, it, expect, vi, beforeEach } from "vitest";

// expandInventoryMovements (C4 / GC6): the ONE rule for which order lines move
// inventory, SHOP-FUL-001. Settlement and refund each used to decide for
// themselves (settle passed everything, refund filtered type='product'), which
// was latent while every line was a product and becomes one-way stock drift the
// moment a 'bundle' line exists. Both directions now expand through here, so
// this is the single place that classification is pinned.
//
// Real function, recording serviceClient double: the snapshot read is the only
// IO and its shape (which table, which filter) is part of what is under test.

const { mockServiceClient } = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: mockServiceClient }));

import {
  expandInventoryMovements,
  type InventoryOrderItem,
} from "@/lib/order-fulfillment";

type Reply = { data?: unknown; error?: unknown };
/** FIFO of snapshot-read replies. An UNQUEUED read answers {data: null}, which
 *  is indistinguishable from "the code never read"; `reads` below is what tells
 *  those apart, so every negative test asserts on it rather than on the output
 *  alone. */
let replies: Reply[] = [];
let reads: {
  table: string;
  columns: string;
  filters: Record<string, unknown>;
}[];

function chain(table: string) {
  const read = { table, columns: "", filters: {} as Record<string, unknown> };
  const self: Record<string, unknown> = {
    select: (columns: string) => {
      read.columns = columns;
      reads.push(read);
      return self;
    },
    eq: (column: string, value: unknown) => {
      read.filters[column] = value;
      return self;
    },
    then: (onF: (v: Reply) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(replies.shift() ?? { data: [], error: null }).then(
        onF,
        onR,
      ),
  };
  return self;
}

beforeEach(() => {
  vi.clearAllMocks();
  replies = [];
  reads = [];
  mockServiceClient.from.mockImplementation((t: string) => chain(t));
});

const line = (over: Partial<InventoryOrderItem>): InventoryOrderItem => ({
  id: null,
  bundle_id: null,
  product_id: null,
  variant_id: null,
  quantity: 1,
  type: "product",
  title_snapshot: "Thing",
  variant_snapshot: null,
  total_amount: 1000,
  ...over,
});

describe("expandInventoryMovements: line classification", () => {
  it("passes PRODUCT lines through as the very same objects, with no snapshot read", async () => {
    const a = line({ product_id: "p1", quantity: 2 });
    const b = line({ product_id: "p2", variant_id: "v2", quantity: 1 });

    const out = await expandInventoryMovements([a, b]);

    // Identity, not equality: callers (the refund audit's restocked_lines
    // count, and decrementInventory's variant branch) do their own bookkeeping
    // against these objects. Fails if the product branch rebuilds the row.
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(b);
    expect(reads).toEqual([]);
  });

  it("a DEPOSIT line moves nothing", async () => {
    const product = line({ product_id: "p1", quantity: 2 });
    // The product line is the positive control: without it, "moves nothing"
    // would also pass on a function that returned [] for everything.
    const out = await expandInventoryMovements([
      line({ type: "deposit", quantity: 1, total_amount: 10000 }),
      product,
    ]);
    // Fails if the classification widens to "everything that is not a bundle"
    // — the deposit line has neither product_id nor variant_id, so it reaches
    // decrementInventory and silently no-ops today, but it inflates the refund
    // audit's restocked_lines count and would move stock the day a deposit line
    // ever carries a product_id.
    expect(out).toEqual([product]);
    expect(reads).toEqual([]);
  });

  it("an UNKNOWN future line type moves nothing", async () => {
    const product = line({ product_id: "p1", quantity: 2 });
    const out = await expandInventoryMovements([
      line({ type: "shipping", quantity: 1 }),
      product,
    ]);
    // The rule is an allowlist, not a denylist: a line type added later moves
    // no stock until someone decides it should. Fails on the same widening.
    expect(out).toEqual([product]);
  });
});

describe("expandInventoryMovements: bundle expansion (0135 snapshot)", () => {
  const BUNDLE_LINE = line({
    id: "oi-bundle",
    bundle_id: "b1",
    type: "bundle",
    quantity: 3,
    title_snapshot: "Starter kit",
    total_amount: 120,
  });

  it("expands a bundle line to its snapshot components, multiplied by the LINE quantity", async () => {
    replies.push({
      data: [
        { product_id: "p1", title_snapshot: "Print", quantity: 1 },
        { product_id: "p2", title_snapshot: "Tee", quantity: 2 },
      ],
    });

    const out = await expandInventoryMovements([BUNDLE_LINE]);

    // Snapshot quantity is per ONE bundle; the line quantity is applied HERE so
    // decrement and restock cannot multiply differently (that asymmetry is the
    // whole reason this function exists). Fails if `* lineQty` is dropped: the
    // shop would decrement 1 and 2 for a three-bundle sale and quietly oversell
    // both components. Fails also if the bundle line is passed through
    // unexpanded, which is the pre-GC6 behaviour: bundle sales would move no
    // stock at settlement and none back on refund.
    expect(out).toEqual([
      {
        product_id: "p1",
        variant_id: null,
        quantity: 3, // 1 per bundle x 3 bundles
        type: "product",
        title_snapshot: "Print",
        variant_snapshot: null,
        total_amount: 0,
      },
      {
        product_id: "p2",
        variant_id: null,
        quantity: 6, // 2 per bundle x 3 bundles
        type: "product",
        title_snapshot: "Tee",
        variant_snapshot: null,
        total_amount: 0,
      },
    ]);
  });

  it("reads the SNAPSHOT table, scoped to this order item", async () => {
    replies.push({ data: [] });
    await expandInventoryMovements([BUNDLE_LINE]);
    // Fails if the read moves to the LIVE product_bundle_items join, which
    // mutates with the artist's edits and cascades away on product delete, so a
    // refund would restock whatever the bundle contains TODAY rather than what
    // was sold. Fails too if the eq is dropped, which would expand every bundle
    // sale in the table into one order's movements. Fails too (FD6) if
    // variant_id/variant_snapshot are dropped from the select: without them a
    // variant-bearing component's movement always lands in the product-level
    // branch downstream, decrementing/restocking the wrong counter.
    expect(reads).toEqual([
      {
        table: "order_item_bundle_components",
        columns:
          "product_id, variant_id, title_snapshot, variant_snapshot, quantity",
        filters: { order_item_id: "oi-bundle" },
      },
    ]);
  });

  it("FD6: passes the snapshot's variant_id and variant_snapshot through to the movement", async () => {
    replies.push({
      data: [
        {
          product_id: "p1",
          variant_id: "v1",
          title_snapshot: "Tee",
          variant_snapshot: "M",
          quantity: 1,
        },
      ],
    });

    const out = await expandInventoryMovements([BUNDLE_LINE]);

    // FAILS IF variant_id is hardcoded to null (the pre-FD6 behaviour): the
    // mover would take the PRODUCT branch instead of the VARIANT branch and
    // decrement/restock the parent's (untracked-by-design) quantity instead
    // of the sold variant's own stock counter.
    expect(out).toEqual([
      {
        product_id: "p1",
        variant_id: "v1",
        quantity: 3, // 1 per bundle x 3 bundles (BUNDLE_LINE.quantity)
        type: "product",
        title_snapshot: "Tee",
        variant_snapshot: "M",
        total_amount: 0,
      },
    ]);
  });

  it("FD6: a component whose variant was later deleted (SET NULL) carries variant_id null, not stale", async () => {
    replies.push({
      data: [
        {
          product_id: "p1",
          variant_id: null,
          title_snapshot: "Tee",
          variant_snapshot: "M", // the snapshot TEXT survives the FK's SET NULL
          quantity: 1,
        },
      ],
    });

    const out = await expandInventoryMovements([BUNDLE_LINE]);

    expect(out).toEqual([
      expect.objectContaining({
        product_id: "p1",
        variant_id: null,
        variant_snapshot: "M",
      }),
    ]);
  });

  it("skips a component whose product was deleted (product_id SET NULL)", async () => {
    replies.push({
      data: [
        { product_id: null, title_snapshot: "Deleted print", quantity: 1 },
        { product_id: "p2", title_snapshot: "Tee", quantity: 2 },
      ],
    });

    const out = await expandInventoryMovements([BUNDLE_LINE]);

    // The snapshot keeps the title/quantity record after a product delete so
    // history survives, but there is no row left to move stock on. Fails if the
    // guard goes: decrementInventory would take the `product_id` branch with
    // null and (today) no-op, while restockInventory does the same, so nothing
    // breaks loudly — it just quietly drops the surviving component too if the
    // null row ever throws first.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ product_id: "p2", quantity: 6 });
  });

  it("skips a bundle line with no order-item id, without reading anything", async () => {
    // No id means nothing to key the snapshot on. Reading with an undefined
    // filter against PostgREST is an UNFILTERED predicate, not a no-op, so this
    // must never reach the database.
    replies.push({
      data: [{ product_id: "p1", title_snapshot: "X", quantity: 1 }],
    });

    const out = await expandInventoryMovements([
      line({ id: null, bundle_id: "b1", type: "bundle", quantity: 2 }),
    ]);

    expect(out).toEqual([]);
    // The queued rows stayed unconsumed: proof the read never happened, rather
    // than the read happening and returning nothing.
    expect(reads).toEqual([]);
    expect(replies).toHaveLength(1);
  });

  it("skips a bundle line with a non-positive quantity, without reading anything", async () => {
    replies.push({
      data: [{ product_id: "p1", title_snapshot: "X", quantity: 1 }],
    });

    const out = await expandInventoryMovements([
      line({ id: "oi-zero", bundle_id: "b1", type: "bundle", quantity: 0 }),
    ]);

    // Fails if the lineQty guard goes: every component would expand to
    // quantity 0 rows, which decrementInventory skips but which still inflate
    // the refund audit's restocked_lines count with lines that moved nothing.
    expect(out).toEqual([]);
    expect(reads).toEqual([]);
    expect(replies).toHaveLength(1);
  });

  it("THROWS when the snapshot read fails, rather than silently moving nothing", async () => {
    replies.push({ data: null, error: { message: "permission denied" } });

    // Loud failure is the point: this function exists because a bundle sale
    // that silently moves no stock is invisible. The callers (settlement and
    // refund) each wrap it so the throw reaches Sentry without failing the
    // money path. Fails if the `if (error) throw` block is removed: `?? []`
    // below it turns the failed read into an empty component list and the sale
    // moves no stock at all, reporting success.
    await expect(expandInventoryMovements([BUNDLE_LINE])).rejects.toThrow(
      /order item oi-bundle/,
    );
  });

  it("mixes product lines and bundle expansions in one order", async () => {
    const product = line({ product_id: "p9", quantity: 1 });
    replies.push({
      data: [{ product_id: "p1", title_snapshot: "Print", quantity: 2 }],
    });

    const out = await expandInventoryMovements([product, BUNDLE_LINE]);

    expect(out).toHaveLength(2);
    expect(out[0]).toBe(product);
    expect(out[1]).toMatchObject({ product_id: "p1", quantity: 6 });
  });
});
