import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_OVERRIDES, type AccountOverrides } from "@/lib/entitlements";

// The bundles server boundary (Plus build, Stage 3). Same discipline as the
// collections cores: the entitlement is refused server-side, every write is
// artist-scoped, and the public read fails FLAT. The gate is the REAL one
// (goodsBundlesAllowed composed with the entitlement engine); only the account
// read and the kill switch are mocked. Highest-value invariants pinned here:
//
//  1. Every write core refuses a lapsed-to-Free artist BEFORE touching the DB.
//  2. deleteBundleCore is ARCHIVE-FIRST (B4): a live bundle is not_eligible,
//     only an archived one deletes. No emptiness subquery, so no #19 race.
//  3. The item cap is enforced server-side, not just in the editor.
//  4. publicBundlesForArtist fails flat (entitlement throw / read error -> []).

const getAccountOverrides = vi.fn();
let disabledCapabilities: string[] = [];
const isCapabilityDisabled = vi.fn((c: string) =>
  disabledCapabilities.includes(c),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/app-config", () => ({
  isCapabilityDisabled: (c: string) => isCapabilityDisabled(c),
}));

import {
  saveBundleCore,
  reorderBundlesCore,
  setBundleArchivedCore,
  deleteBundleCore,
  addProductToBundleCore,
  removeProductFromBundleCore,
  setBundleItemsCore,
  customMadeChangeBundleConflicts,
  publicBundlesForArtist,
  type BundleWriteResult,
} from "@/lib/server/bundles";

type Reply = { data?: unknown; error?: unknown; count?: number | null };

type RecordedOp = {
  table: string;
  verb: "select" | "insert" | "update" | "delete";
  payload: Record<string, unknown> | null;
  filters: Record<string, unknown>;
  /** `.is(col, v)` — a SEPARATE bucket from `.eq`, on purpose (FD6). PostgREST
   *  treats `col=eq.null` and `col=is.null` as different predicates and only
   *  the latter matches a null column; a test asserting on `.filters` alone
   *  cannot tell "matched with IS" from "matched with EQ", which is exactly
   *  the distinction a null-variant bundle slot depends on. */
  isFilters: Record<string, unknown>;
  inFilter: { column: string; values: unknown[] } | null;
};

let ops: RecordedOp[] = [];
let replies: Record<string, Reply[]> = {};

function queue(key: string, ...rs: Reply[]) {
  replies[key] = [...(replies[key] ?? []), ...rs];
}
function nextReply(key: string): Reply {
  const q = replies[key];
  if (q && q.length > 0) return q.shift() as Reply;
  return { data: null, error: null };
}

interface Chain extends PromiseLike<Reply> {
  select(columns?: string, opts?: unknown): Chain;
  eq(column: string, value: unknown): Chain;
  is(column: string, value: unknown): Chain;
  not(column: string, op: string, value: unknown): Chain;
  in(column: string, values: unknown[]): Chain;
  order(column?: string, opts?: unknown): Chain;
  limit(n: number): Chain;
  maybeSingle(): Promise<Reply>;
  single(): Promise<Reply>;
}

function makeChain(op: RecordedOp): Chain {
  const key = `${op.table}:${op.verb}`;
  const self: Chain = {
    select: () => self,
    eq: (c, v) => {
      op.filters[c] = v;
      return self;
    },
    is: (c, v) => {
      op.isFilters[c] = v;
      return self;
    },
    not: (c, o, v) => {
      op.filters[`not:${c}`] = `${o}:${String(v)}`;
      return self;
    },
    in: (c, values) => {
      op.inFilter = { column: c, values };
      return self;
    },
    order: () => self,
    limit: () => self,
    maybeSingle: () => Promise.resolve(nextReply(key)),
    single: () => Promise.resolve(nextReply(key)),
    then: (onF, onR) => Promise.resolve(nextReply(key)).then(onF, onR),
  };
  return self;
}

function start(
  table: string,
  verb: RecordedOp["verb"],
  payload: Record<string, unknown> | null,
): Chain {
  const op: RecordedOp = {
    table,
    verb,
    payload,
    filters: {},
    isFilters: {},
    inFilter: null,
  };
  ops.push(op);
  return makeChain(op);
}

