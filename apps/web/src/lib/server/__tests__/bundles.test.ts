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
  publicBundlesForArtist,
  type BundleWriteResult,
} from "@/lib/server/bundles";

type Reply = { data?: unknown; error?: unknown; count?: number | null };

type RecordedOp = {
  table: string;
  verb: "select" | "insert" | "update" | "delete";
  payload: Record<string, unknown> | null;
  filters: Record<string, unknown>;
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
      op.filters[c] = v;
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
  const op: RecordedOp = { table, verb, payload, filters: {}, inFilter: null };
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
    queue(`${ITEMS}:select`, { count: 50 }); // at the cap
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
      artist_id: ARTIST,
      quantity: 3,
      position: 5,
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
