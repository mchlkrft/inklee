import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_OVERRIDES, type AccountOverrides } from "@/lib/entitlements";

// The collections server boundary (Plus build P5d). Ten exported cores, eight
// modules importing them (seven of those call a core; the eighth takes only
// CollectionWithCount), and until this file zero tests of any kind: the same
// coverage shape that caused the original P5d retraction.
//
// What is pinned here, in order of what would hurt most if it broke:
//
//  1. Every write core refuses a lapsed-to-Free artist BEFORE it touches the
//     database, and refuses (rather than fails open) when the plan cannot be
//     read at all. The gate is server-side precisely because the UI hiding a
//     button is not enforcement.
//  2. Every write is scoped by artist_id. These cores run on the USER-scoped
//     client, where an RLS-denied UPDATE or DELETE comes back as
//     {data: [], error: null}, so a missing .eq("artist_id", ...) is invisible
//     to an error check and only the recorded filters can catch it.
//  3. publicCollectionsForArtist fails FLAT, never broken. It is hit by every
//     anonymous visitor to a shop.
//  4. deleteCollectionCore maps all three RPC verdicts, and treats anything
//     else as a failure rather than as success.
//
// The entitlement GATE is the real one (goodsCollectionsAllowed composed with
// the real entitlement engine); only the account read and the dark-launch kill
// switch are mocked, so a change to how Free resolves shows up here.

const getAccountOverrides = vi.fn();
/** The dark-launch kill switch, driven by a list rather than a return value so
 *  a paused test cannot accidentally pause every capability. */
let disabledCapabilities: string[] = [];
const isCapabilityDisabled = vi.fn((capability: string) =>
  disabledCapabilities.includes(capability),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/app-config", () => ({
  isCapabilityDisabled: (c: string) => isCapabilityDisabled(c),
}));

import {
  saveCollectionCore,
  reorderCollectionsCore,
  setCollectionArchivedCore,
  deleteCollectionCore,
  addProductToCollectionCore,
  removeProductFromCollectionCore,
  reorderCollectionProductsCore,
  setProductCollectionsCore,
  listCollectionsForArtist,
  publicCollectionsForArtist,
  type CollectionWriteResult,
} from "@/lib/server/collections";

// ---------------------------------------------------------------------------
// A recording Supabase double.
//
// It answers from a per-(table, verb) QUEUE and records what was asked. The
// recording half is the point: these cores express their ownership checks as
// FILTERS, and a filter that is silently dropped still returns a clean result
// from a mock that only replays data. Asserting on `ops[n].filters` is the only
// way a dropped .eq("artist_id", ...) can fail a unit test.

type Reply = { data?: unknown; error?: unknown };

type RecordedOp = {
  table: string;
  verb: "select" | "insert" | "update" | "delete";
  /** The row handed to insert/update, null for reads and deletes. */
  payload: Record<string, unknown> | null;
  /** Every .eq()/.is() column flattened, so a dropped one is observable. */
  filters: Record<string, unknown>;
  inFilter: { column: string; values: unknown[] } | null;
};

interface Chain extends PromiseLike<Reply> {
  select(columns?: string): Chain;
  eq(column: string, value: unknown): Chain;
  is(column: string, value: unknown): Chain;
  in(column: string, values: unknown[]): Chain;
  order(column: string, opts?: unknown): Chain;
  limit(n: number): Chain;
  maybeSingle(): Promise<Reply>;
  single(): Promise<Reply>;
}

let ops: RecordedOp[] = [];
let replies: Record<string, Reply[]> = {};
let rpcReplies: Reply[] = [];
let rpcCalls: Array<{ fn: string; args: unknown }> = [];

/** Queue answers for a table+verb, consumed in call order. */
function queue(key: string, ...rs: Reply[]) {
  replies[key] = [...(replies[key] ?? []), ...rs];
}

function nextReply(key: string): Reply {
  const q = replies[key];
  if (q && q.length > 0) return q.shift() as Reply;
  return { data: null, error: null };
}

function makeChain(op: RecordedOp): Chain {
  const key = `${op.table}:${op.verb}`;
  const self: Chain = {
    select: () => self,
    eq: (column, value) => {
      op.filters[column] = value;
      return self;
    },
    is: (column, value) => {
      op.filters[column] = value;
      return self;
    },
    in: (column, values) => {
      op.inFilter = { column, values };
      return self;
    },
    order: () => self,
    limit: () => self,
    maybeSingle: () => Promise.resolve(nextReply(key)),
    single: () => Promise.resolve(nextReply(key)),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(nextReply(key)).then(onFulfilled, onRejected),
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
    insert: (payload: Record<string, unknown>) =>
      start(table, "insert", payload),
    update: (payload: Record<string, unknown>) =>
      start(table, "update", payload),
    delete: () => start(table, "delete", null),
  }),
  rpc: (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcReplies.shift() ?? { data: null, error: null });
  },
} as unknown as SupabaseClient;