const supabase = {
  from: (table: string) => ({
    select: () => start(table, "select", null),
    insert: (p: Record<string, unknown>) => start(table, "insert", p),
    update: (p: Record<string, unknown>) => start(table, "update", p),
    delete: () => start(table, "delete", null),
  }),
} as unknown as SupabaseClient;

const ARTIST = "artist-1";
const B = "product_bundles";
const ITEMS = "product_bundle_items";

const PLUS: AccountOverrides = { ...DEFAULT_OVERRIDES, planTier: "plus" };
const LAPSED_TO_FREE: AccountOverrides = {
  ...DEFAULT_OVERRIDES,
  planTier: "plus",
  planExpiresAt: "2020-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  replies = {};
  getAccountOverrides.mockResolvedValue(PLUS);
  disabledCapabilities = [];
});

const WRITE_CORES: Array<
  [string, (s: SupabaseClient) => Promise<BundleWriteResult>]
> = [
  [
    "saveBundleCore",
    (s) => saveBundleCore(s, ARTIST, { name: "Kit", priceAmount: 40 }),
  ],
  ["reorderBundlesCore", (s) => reorderBundlesCore(s, ARTIST, ["b1"])],
  [
    "setBundleArchivedCore",
    (s) => setBundleArchivedCore(s, ARTIST, "b1", true),
  ],
  ["deleteBundleCore", (s) => deleteBundleCore(s, ARTIST, "b1")],
  [
    "addProductToBundleCore",
    (s) => addProductToBundleCore(s, ARTIST, "b1", "p1"),
  ],
  [
    "removeProductFromBundleCore",
    (s) => removeProductFromBundleCore(s, ARTIST, "b1", "p1"),
  ],
  [
    "setBundleItemsCore",
    (s) =>
      setBundleItemsCore(s, ARTIST, "b1", [{ productId: "p1", quantity: 1 }]),
  ],
];

describe("the entitlement gate on every write core", () => {
  it.each(WRITE_CORES)(
    "%s refuses a lapsed-to-Free artist before touching the database",
    async (_name, call) => {
      getAccountOverrides.mockResolvedValue(LAPSED_TO_FREE);
      const r = await call(supabase);
      expect(r).toEqual({
        ok: false,
        code: "not_entitled",
        error: "Bundles aren't included in your current plan.",
      });
      expect(ops).toEqual([]);
    },
  );

  it.each(WRITE_CORES)(
    "%s refuses rather than failing open when the plan cannot be read",
    async (_name, call) => {
      getAccountOverrides.mockRejectedValue(new Error("db down"));
      const r = await call(supabase);
      expect(r).toEqual({
        ok: false,
        code: "failed",
        error: "Couldn't verify your plan. Please try again.",
      });
      expect(ops).toEqual([]);
    },
  );

  it("refuses an entitled artist while the capability is paused", async () => {
    disabledCapabilities = ["goods_bundles"];
    const r = await saveBundleCore(supabase, ARTIST, {
      name: "Kit",
      priceAmount: 40,
    });
    expect(r).toMatchObject({ ok: false, code: "not_entitled" });
    expect(ops).toEqual([]);
  });
});

describe("saveBundleCore", () => {
  it("rejects an invalid name and never writes", async () => {
    const r = await saveBundleCore(supabase, ARTIST, {
      name: "a",
      priceAmount: 40,
    });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(ops).toEqual([]);
  });

  it("rejects an invalid price and never writes", async () => {
    const r = await saveBundleCore(supabase, ARTIST, {
      name: "Kit",
      priceAmount: "-5",
    });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(ops).toEqual([]);
  });

  it("inserts a new bundle with artist_id, price and a position", async () => {
    queue(`${B}:select`, { data: { position: 2 } }); // nextBundlePosition
    queue(`${B}:insert`, { data: { id: "b9" } });
    const r = await saveBundleCore(supabase, ARTIST, {
      name: "Winter kit",
      priceAmount: "40,00",
    });
    expect(r).toEqual({ ok: true, id: "b9" });
    const insert = ops.find((o) => o.table === B && o.verb === "insert");
    expect(insert?.payload).toMatchObject({
      artist_id: ARTIST,
      name: "Winter kit",
      price_amount: 40,
      position: 3,
      is_public_visible: true,
    });
  });

  it("updates sparsely: a visibility toggle does not rewrite name or price", async () => {
    queue(`${B}:update`, { data: { id: "b1" } });
    const r = await saveBundleCore(
      supabase,
      ARTIST,
      { isPublicVisible: false },
      "b1",
    );
    expect(r).toEqual({ ok: true, id: "b1" });
    const upd = ops.find((o) => o.table === B && o.verb === "update");
    expect(upd?.payload).toHaveProperty("is_public_visible", false);
    expect(upd?.payload).not.toHaveProperty("name");
    expect(upd?.payload).not.toHaveProperty("price_amount");
    expect(upd?.filters).toMatchObject({ id: "b1", artist_id: ARTIST });
  });
});

describe("deleteBundleCore is archive-first (B4)", () => {
  it("refuses a LIVE bundle with not_eligible (no emptiness check)", async () => {
    queue(`${B}:delete`, { data: null }); // archived-only delete matched nothing
    queue(`${B}:select`, { data: { archived_at: null } }); // it exists and is live
    const r = await deleteBundleCore(supabase, ARTIST, "b1");
    expect(r).toMatchObject({ ok: false, code: "not_eligible" });
    // The delete was gated on archived_at, never on item emptiness.
    const del = ops.find((o) => o.table === B && o.verb === "delete");
    expect(del?.filters).toHaveProperty("not:archived_at");
    expect(del?.filters).toMatchObject({ id: "b1", artist_id: ARTIST });
  });

  it("deletes an ARCHIVED bundle", async () => {
    queue(`${B}:delete`, { data: { id: "b1" } });
    const r = await deleteBundleCore(supabase, ARTIST, "b1");
    expect(r).toEqual({ ok: true, id: "b1" });
  });

  it("reports gone when the bundle does not exist", async () => {
    queue(`${B}:delete`, { data: null });
    queue(`${B}:select`, { data: null });
    const r = await deleteBundleCore(supabase, ARTIST, "b1");
    expect(r).toMatchObject({ ok: false, code: "failed" });
  });
});

describe("addProductToBundleCore", () => {
  it("enforces the item cap server-side", async () => {
    queue(`${ITEMS}:select`, { data: null }); // not already in the bundle
    // ONE read now answers both "how full" and "which products" (counsel Q2),
    // so the cap is counted off the rows rather than a head count.
    queue(`${ITEMS}:select`, {
      data: Array.from({ length: 50 }, (_, i) => ({ product_id: `p${i}` })),
    });
    const r = await addProductToBundleCore(supabase, ARTIST, "b1", "p1");
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    // No insert happened.
    expect(ops.some((o) => o.table === ITEMS && o.verb === "insert")).toBe(
      false,
    );
  });

  it("is idempotent: adding an existing product is a no-op success", async () => {
    queue(`${ITEMS}:select`, { data: { id: "it1" } });
    const r = await addProductToBundleCore(supabase, ARTIST, "b1", "p1");
    expect(r).toEqual({ ok: true, id: "it1" });
    expect(ops.some((o) => o.verb === "insert")).toBe(false);
  });

  it("inserts with artist_id, quantity and a position", async () => {
    queue(`${ITEMS}:select`, { data: null }); // not present
    queue(`${ITEMS}:select`, { count: 1 }); // under cap
    queue(`${ITEMS}:select`, { data: { position: 4 } }); // last position
    queue(`${ITEMS}:insert`, { data: { id: "it9" } });
    const r = await addProductToBundleCore(supabase, ARTIST, "b1", "p2", 3);
    expect(r).toEqual({ ok: true, id: "it9" });
    const ins = ops.find((o) => o.table === ITEMS && o.verb === "insert");
    expect(ins?.payload).toMatchObject({
      bundle_id: "b1",
      product_id: "p2",
      variant_id: null,
      artist_id: ARTIST,
      quantity: 3,
      position: 5,
    });
  });

  it("FD6: inserts with the declared variant_id, and idempotency is scoped to (product, variant)", async () => {
    queue(`${ITEMS}:select`, { data: null }); // not present at this variant
    queue(`${ITEMS}:select`, { count: 1 });
    queue(`${ITEMS}:select`, { data: { position: 0 } });
    queue(`${ITEMS}:insert`, { data: { id: "it10" } });
    const r = await addProductToBundleCore(
      supabase,
      ARTIST,
      "b1",
      "p2",
      1,
      "v1",
    );
    expect(r).toEqual({ ok: true, id: "it10" });
    const ins = ops.find((o) => o.table === ITEMS && o.verb === "insert");
    expect(ins?.payload).toMatchObject({ product_id: "p2", variant_id: "v1" });

    // The idempotency read is scoped by variant: FAILS IF it matches on
    // product_id alone, which would report "already added" for a DIFFERENT
    // variant of the same product and silently drop the second variant.
    const existingRead = ops.find(
      (o) => o.table === ITEMS && o.verb === "select",
    );
    expect(existingRead?.filters).toMatchObject({
      bundle_id: "b1",
      product_id: "p2",
      variant_id: "v1",
    });
  });
});