const ARTIST = "artist-1";
const COLLECTIONS = "product_collections";
const ITEMS = "product_collection_items";

const PLUS: AccountOverrides = { ...DEFAULT_OVERRIDES, planTier: "plus" };
/** Plus that ran out. effectivePlanTier resolves this to free. */
const LAPSED_TO_FREE: AccountOverrides = {
  ...DEFAULT_OVERRIDES,
  planTier: "plus",
  planExpiresAt: "2020-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  replies = {};
  rpcReplies = [];
  rpcCalls = [];
  getAccountOverrides.mockResolvedValue(PLUS);
  disabledCapabilities = [];
});

// Every core that carries the write gate. Args are the minimum that reaches the
// gate, so the list doubles as the inventory of gated entry points.
const WRITE_CORES: Array<
  [string, (s: SupabaseClient) => Promise<CollectionWriteResult>]
> = [
  ["saveCollectionCore", (s) => saveCollectionCore(s, ARTIST, { name: "Ink" })],
  ["reorderCollectionsCore", (s) => reorderCollectionsCore(s, ARTIST, ["c1"])],
  [
    "setCollectionArchivedCore",
    (s) => setCollectionArchivedCore(s, ARTIST, "c1", true),
  ],
  ["deleteCollectionCore", (s) => deleteCollectionCore(s, ARTIST, "c1")],
  [
    "addProductToCollectionCore",
    (s) => addProductToCollectionCore(s, ARTIST, "p1", "c1"),
  ],
  [
    "removeProductFromCollectionCore",
    (s) => removeProductFromCollectionCore(s, ARTIST, "p1", "c1"),
  ],
  [
    "reorderCollectionProductsCore",
    (s) => reorderCollectionProductsCore(s, ARTIST, "c1", ["p1"]),
  ],
  [
    "setProductCollectionsCore",
    (s) => setProductCollectionsCore(s, ARTIST, "p1", ["c1"]),
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
        error: "Collections aren't included in your current plan.",
      });
      // Refused BEFORE, not after: a gate that runs after the write would still
      // return not_entitled while having already changed the row.
      expect(ops).toEqual([]);
      expect(rpcCalls).toEqual([]);
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
      expect(rpcCalls).toEqual([]);
    },
  );

  // The dark-launch kill switch, through the real gate. One core is enough for
  // the composition (entitlement-gates.test.ts owns the gate's own shape); what
  // this proves is that collections routes through it at all.
  it("refuses an entitled artist while the capability is paused", async () => {
    disabledCapabilities = ["goods_collections"];
    const r = await saveCollectionCore(supabase, ARTIST, { name: "Prints" });
    expect(r).toEqual({
      ok: false,
      code: "not_entitled",
      error: "Collections aren't included in your current plan.",
    });
    expect(ops).toEqual([]);
  });
});