describe("setBundleItemsCore syncs the full item list", () => {
  it("adds wanted, updates held, removes the rest", async () => {
    queue(`${B}:select`, { data: { id: "b1" } }); // bundle owned
    queue(`${ITEMS}:select`, {
      data: [{ product_id: "pKeep" }, { product_id: "pDrop" }],
    });
    queue(`${ITEMS}:update`, { data: { id: "u1" } }); // pKeep updated
    queue(`${ITEMS}:insert`, { data: { id: "i1" } }); // pNew inserted
    queue(`${ITEMS}:delete`, { data: null }); // pDrop removed
    const r = await setBundleItemsCore(supabase, ARTIST, "b1", [
      { productId: "pKeep", quantity: 2 },
      { productId: "pNew", quantity: 1 },
    ]);
    expect(r).toEqual({ ok: true, id: "b1" });
    expect(ops.some((o) => o.table === ITEMS && o.verb === "update")).toBe(
      true,
    );
    expect(ops.some((o) => o.table === ITEMS && o.verb === "insert")).toBe(
      true,
    );
    const del = ops.find((o) => o.table === ITEMS && o.verb === "delete");
    expect(del?.filters).toMatchObject({
      product_id: "pDrop",
      artist_id: ARTIST,
    });
  });

  it("fails cleanly when the bundle is not owned", async () => {
    queue(`${B}:select`, { data: null });
    const r = await setBundleItemsCore(supabase, ARTIST, "b1", [
      { productId: "p1", quantity: 1 },
    ]);
    expect(r).toMatchObject({ ok: false, code: "failed" });
  });

  // FD6: identity is (product, variant), not product alone — a product can
  // legitimately appear twice in one bundle at two different variants.

  it("FD6: keeps the SAME product twice as two distinct slots when the variants differ", async () => {
    queue(`${B}:select`, { data: { id: "b1" } });
    queue(`${ITEMS}:select`, { data: [] }); // nothing held yet
    queue(`${ITEMS}:insert`, { data: null }); // slot 1 (variant v1)
    queue(`${ITEMS}:insert`, { data: null }); // slot 2 (variant v2)
    const r = await setBundleItemsCore(supabase, ARTIST, "b1", [
      { productId: "p1", quantity: 1, variantId: "v1" },
      { productId: "p1", quantity: 1, variantId: "v2" },
    ]);
    expect(r).toEqual({ ok: true, id: "b1" });
    // FAILS IF de-duping keys on productId alone: the second slot would be
    // dropped as a "duplicate" of the first, and the bundle could never carry
    // two variants of the same product — exactly what FD6 requires it can.
    const inserts = ops.filter((o) => o.table === ITEMS && o.verb === "insert");
    expect(inserts).toHaveLength(2);
    expect(
      inserts.map((i) => (i.payload as Record<string, unknown>).variant_id),
    ).toEqual(["v1", "v2"]);
  });

  it("FD6: de-dupes a repeated (product, SAME variant) pair, keeping the first", async () => {
    queue(`${B}:select`, { data: { id: "b1" } });
    queue(`${ITEMS}:select`, { data: [] });
    queue(`${ITEMS}:insert`, { data: null });
    const r = await setBundleItemsCore(supabase, ARTIST, "b1", [
      { productId: "p1", quantity: 1, variantId: "v1" },
      { productId: "p1", quantity: 9, variantId: "v1" }, // same slot again
    ]);
    expect(r).toEqual({ ok: true, id: "b1" });
    const inserts = ops.filter((o) => o.table === ITEMS && o.verb === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.payload).toMatchObject({ quantity: 1 }); // first kept
  });

  it("FD6: updates a HELD variant slot by (product, variant), not by product alone", async () => {
    queue(`${B}:select`, { data: { id: "b1" } });
    // Two EXISTING slots for the same product, at different variants.
    queue(`${ITEMS}:select`, {
      data: [
        { product_id: "p1", variant_id: "v1" },
        { product_id: "p1", variant_id: "v2" },
      ],
    });
    queue(`${ITEMS}:update`, { data: { id: "u1" } });
    queue(`${ITEMS}:delete`, { data: null }); // v2 slot dropped
    const r = await setBundleItemsCore(supabase, ARTIST, "b1", [
      { productId: "p1", quantity: 5, variantId: "v1" },
    ]);
    expect(r).toEqual({ ok: true, id: "b1" });
    // FAILS IF the held-lookup key drops variant_id: the v1 update could
    // instead match (and silently "update") the v2 row, or the v2 removal
    // could delete BOTH rows by matching on product_id alone.
    const upd = ops.find((o) => o.table === ITEMS && o.verb === "update");
    expect(upd?.filters).toMatchObject({
      bundle_id: "b1",
      product_id: "p1",
      variant_id: "v1",
      artist_id: ARTIST,
    });
    const del = ops.find((o) => o.table === ITEMS && o.verb === "delete");
    expect(del?.filters).toMatchObject({
      bundle_id: "b1",
      product_id: "p1",
      variant_id: "v2",
      artist_id: ARTIST,
    });
  });

  it("FD6: a null-variant slot is matched with IS, not EQ", async () => {
    queue(`${B}:select`, { data: { id: "b1" } });
    queue(`${ITEMS}:select`, {
      data: [{ product_id: "p1", variant_id: null }],
    });
    queue(`${ITEMS}:update`, { data: { id: "u1" } });
    const r = await setBundleItemsCore(supabase, ARTIST, "b1", [
      { productId: "p1", quantity: 2 }, // variantId omitted -> null
    ]);
    expect(r).toEqual({ ok: true, id: "b1" });
    // `.eq("variant_id", null)` and `.is("variant_id", null)` are DIFFERENT
    // PostgREST predicates; only `.is` matches a null column, so this MUST
    // land in isFilters, not filters. FAILS IF the null branch calls `.eq`
    // instead of `.is` (byVariant's whole reason to exist): in production
    // that update would match zero rows and silently no-op.
    const upd = ops.find((o) => o.table === ITEMS && o.verb === "update");
    expect(upd?.isFilters).toMatchObject({ variant_id: null });
    expect(upd?.filters).toMatchObject({ product_id: "p1" });
    expect(upd?.filters).not.toHaveProperty("variant_id");
  });
});

// ---------------------------------------------------------------------------
// Counsel Q2 (2026-08-02): a bundle is ALL custom-made or ALL standard. The
// withdrawn rule ("any custom-made component makes the whole bundle
// non-returnable") suppressed a real return right on the standard components,
// so the mix is refused at the write path instead of being disclosed away.

const PRODUCTS = "products";
const MIXED = "A bundle has to be all custom-made products";

describe("counsel Q2: the composition rule at the write path", () => {
  it("setBundleItemsCore SAVES an all-custom-made list, and an all-standard one", async () => {
    // The DISTINCTION control, first and deliberately: a gate that refused
    // every custom-made product would satisfy the refusal test below while
    // making custom-made products unbundleable, and three fixes shipped that
    // way before this control was demanded.
    for (const flag of [true, false]) {
      ops = [];
      replies = {};
      queue(`${B}:select`, { data: { id: "b1" } });
      queue(`${PRODUCTS}:select`, {
        data: [
          { id: "p1", custom_made: flag },
          { id: "p2", custom_made: flag },
        ],
      });
      queue(`${ITEMS}:select`, { data: [] });
      queue(`${ITEMS}:insert`, { data: null });
      queue(`${ITEMS}:insert`, { data: null });
      const r = await setBundleItemsCore(supabase, ARTIST, "b1", [
        { productId: "p1", quantity: 1 },
        { productId: "p2", quantity: 1 },
      ]);
      expect(r).toEqual({ ok: true, id: "b1" });
      expect(
        ops.filter((o) => o.table === ITEMS && o.verb === "insert"),
      ).toHaveLength(2);
    }
  });

  it("setBundleItemsCore REFUSES a mixed list and writes nothing", async () => {
    queue(`${B}:select`, { data: { id: "b1" } });
    queue(`${PRODUCTS}:select`, {
      data: [
        { id: "p1", custom_made: true },
        { id: "p2", custom_made: false },
      ],
    });
    const r = await setBundleItemsCore(supabase, ARTIST, "b1", [
      { productId: "p1", quantity: 1 },
      { productId: "p2", quantity: 1 },
    ]);
    // FAILS IF the composition gate is removed: every other rule here passes
    // (owned bundle, under cap, no variant needed), so the mix would save.
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect((r as { error: string }).error).toContain(MIXED);
    // Refused BEFORE any item row is touched, so a rejected save cannot leave
    // the bundle half-rewritten.
    expect(ops.some((o) => o.table === ITEMS)).toBe(false);
  });

  it("setBundleItemsCore scopes the flag read to the artist and to the wanted products", async () => {
    queue(`${B}:select`, { data: { id: "b1" } });
    queue(`${PRODUCTS}:select`, {
      data: [
        { id: "p1", custom_made: false },
        { id: "p2", custom_made: false },
      ],
    });
    queue(`${ITEMS}:select`, { data: [] });
    queue(`${ITEMS}:insert`, { data: null });
    queue(`${ITEMS}:insert`, { data: null });
    await setBundleItemsCore(supabase, ARTIST, "b1", [
      { productId: "p1", quantity: 1 },
      { productId: "p2", quantity: 1 },
    ]);
    const read = ops.find((o) => o.table === PRODUCTS && o.verb === "select");
    // FAILS IF the read drops the artist filter: another artist's product
    // flags would decide this artist's composition.
    expect(read?.filters).toMatchObject({ artist_id: ARTIST });
    expect(read?.inFilter).toEqual({ column: "id", values: ["p1", "p2"] });
  });

  it("setBundleItemsCore does not ask the database about a single product", async () => {
    queue(`${B}:select`, { data: { id: "b1" } });
    queue(`${ITEMS}:select`, { data: [] });
    queue(`${ITEMS}:insert`, { data: null });
    queue(`${ITEMS}:insert`, { data: null });
    // FD6: one product at two variants is two slots but ONE product, and one
    // product cannot disagree with itself.
    const r = await setBundleItemsCore(supabase, ARTIST, "b1", [
      { productId: "p1", quantity: 1, variantId: "v1" },
      { productId: "p1", quantity: 1, variantId: "v2" },
    ]);
    expect(r).toEqual({ ok: true, id: "b1" });
    expect(ops.some((o) => o.table === PRODUCTS)).toBe(false);
  });

  it("setBundleItemsCore fails CLOSED when the flags cannot be read", async () => {
    queue(`${B}:select`, { data: { id: "b1" } });
    queue(`${PRODUCTS}:select`, { error: { message: "boom" } });
    const r = await setBundleItemsCore(supabase, ARTIST, "b1", [
      { productId: "p1", quantity: 1 },
      { productId: "p2", quantity: 1 },
    ]);
    expect(r).toMatchObject({ ok: false, code: "failed" });
    expect(ops.some((o) => o.table === ITEMS)).toBe(false);
  });

  it("addProductToBundleCore refuses a product that would mix with what the bundle holds", async () => {
    queue(`${ITEMS}:select`, { data: null }); // not already in the bundle
    queue(`${ITEMS}:select`, { data: [{ product_id: "pHeld" }] });
    queue(`${PRODUCTS}:select`, {
      data: [
        { id: "pHeld", custom_made: false },
        { id: "pNew", custom_made: true },
      ],
    });
    const r = await addProductToBundleCore(supabase, ARTIST, "b1", "pNew");
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect((r as { error: string }).error).toContain(MIXED);
    expect(ops.some((o) => o.verb === "insert")).toBe(false);
  });

  it("addProductToBundleCore ADDS a product that agrees with what the bundle holds", async () => {
    // The distinction control for the singular path.
    queue(`${ITEMS}:select`, { data: null });
    queue(`${ITEMS}:select`, { data: [{ product_id: "pHeld" }] });
    queue(`${PRODUCTS}:select`, {
      data: [
        { id: "pHeld", custom_made: true },
        { id: "pNew", custom_made: true },
      ],
    });
    queue(`${ITEMS}:select`, { data: { position: 0 } });
    queue(`${ITEMS}:insert`, { data: { id: "it11" } });
    const r = await addProductToBundleCore(supabase, ARTIST, "b1", "pNew");
    expect(r).toEqual({ ok: true, id: "it11" });
  });
});