describe("saveCollectionCore (create)", () => {
  it("scopes the new row to the artist", async () => {
    queue(`${COLLECTIONS}:insert`, { data: { id: "c9" } });
    const r = await saveCollectionCore(supabase, ARTIST, { name: "Prints" });
    expect(r).toEqual({ ok: true, id: "c9" });
    const insert = ops.find((o) => o.verb === "insert");
    expect(insert?.payload?.artist_id).toBe(ARTIST);
  });

  it("normalizes the name before writing it", async () => {
    queue(`${COLLECTIONS}:insert`, { data: { id: "c9" } });
    await saveCollectionCore(supabase, ARTIST, {
      name: "  Winter   drop  ",
    });
    const insert = ops.find((o) => o.verb === "insert");
    expect(insert?.payload?.name).toBe("Winter drop");
  });

  it("starts a new collection publicly visible", async () => {
    queue(`${COLLECTIONS}:insert`, { data: { id: "c9" } });
    await saveCollectionCore(supabase, ARTIST, { name: "Prints" });
    const insert = ops.find((o) => o.verb === "insert");
    expect(insert?.payload?.is_public_visible).toBe(true);
  });

  it("lands at the next free slot after the artist's last collection", async () => {
    queue(`${COLLECTIONS}:select`, { data: { position: 4 } });
    queue(`${COLLECTIONS}:insert`, { data: { id: "c9" } });
    await saveCollectionCore(supabase, ARTIST, { name: "Prints" });
    const insert = ops.find((o) => o.verb === "insert");
    expect(insert?.payload?.position).toBe(5);
  });

  it("puts the artist's first collection at position 0", async () => {
    queue(`${COLLECTIONS}:select`, { data: null });
    queue(`${COLLECTIONS}:insert`, { data: { id: "c9" } });
    await saveCollectionCore(supabase, ARTIST, { name: "Prints" });
    const insert = ops.find((o) => o.verb === "insert");
    expect(insert?.payload?.position).toBe(0);
  });

  it("reads only the CALLING artist's positions", async () => {
    queue(`${COLLECTIONS}:select`, { data: { position: 0 } });
    queue(`${COLLECTIONS}:insert`, { data: { id: "c9" } });
    await saveCollectionCore(supabase, ARTIST, { name: "Prints" });
    const read = ops.find((o) => o.verb === "select");
    expect(read?.filters).toEqual({ artist_id: ARTIST });
  });

  it("rejects a too-short name without touching the database", async () => {
    const r = await saveCollectionCore(supabase, ARTIST, { name: "a" });
    expect(r).toEqual({
      ok: false,
      code: "invalid",
      error: "Give the collection a name.",
    });
    expect(ops).toEqual([]);
  });

  it("requires a name on create even when the key is absent", async () => {
    const r = await saveCollectionCore(supabase, ARTIST, {});
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(ops).toEqual([]);
  });

  it("reports a failure when the insert errors", async () => {
    queue(`${COLLECTIONS}:select`, { data: null });
    queue(`${COLLECTIONS}:insert`, { data: null, error: { code: "23505" } });
    const r = await saveCollectionCore(supabase, ARTIST, { name: "Prints" });
    expect(r).toEqual({ ok: false, code: "failed", error: "Couldn't save." });
  });
});

describe("saveCollectionCore (update)", () => {
  it("writes ONLY visibility when only visibility was sent", async () => {
    queue(`${COLLECTIONS}:update`, { data: { id: "c1" } });
    const r = await saveCollectionCore(
      supabase,
      ARTIST,
      { isPublicVisible: false },
      "c1",
    );
    expect(r).toEqual({ ok: true, id: "c1" });
    const update = ops.find((o) => o.verb === "update");
    expect(update?.payload).not.toHaveProperty("name");
    expect(update?.payload?.is_public_visible).toBe(false);
    // And no position read: that is create-only work.
    expect(ops).toHaveLength(1);
  });

  it("writes ONLY the name when only the name was sent", async () => {
    queue(`${COLLECTIONS}:update`, { data: { id: "c1" } });
    await saveCollectionCore(supabase, ARTIST, { name: "Renamed" }, "c1");
    const update = ops.find((o) => o.verb === "update");
    expect(update?.payload?.name).toBe("Renamed");
    expect(update?.payload).not.toHaveProperty("is_public_visible");
  });

  it("never reassigns position on update", async () => {
    queue(`${COLLECTIONS}:update`, { data: { id: "c1" } });
    await saveCollectionCore(supabase, ARTIST, { name: "Renamed" }, "c1");
    const update = ops.find((o) => o.verb === "update");
    expect(update?.payload).not.toHaveProperty("position");
    expect(update?.payload).not.toHaveProperty("artist_id");
  });

  it("scopes the update to the id AND the artist", async () => {
    queue(`${COLLECTIONS}:update`, { data: { id: "c1" } });
    await saveCollectionCore(supabase, ARTIST, { name: "Renamed" }, "c1");
    const update = ops.find((o) => o.verb === "update");
    expect(update?.filters).toEqual({ id: "c1", artist_id: ARTIST });
  });

  // The silent-failure surface: PostgREST answers an RLS-denied UPDATE with
  // {data: [], error: null}, so "no error" is not "it worked".
  it("reports a gone collection when the scoped update matched nothing", async () => {
    queue(`${COLLECTIONS}:update`, { data: null, error: null });
    const r = await saveCollectionCore(supabase, ARTIST, { name: "Xx" }, "c1");
    expect(r).toEqual({
      ok: false,
      code: "failed",
      error: "That collection is gone.",
    });
  });

  it("still validates a name that IS sent on update", async () => {
    const r = await saveCollectionCore(supabase, ARTIST, { name: " " }, "c1");
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(ops).toEqual([]);
  });
});

describe("reorderCollectionsCore", () => {
  it("refuses an empty order instead of reporting a successful no-op", async () => {
    const r = await reorderCollectionsCore(supabase, ARTIST, []);
    expect(r).toEqual({
      ok: false,
      code: "invalid",
      error: "Nothing to reorder.",
    });
    expect(ops).toEqual([]);
  });

  it("rewrites every position to match the given order exactly", async () => {
    const r = await reorderCollectionsCore(supabase, ARTIST, ["a", "b", "c"]);
    expect(r).toEqual({ ok: true, id: "a" });
    expect(ops.map((o) => o.payload?.position)).toEqual([0, 1, 2]);
    expect(ops.map((o) => o.filters.id)).toEqual(["a", "b", "c"]);
  });

  it("scopes EVERY reorder write to the artist", async () => {
    await reorderCollectionsCore(supabase, ARTIST, ["a", "b", "c"]);
    expect(ops.map((o) => o.filters.artist_id)).toEqual([
      ARTIST,
      ARTIST,
      ARTIST,
    ]);
  });

  it("stops at the first failing row rather than pressing on", async () => {
    queue(
      `${COLLECTIONS}:update`,
      { error: null },
      { error: { code: "42501" } },
    );
    const r = await reorderCollectionsCore(supabase, ARTIST, ["a", "b", "c"]);
    expect(r).toEqual({
      ok: false,
      code: "failed",
      error: "Couldn't reorder.",
    });
    expect(ops).toHaveLength(2);
  });
});

describe("setCollectionArchivedCore", () => {
  it("stamps archived_at when archiving", async () => {
    queue(`${COLLECTIONS}:update`, { data: { id: "c1" } });
    const r = await setCollectionArchivedCore(supabase, ARTIST, "c1", true);
    expect(r).toEqual({ ok: true, id: "c1" });
    expect(typeof ops[0].payload?.archived_at).toBe("string");
  });

  it("clears archived_at when restoring", async () => {
    queue(`${COLLECTIONS}:update`, { data: { id: "c1" } });
    await setCollectionArchivedCore(supabase, ARTIST, "c1", false);
    expect(ops[0].payload?.archived_at).toBeNull();
  });

  it("leaves membership and visibility untouched", async () => {
    queue(`${COLLECTIONS}:update`, { data: { id: "c1" } });
    await setCollectionArchivedCore(supabase, ARTIST, "c1", true);
    expect(ops[0].payload).not.toHaveProperty("is_public_visible");
    expect(ops.some((o) => o.table === ITEMS)).toBe(false);
  });

  it("scopes the archive to the id AND the artist", async () => {
    queue(`${COLLECTIONS}:update`, { data: { id: "c1" } });
    await setCollectionArchivedCore(supabase, ARTIST, "c1", true);
    expect(ops[0].filters).toEqual({ id: "c1", artist_id: ARTIST });
  });

  it("reports a gone collection when the scoped update matched nothing", async () => {
    queue(`${COLLECTIONS}:update`, { data: null, error: null });
    const r = await setCollectionArchivedCore(supabase, ARTIST, "c1", true);
    expect(r).toEqual({
      ok: false,
      code: "failed",
      error: "That collection is gone.",
    });
  });

  it("reports a failure when the update errors", async () => {
    queue(`${COLLECTIONS}:update`, { data: null, error: { code: "XX000" } });
    const r = await setCollectionArchivedCore(supabase, ARTIST, "c1", true);
    expect(r).toEqual({ ok: false, code: "failed", error: "Couldn't save." });
  });
});

describe("deleteCollectionCore", () => {
  it("decides eligibility in ONE round trip, with no separate count read", async () => {
    rpcReplies = [{ data: "deleted" }];
    await deleteCollectionCore(supabase, ARTIST, "c1");
    expect(rpcCalls).toEqual([
      {
        fn: "delete_collection_if_eligible",
        args: { p_collection_id: "c1", p_artist_id: ARTIST },
      },
    ]);
    // A count-then-delete is what task #19 widened; nothing may read first.
    expect(ops).toEqual([]);
  });

  it("maps 'deleted' to success", async () => {
    rpcReplies = [{ data: "deleted" }];
    expect(await deleteCollectionCore(supabase, ARTIST, "c1")).toEqual({
      ok: true,
      id: "c1",
    });
  });

  it("maps 'not_eligible' to the archive-first refusal", async () => {
    rpcReplies = [{ data: "not_eligible" }];
    expect(await deleteCollectionCore(supabase, ARTIST, "c1")).toEqual({
      ok: false,
      code: "not_eligible",
      error:
        "This collection still has products in it. Archive it first, then you can delete it.",
    });
  });

  // 'gone' is what a cross-artist id returns. It must not tell the caller
  // whether the collection exists.
  it("maps 'gone' to a failure that reveals nothing about existence", async () => {
    rpcReplies = [{ data: "gone" }];
    expect(await deleteCollectionCore(supabase, ARTIST, "c1")).toEqual({
      ok: false,
      code: "failed",
      error: "That collection is gone.",
    });
  });

  it("treats an UNEXPECTED return value as a failure, not as success", async () => {
    rpcReplies = [{ data: "something_new" }];
    expect(await deleteCollectionCore(supabase, ARTIST, "c1")).toMatchObject({
      ok: false,
      code: "failed",
    });
  });

  // A function redeployed as returning void, or a driver that hands back null,
  // must not read as "deleted".
  it("treats a null return as a failure, not as success", async () => {
    rpcReplies = [{ data: null }];
    expect(await deleteCollectionCore(supabase, ARTIST, "c1")).toMatchObject({
      ok: false,
      code: "failed",
    });
  });

  it("reports a failure when the rpc itself errors", async () => {
    rpcReplies = [{ data: null, error: { code: "42883" } }];
    expect(await deleteCollectionCore(supabase, ARTIST, "c1")).toEqual({
      ok: false,
      code: "failed",
      error: "Couldn't delete.",
    });
  });
});