describe("counsel Q2: flipping custom_made on a product already in a bundle", () => {
  it("allows the change when the product is in no bundle", async () => {
    queue(`${ITEMS}:select`, { data: [] });
    await expect(
      customMadeChangeBundleConflicts(supabase, ARTIST, "p1", true),
    ).resolves.toEqual({ ok: true });
  });

  it("allows the change when every other component agrees with the NEW value", async () => {
    // Distinction control: an artist converting a whole bundle to custom-made
    // one product at a time must not be blocked at the last one.
    queue(`${ITEMS}:select`, { data: [{ bundle_id: "b1" }] });
    queue(`${ITEMS}:select`, {
      data: [
        { bundle_id: "b1", product_id: "p1" },
        { bundle_id: "b1", product_id: "p2" },
      ],
    });
    queue(`${PRODUCTS}:select`, { data: [{ id: "p2", custom_made: true }] });
    await expect(
      customMadeChangeBundleConflicts(supabase, ARTIST, "p1", true),
    ).resolves.toEqual({ ok: true });
  });

  it("refuses the change when it would leave a bundle mixed, and names the bundle", async () => {
    queue(`${ITEMS}:select`, { data: [{ bundle_id: "b1" }] });
    queue(`${ITEMS}:select`, {
      data: [
        { bundle_id: "b1", product_id: "p1" },
        { bundle_id: "b1", product_id: "p2" },
      ],
    });
    queue(`${PRODUCTS}:select`, { data: [{ id: "p2", custom_made: false }] });
    queue(`${B}:select`, { data: [{ name: "Starter kit" }] });
    const r = await customMadeChangeBundleConflicts(
      supabase,
      ARTIST,
      "p1",
      true,
    );
    // FAILS IF the product editor is left unguarded: the bundle write path
    // alone is one checkbox away from being bypassed, which is what makes
    // the composition an invariant rather than a suggestion.
    expect(r).toMatchObject({ ok: false });
    expect((r as { ok: false; error: string }).error).toContain("Starter kit");
  });

  it("fails CLOSED when the memberships cannot be read", async () => {
    queue(`${ITEMS}:select`, { error: { message: "boom" } });
    const r = await customMadeChangeBundleConflicts(
      supabase,
      ARTIST,
      "p1",
      true,
    );
    expect(r).toMatchObject({ ok: false });
  });

  it("is NOT entitlement-gated: a lapsed artist's bundles still have to hold", async () => {
    // A downgrade must not silently reopen the hole. FAILS IF someone adds
    // `requireEntitlement` here for symmetry with the write cores.
    getAccountOverrides.mockResolvedValue(LAPSED_TO_FREE);
    queue(`${ITEMS}:select`, { data: [{ bundle_id: "b1" }] });
    queue(`${ITEMS}:select`, {
      data: [
        { bundle_id: "b1", product_id: "p1" },
        { bundle_id: "b1", product_id: "p2" },
      ],
    });
    queue(`${PRODUCTS}:select`, { data: [{ id: "p2", custom_made: false }] });
    queue(`${B}:select`, { data: [{ name: "Starter kit" }] });
    const r = await customMadeChangeBundleConflicts(
      supabase,
      ARTIST,
      "p1",
      true,
    );
    expect(r).toMatchObject({ ok: false });
  });
});

describe("publicBundlesForArtist fails flat", () => {
  it("returns [] (never throws) when the entitlement read fails", async () => {
    getAccountOverrides.mockRejectedValue(new Error("plan read down"));
    await expect(publicBundlesForArtist(supabase, ARTIST)).resolves.toEqual([]);
  });

  it("returns [] when not entitled", async () => {
    disabledCapabilities = ["goods_bundles"];
    await expect(publicBundlesForArtist(supabase, ARTIST)).resolves.toEqual([]);
  });

  it("returns [] on a bundles read error rather than taking the shop down", async () => {
    queue(`${B}:select`, { error: { message: "boom" } });
    await expect(publicBundlesForArtist(supabase, ARTIST)).resolves.toEqual([]);
  });
});