describe("addProductToCollectionCore", () => {
  it("is idempotent: an existing membership inserts nothing", async () => {
    queue(`${ITEMS}:select`, { data: { id: "m1" } });
    const r = await addProductToCollectionCore(supabase, ARTIST, "p1", "c1");
    expect(r).toEqual({ ok: true, id: "m1" });
    expect(ops.some((o) => o.verb === "insert")).toBe(false);
  });

  it("appends at the end of THAT collection's order", async () => {
    queue(`${ITEMS}:select`, { data: null }, { data: { position: 2 } });
    queue(`${ITEMS}:insert`, { data: { id: "m2" } });
    await addProductToCollectionCore(supabase, ARTIST, "p1", "c1");
    const insert = ops.find((o) => o.verb === "insert");
    expect(insert?.payload?.position).toBe(3);
  });

  it("starts the first membership of a collection at position 0", async () => {
    queue(`${ITEMS}:select`, { data: null }, { data: null });
    queue(`${ITEMS}:insert`, { data: { id: "m2" } });
    await addProductToCollectionCore(supabase, ARTIST, "p1", "c1");
    const insert = ops.find((o) => o.verb === "insert");
    expect(insert?.payload?.position).toBe(0);
  });

  // artist_id on the join row is what the composite FKs and the RLS WITH CHECK
  // verify against BOTH parents. Without it the row cannot be validated.
  it("stamps the artist id on the membership row", async () => {
    queue(`${ITEMS}:select`, { data: null }, { data: null });
    queue(`${ITEMS}:insert`, { data: { id: "m2" } });
    await addProductToCollectionCore(supabase, ARTIST, "p1", "c1");
    const insert = ops.find((o) => o.verb === "insert");
    expect(insert?.payload).toEqual({
      collection_id: "c1",
      product_id: "p1",
      artist_id: ARTIST,
      position: 0,
    });
  });

  it("looks for the existing membership by collection AND product", async () => {
    queue(`${ITEMS}:select`, { data: { id: "m1" } });
    await addProductToCollectionCore(supabase, ARTIST, "p1", "c1");
    expect(ops[0].filters).toEqual({ collection_id: "c1", product_id: "p1" });
  });

  it("refuses when the insert is rejected", async () => {
    queue(`${ITEMS}:select`, { data: null }, { data: null });
    queue(`${ITEMS}:insert`, { data: null, error: { code: "42501" } });
    const r = await addProductToCollectionCore(supabase, ARTIST, "p1", "c1");
    expect(r).toEqual({
      ok: false,
      code: "invalid",
      error: "Couldn't add that to the collection.",
    });
  });

  it("refuses when the insert returns no row despite no error", async () => {
    queue(`${ITEMS}:select`, { data: null }, { data: null });
    queue(`${ITEMS}:insert`, { data: null, error: null });
    const r = await addProductToCollectionCore(supabase, ARTIST, "p1", "c1");
    expect(r).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("removeProductFromCollectionCore", () => {
  it("removes ONE membership, scoped to collection, product and artist", async () => {
    const r = await removeProductFromCollectionCore(
      supabase,
      ARTIST,
      "p1",
      "c1",
    );
    expect(r).toEqual({ ok: true, id: "p1" });
    expect(ops).toHaveLength(1);
    expect(ops[0].verb).toBe("delete");
    expect(ops[0].table).toBe(ITEMS);
    expect(ops[0].filters).toEqual({
      collection_id: "c1",
      product_id: "p1",
      artist_id: ARTIST,
    });
  });

  it("never touches the product itself", async () => {
    await removeProductFromCollectionCore(supabase, ARTIST, "p1", "c1");
    expect(ops.some((o) => o.table === "products")).toBe(false);
  });

  // Absent is the desired end state, so a delete that matched nothing is done.
  it("treats a no-op removal as success", async () => {
    queue(`${ITEMS}:delete`, { data: [], error: null });
    const r = await removeProductFromCollectionCore(
      supabase,
      ARTIST,
      "p1",
      "c1",
    );
    expect(r).toEqual({ ok: true, id: "p1" });
  });

  it("reports a failure when the delete errors", async () => {
    queue(`${ITEMS}:delete`, { error: { code: "XX000" } });
    const r = await removeProductFromCollectionCore(
      supabase,
      ARTIST,
      "p1",
      "c1",
    );
    expect(r).toEqual({ ok: false, code: "failed", error: "Couldn't remove." });
  });
});

describe("reorderCollectionProductsCore", () => {
  it("refuses an empty order", async () => {
    const r = await reorderCollectionProductsCore(supabase, ARTIST, "c1", []);
    expect(r).toEqual({
      ok: false,
      code: "invalid",
      error: "Nothing to reorder.",
    });
    expect(ops).toEqual([]);
  });

  it("rewrites positions inside ONE collection only", async () => {
    const r = await reorderCollectionProductsCore(supabase, ARTIST, "c1", [
      "p1",
      "p2",
    ]);
    expect(r).toEqual({ ok: true, id: "c1" });
    expect(ops.map((o) => o.payload?.position)).toEqual([0, 1]);
    // Every write is bound to this collection: without collection_id the same
    // product's place in every OTHER collection would move too.
    expect(ops.map((o) => o.filters.collection_id)).toEqual(["c1", "c1"]);
    expect(ops.map((o) => o.filters.product_id)).toEqual(["p1", "p2"]);
  });

  it("scopes EVERY membership reorder to the artist", async () => {
    await reorderCollectionProductsCore(supabase, ARTIST, "c1", ["p1", "p2"]);
    expect(ops.map((o) => o.filters.artist_id)).toEqual([ARTIST, ARTIST]);
  });

  it("stops at the first failing row", async () => {
    queue(`${ITEMS}:update`, { error: null }, { error: { code: "42501" } });
    const r = await reorderCollectionProductsCore(supabase, ARTIST, "c1", [
      "p1",
      "p2",
      "p3",
    ]);
    expect(r).toEqual({
      ok: false,
      code: "failed",
      error: "Couldn't reorder.",
    });
    expect(ops).toHaveLength(2);
  });
});

describe("setProductCollectionsCore", () => {
  it("adds only what is missing and removes only what was dropped", async () => {
    // Currently in c1 and c2; the editor sends c2 and c3.
    queue(`${ITEMS}:select`, {
      data: [{ collection_id: "c1" }, { collection_id: "c2" }],
    });
    // The add path for c3: existence probe, then tail position.
    queue(`${ITEMS}:select`, { data: null }, { data: null });
    queue(`${ITEMS}:insert`, { data: { id: "m3" } });

    const r = await setProductCollectionsCore(supabase, ARTIST, "p1", [
      "c2",
      "c3",
    ]);
    expect(r).toEqual({ ok: true, id: "p1" });

    const inserts = ops.filter((o) => o.verb === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload?.collection_id).toBe("c3");

    const deletes = ops.filter((o) => o.verb === "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].filters.collection_id).toBe("c1");

    // c2 is left completely alone, ordering included. A delete-all-then-
    // reinsert would be invisible in the end state but would discard its place.
    expect(
      ops.some((o) => o.verb !== "select" && o.filters.collection_id === "c2"),
    ).toBe(false);
  });

  it("scopes the current-membership read to the product AND the artist", async () => {
    queue(`${ITEMS}:select`, { data: [] });
    await setProductCollectionsCore(supabase, ARTIST, "p1", []);
    expect(ops[0].filters).toEqual({ product_id: "p1", artist_id: ARTIST });
  });

  it("aborts WITHOUT writing when the current-membership read fails", async () => {
    queue(`${ITEMS}:select`, { data: null, error: { code: "XX000" } });
    const r = await setProductCollectionsCore(supabase, ARTIST, "p1", ["c3"]);
    expect(r).toEqual({ ok: false, code: "failed", error: "Couldn't save." });
    // A swallowed read error would read as "holds nothing" and add everything.
    expect(ops.filter((o) => o.verb !== "select")).toEqual([]);
  });

  it("propagates a failing add and stops", async () => {
    queue(`${ITEMS}:select`, { data: [] });
    queue(`${ITEMS}:select`, { data: null }, { data: null });
    queue(`${ITEMS}:insert`, { data: null, error: { code: "42501" } });
    const r = await setProductCollectionsCore(supabase, ARTIST, "p1", [
      "c3",
      "c4",
    ]);
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(ops.filter((o) => o.verb === "insert")).toHaveLength(1);
  });

  it("propagates a failing remove and stops", async () => {
    queue(`${ITEMS}:select`, {
      data: [{ collection_id: "c1" }, { collection_id: "c2" }],
    });
    queue(`${ITEMS}:delete`, { error: { code: "XX000" } });
    const r = await setProductCollectionsCore(supabase, ARTIST, "p1", []);
    expect(r).toEqual({ ok: false, code: "failed", error: "Couldn't remove." });
    expect(ops.filter((o) => o.verb === "delete")).toHaveLength(1);
  });
});

describe("listCollectionsForArtist", () => {
  // These two cover a destructive defect, not a cosmetic one (task #22).
  // Both reads used to discard their error. A failed membership read left every
  // count at 0, canDeleteCollection(collection, 0) returned true, and both
  // managers then offered a DELETE button for a collection that still had
  // products in it. Deleting cascades the memberships away with no undo.
  // Falsification: revert either read to `const { data } = await ...` and the
  // matching test below must fail.
  it("throws rather than reporting an empty list when the collections read fails", async () => {
    queue(`${COLLECTIONS}:select`, {
      error: { message: "connection reset", code: "08006" },
    });
    await expect(listCollectionsForArtist(supabase, ARTIST)).rejects.toThrow(
      /Could not load collections/,
    );
  });

  it("throws rather than reporting zero products when the membership read fails", async () => {
    queue(`${COLLECTIONS}:select`, {
      data: [
        {
          id: "c1",
          name: "Prints",
          position: 0,
          is_public_visible: true,
          archived_at: null,
        },
      ],
    });
    queue(`${ITEMS}:select`, {
      error: { message: "permission denied", code: "42501" },
    });
    // The dangerous outcome is NOT the throw, it is the alternative: resolving
    // to [{ id: "c1", productCount: 0 }], which reads as "safe to delete".
    await expect(listCollectionsForArtist(supabase, ARTIST)).rejects.toThrow(
      /Could not load collection contents/,
    );
  });

  it("counts the products in each collection, zero included", async () => {
    queue(`${COLLECTIONS}:select`, {
      data: [
        {
          id: "c1",
          name: "Prints",
          position: 0,
          is_public_visible: true,
          archived_at: null,
        },
        {
          id: "c2",
          name: "Empty",
          position: 1,
          is_public_visible: true,
          archived_at: null,
        },
      ],
    });
    queue(`${ITEMS}:select`, {
      data: [{ collection_id: "c1" }, { collection_id: "c1" }],
    });
    const list = await listCollectionsForArtist(supabase, ARTIST);
    expect(list.map((c) => [c.id, c.productCount])).toEqual([
      ["c1", 2],
      ["c2", 0],
    ]);
  });

  it("shows the artist their ARCHIVED collections too", async () => {
    queue(`${COLLECTIONS}:select`, {
      data: [
        {
          id: "c1",
          name: "Old",
          position: 0,
          is_public_visible: false,
          archived_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const list = await listCollectionsForArtist(supabase, ARTIST);
    expect(list[0]).toMatchObject({
      archivedAt: "2026-01-01T00:00:00.000Z",
      isPublicVisible: false,
    });
    // The manager view must not filter archived or hidden rows out at the query.
    expect(ops[0].filters).toEqual({ artist_id: ARTIST });
  });

  it("skips the membership read entirely when there are no collections", async () => {
    queue(`${COLLECTIONS}:select`, { data: [] });
    expect(await listCollectionsForArtist(supabase, ARTIST)).toEqual([]);
    expect(ops).toHaveLength(1);
  });

  it("survives a null collections read", async () => {
    queue(`${COLLECTIONS}:select`, { data: null });
    expect(await listCollectionsForArtist(supabase, ARTIST)).toEqual([]);
  });

  it("scopes the membership count to the artist", async () => {
    queue(`${COLLECTIONS}:select`, {
      data: [
        {
          id: "c1",
          name: "Prints",
          position: 0,
          is_public_visible: true,
          archived_at: null,
        },
      ],
    });
    await listCollectionsForArtist(supabase, ARTIST);
    expect(ops[1].filters).toEqual({ artist_id: ARTIST });
  });

  // Deliberate: the manager view is NOT entitlement-gated. A downgrade must
  // never hide an artist's own records, the same rule largeProjectsAllowed
  // states for projects. Adding a gate here is a product decision, and this
  // test exists to make it a deliberate one rather than a drive-by.
  it("is NOT entitlement-gated: a Free artist still sees their own list", async () => {
    getAccountOverrides.mockResolvedValue(LAPSED_TO_FREE);
    queue(`${COLLECTIONS}:select`, {
      data: [
        {
          id: "c1",
          name: "Prints",
          position: 0,
          is_public_visible: true,
          archived_at: null,
        },
      ],
    });
    const list = await listCollectionsForArtist(supabase, ARTIST);
    expect(list).toHaveLength(1);
    expect(getAccountOverrides).not.toHaveBeenCalled();
  });
});

describe("publicCollectionsForArtist (fails FLAT, never broken)", () => {
  const EMPTY = { collections: [], memberships: [] };

  const twoLiveCollections = () =>
    queue(`${COLLECTIONS}:select`, {
      data: [
        {
          id: "c1",
          name: "Prints",
          position: 0,
          is_public_visible: true,
          archived_at: null,
        },
        {
          id: "c2",
          name: "Drop",
          position: 1,
          is_public_visible: true,
          archived_at: null,
        },
      ],
    });

  it("groups the shop for an entitled artist", async () => {
    twoLiveCollections();
    queue(`${ITEMS}:select`, {
      data: [
        { collection_id: "c1", product_id: "p1", position: 0 },
        { collection_id: "c1", product_id: "p2", position: 1 },
      ],
    });
    const r = await publicCollectionsForArtist(supabase, ARTIST);
    expect(r.collections.map((c) => [c.id, c.position])).toEqual([
      ["c1", 0],
      ["c2", 1],
    ]);
    expect(r.memberships).toEqual([
      { collectionId: "c1", productId: "p1", position: 0 },
      { collectionId: "c1", productId: "p2", position: 1 },
    ]);
  });

  it("falls back to the flat shop when the artist is not entitled", async () => {
    getAccountOverrides.mockResolvedValue(LAPSED_TO_FREE);
    twoLiveCollections();
    expect(await publicCollectionsForArtist(supabase, ARTIST)).toEqual(EMPTY);
    expect(ops).toEqual([]);
  });

  it("falls back to the flat shop while the capability is paused", async () => {
    disabledCapabilities = ["goods_collections"];
    twoLiveCollections();
    expect(await publicCollectionsForArtist(supabase, ARTIST)).toEqual(EMPTY);
    expect(ops).toEqual([]);
  });

  // Every anonymous visitor to every shop runs this. An entitlement read that
  // throws must not become a 500 on a public page.
  it("falls back to the flat shop when the entitlement read THROWS", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    twoLiveCollections();
    await expect(publicCollectionsForArtist(supabase, ARTIST)).resolves.toEqual(
      EMPTY,
    );
    expect(ops).toEqual([]);
  });

  // Deliberately supplies rows ALONGSIDE the error. supabase-js sets data to
  // null on error today, which is exactly why the guard was "true by accident"
  // before task #22: `rawCollections ?? []` plus the length-0 early return
  // produce the same empty answer whether or not the error is checked. Handing
  // the guard rows to discard is the only way this test observes the guard
  // itself rather than the accident, and the contract it pins is the real one:
  // on a read error, return the flat shop regardless of what came with it.
  it("falls back to the flat shop when the collections read errors", async () => {
    queue(`${COLLECTIONS}:select`, {
      data: [
        {
          id: "c1",
          name: "Prints",
          position: 0,
          is_public_visible: true,
          archived_at: null,
        },
      ],
      error: { code: "42P01" },
    });
    expect(await publicCollectionsForArtist(supabase, ARTIST)).toEqual(EMPTY);
  });

  it("falls back to the flat shop when the membership read errors", async () => {
    twoLiveCollections();
    queue(`${ITEMS}:select`, { data: null, error: { code: "42501" } });
    expect(await publicCollectionsForArtist(supabase, ARTIST)).toEqual(EMPTY);
  });

  it("reads only LIVE, publicly visible collections", async () => {
    twoLiveCollections();
    queue(`${ITEMS}:select`, { data: [] });
    await publicCollectionsForArtist(supabase, ARTIST);
    expect(ops[0].filters).toEqual({
      artist_id: ARTIST,
      is_public_visible: true,
      archived_at: null,
    });
  });

  it("scopes the membership read to the artist and to the listed collections", async () => {
    twoLiveCollections();
    queue(`${ITEMS}:select`, { data: [] });
    await publicCollectionsForArtist(supabase, ARTIST);
    expect(ops[1].filters).toEqual({ artist_id: ARTIST });
    expect(ops[1].inFilter).toEqual({
      column: "collection_id",
      values: ["c1", "c2"],
    });
  });

  it("skips the membership read when there are no visible collections", async () => {
    queue(`${COLLECTIONS}:select`, { data: [] });
    expect(await publicCollectionsForArtist(supabase, ARTIST)).toEqual(EMPTY);
    expect(ops).toHaveLength(1);
  });
});
