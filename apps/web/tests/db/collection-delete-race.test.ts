import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";
import { PgSession } from "./helpers/pg-session";

/**
 * The delete-collection TOCTOU, as a permanent regression test (task #19).
 *
 * WHAT IS BROKEN. `delete_collection_if_eligible` (migration 0124) is a single
 * DELETE whose eligibility check is a `not exists` subquery. Under READ
 * COMMITTED a statement evaluates its subqueries against ONE snapshot, taken
 * when the statement begins. A concurrent insert into `product_collection_items`
 * takes FOR KEY SHARE on the parent collection, so this DELETE *waits* on that
 * lock, but waiting is not re-checking: when the writer commits, the DELETE
 * proceeds on its pre-wait snapshot and the composite FK's `on delete cascade`
 * destroys the membership that just committed. The artist is told the
 * collection was deleted. Nobody is told the arranging work was.
 *
 * WHY THE OTHER TESTS CANNOT SEE IT. Every branch in
 * `collection-delete-rpc.test.ts` is green against the broken function, and so
 * is every unit test of `canDeleteCollection`. The defect is not in the rule.
 * It is in when the rule is evaluated, and that is only observable with two
 * connections overlapping in time, which PostgREST alone cannot arrange.
 *
 * WHY THE ASSERTIONS LOOK PARANOID. A concurrency test that merely observes
 * `not_eligible` proves nothing: the sequential case returns `not_eligible`
 * too. If the two sessions failed to overlap, or the RPC errored, or the
 * fixture was silently empty, this test would report success on a run in which
 * the race never happened. So the overlap itself is asserted behaviourally,
 * from `pg_blocking_pids`, and not inferred from timing.
 *
 * ⚠️ THIS TEST IS EXPECTED TO BE RED. The fix has not shipped. As of
 * 2026-07-29 the deployed function is `md5(prosrc)=8554a78c8bbadca03ff944930f1a2ac9`,
 * there is no migration after 0124, and this is the only artifact in the
 * repository that goes red on the defect. Do not skip it, do not mark it
 * `it.fails`, and do not delete it to get a green suite. It turns green the
 * moment the function is repaired, and not before.
 *
 * EXECUTED, all five runs on the local stack (127.0.0.1:54322), each bracketed
 * by a `md5(prosrc)` fingerprint. `fn_md5` is carried in the failure message so
 * a red run names WHICH body produced it.
 *
 *  1. Shipped body `8554a78c…`: RED. `expected 'deleted' to be 'not_eligible'`,
 *     `rpcIssued=+1511ms committed=+3550ms rpcReturned=+3562ms blockedFor=2051ms
 *     blockedByWriter=1`. Every guard above the verdict passed, so the run WAS
 *     a race and the function simply destroyed the membership.
 *  2. Candidate fix (`perform 1 from product_collections where id = … and
 *     artist_id = … for update;` before the DELETE), md5 `cabb8e77…`: GREEN,
 *     51/51 across the whole `tests/db` suite. So the test is not
 *     unsatisfiable, and the fix in 0124's own header is the right one.
 *     NOTE: the SHIPPED body is `bb9260dc…`, not `cabb8e77…`. Same lock, same
 *     behaviour; only the explanatory comments differ, and `prosrc` includes
 *     comments, so the fingerprint moves whenever the body's comments are
 *     edited. Treat these md5s as identifying a RUN, never as a schema check.
 *     Independently re-verified against `bb9260dc…`: red on `8554a78c…`,
 *     green on `bb9260dc…`, 51/51.
 *  3. NEAR MISS, and the reason this test is worth its runtime: the same fix
 *     with `for no key update` (md5 `2169b377…`) stays RED, `blockedFor=2030ms
 *     blockedByWriter=1`. FOR NO KEY UPDATE does not conflict with the FOR KEY
 *     SHARE the child insert's RI trigger takes, so the lock returns
 *     immediately and only the DELETE blocks, on its stale snapshot, exactly as
 *     before. It looks like a fix, it blocks for the same 2 seconds, and it
 *     loses the same data.
 *  4. A "fix" that just `return 'not_eligible'` (md5 `1a976835…`) does NOT
 *     sneak through: it fails on the OVERLAP GUARD rather than the verdict,
 *     `blockedByWriter=0 blockedFor=7ms`, and takes "CONTROL (harness)" and
 *     five branch tests down with it.
 *  5. Restoring 0124 returns `md5` to `8554a78c…` and the test to RED, so its
 *     result tracks the function body rather than the weather.
 */

const MARGIN_MS = 1500; // writer's insert lands -> deleter issues the RPC
const HOLD_MS = 2000; // deleter issues the RPC -> writer commits

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let admin: SupabaseClient;
let owner: Actor;
let writer: PgSession;
let observer: PgSession;
/** md5 of the deployed function body, so a red run names WHICH body it ran. */
let fnFingerprint = "unknown";

async function makeCollection(name: string): Promise<string> {
  const { data, error } = await owner.client
    .from("product_collections")
    .insert({ artist_id: owner.id, name })
    .select("id")
    .single();
  expect(error, `collection setup failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

async function makeProduct(title: string): Promise<string> {
  const { data, error } = await owner.client
    .from("products")
    .insert({ artist_id: owner.id, title, price_amount: 25, currency: "eur" })
    .select("id")
    .single();
  expect(error, `product setup failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

function callRpc(collectionId: string) {
  return owner.client.rpc("delete_collection_if_eligible", {
    p_collection_id: collectionId,
    p_artist_id: owner.id,
  });
}

/** Reads through the superuser session, so RLS cannot hide a survivor. */
async function countMemberships(collectionId: string): Promise<number> {
  const rows = await observer.query<{ n: string }>(
    "select count(*)::text as n from product_collection_items where collection_id = $1",
    [collectionId],
  );
  return Number(rows[0].n);
}

async function countCollections(collectionId: string): Promise<number> {
  const rows = await observer.query<{ n: string }>(
    "select count(*)::text as n from product_collections where id = $1",
    [collectionId],
  );
  return Number(rows[0].n);
}

beforeAll(async () => {
  admin = adminClient();
  writer = PgSession.open("writer");
  observer = PgSession.open("observer");
  owner = await makeActor(admin, "race-owner");

  const rows = await observer.query<{ md5: string }>(
    "select md5(prosrc) as md5 from pg_proc where proname = 'delete_collection_if_eligible'",
  );
  expect(
    rows,
    "delete_collection_if_eligible must exist, or nothing below is testing anything",
  ).toHaveLength(1);
  fnFingerprint = rows[0].md5;
}, 60_000);

afterAll(async () => {
  // Sessions first. A writer transaction left open would make every cleanup
  // DELETE below block on its locks until the hook times out, and the failure
  // would look like a broken teardown rather than a test that threw mid-hold.
  await writer.close();
  await observer.close();
  await destroyActor(admin, owner);
}, 60_000);

describe("delete_collection_if_eligible under concurrency", () => {
  it("CONTROL (harness): two live sessions, no shared row, still deletes", async () => {
    // Proves the harness can produce a `deleted` verdict at all, and that a
    // held write does not block a delete on its own. Without this, the
    // regression test's `not_eligible` could be an artefact of the harness
    // rather than a property of the function.
    const held = await makeCollection("Race control held");
    const heldProduct = await makeProduct("Race control product");
    const target = await makeCollection("Race control target");

    let verdict: unknown;
    let rpcError: { message?: string } | null = null;
    let elapsed = -1;
    try {
      await writer.begin();
      await writer.becomeArtist(owner.id);
      await writer.query(
        `insert into product_collection_items (collection_id, product_id, artist_id, position)
         values ($1, $2, $3, 0)`,
        [held, heldProduct, owner.id],
      );

      const started = Date.now();
      const res = await callRpc(target);
      elapsed = Date.now() - started;
      verdict = res.data;
      rpcError = res.error;
    } finally {
      await writer.rollbackIfOpen();
    }

    expect(rpcError, rpcError?.message).toBeNull();
    expect(verdict, "an empty, uncontended collection must delete").toBe(
      "deleted",
    );
    expect(
      elapsed,
      `the call must NOT have waited on the unrelated held write (took ${elapsed}ms)`,
    ).toBeLessThan(MARGIN_MS);
    expect(await countCollections(target)).toBe(0);
  });

  it("CONTROL (sequential): a membership committed BEFORE the call is refused", async () => {
    // The contrast that shows the regression below is snapshot-scoped rather
    // than a broken predicate. Same fixture, same two sessions, same verdict
    // expected. The ONLY difference is that the commit lands before the DELETE
    // statement begins, so the statement's snapshot already contains it.
    const collectionId = await makeCollection("Race sequential");
    const productId = await makeProduct("Race sequential product");

    await writer.begin();
    await writer.becomeArtist(owner.id);
    await writer.query(
      `insert into product_collection_items (collection_id, product_id, artist_id, position)
       values ($1, $2, $3, 0)`,
      [collectionId, productId, owner.id],
    );
    await writer.commit();

    expect(
      await countMemberships(collectionId),
      "the membership must be committed before the call",
    ).toBe(1);

    // The role and claims `becomeArtist` set are `set local`, so the commit
    // above must have returned this connection to plain `postgres`. Asserted
    // rather than trusted: a leaked `authenticated` role would silently put
    // every later query on this session under RLS, and the resulting failure
    // (a teardown statement quietly affecting zero rows) looks nothing like
    // its cause.
    expect(
      await writer.currentUser(),
      "committing must return the writer session to postgres",
    ).toBe("postgres");

    const { data: verdict, error } = await callRpc(collectionId);
    expect(error, error?.message).toBeNull();
    expect(verdict).toBe("not_eligible");
    expect(await countMemberships(collectionId)).toBe(1);
    expect(await countCollections(collectionId)).toBe(1);
  });

  it("REGRESSION (task #19): a membership committed WHILE the delete waits on the lock must survive", async () => {
    const collectionId = await makeCollection("Race target");
    const productId = await makeProduct("Race target product");

    // The target starts EMPTY and LIVE. That is deliberate and load-bearing:
    // it means the pre-race verdict is unambiguously `deleted`, so a
    // `not_eligible` can only have come from the concurrent write. Asserted,
    // not assumed.
    expect(
      await countMemberships(collectionId),
      "the target must start empty, or the refusal proves nothing",
    ).toBe(0);

    const t: Record<string, number> = {};
    let verdict: unknown;
    let rpcError: { code?: string; message?: string } | null = null;
    let writerPid = -1;
    let writerRole = "";
    let visibleToWriter = -1;
    let visibleOutside = -1;
    let blockedByWriter = -1;

    try {
      writerPid = await writer.backendPid();
      await writer.begin();
      await writer.becomeArtist(owner.id);
      writerRole = await writer.currentUser();

      // SESSION 1 writes and HOLDS. Through the real RLS policy, as the
      // artist, which is the production shape of this write.
      await writer.query(
        `insert into product_collection_items (collection_id, product_id, artist_id, position)
         values ($1, $2, $3, 0)`,
        [collectionId, productId, owner.id],
      );
      t.inserted = Date.now();

      visibleToWriter = Number(
        (
          await writer.query<{ n: string }>(
            "select count(*)::text as n from product_collection_items where collection_id = $1",
            [collectionId],
          )
        )[0].n,
      );
      visibleOutside = await countMemberships(collectionId);

      // A WIDE margin. The window this defect needs is not microseconds: the
      // DELETE's snapshot is fixed when the statement begins, and the writer's
      // lock keeps it parked there for as long as the writer holds. A test
      // that had to hit a tight window would be a flake; this one does not.
      await sleep(MARGIN_MS);

      // SESSION 2 calls the RPC through the real PostgREST path. Not awaited
      // yet: it is about to block on session 1's row lock.
      t.rpcIssued = Date.now();
      const rpcPromise = callRpc(collectionId).then((res) => {
        t.rpcReturned = Date.now();
        return res;
      });

      // THE OVERLAP, MEASURED. `pg_blocking_pids` is what makes this a race
      // test rather than two statements that happened to be near each other in
      // time. If this reads 0, the sessions never contended and the verdict
      // below is meaningless whichever way it goes.
      await sleep(Math.floor(HOLD_MS / 2));
      blockedByWriter = await observer.countBlockedBy(writerPid);

      await sleep(HOLD_MS - Math.floor(HOLD_MS / 2));
      await writer.commit();
      t.committed = Date.now();

      const res = await rpcPromise;
      verdict = res.data;
      rpcError = res.error;
    } finally {
      await writer.rollbackIfOpen();
    }

    const blockedMs = (t.rpcReturned ?? 0) - (t.rpcIssued ?? 0);
    const timeline =
      `inserted=+0ms rpcIssued=+${t.rpcIssued - t.inserted}ms ` +
      `committed=+${t.committed - t.inserted}ms ` +
      `rpcReturned=+${t.rpcReturned - t.inserted}ms ` +
      `blockedFor=${blockedMs}ms blockedByWriter=${blockedByWriter} ` +
      `fn_md5=${fnFingerprint}`;

    // --- the run was actually a race -------------------------------------
    expect(writerRole, "the held write must run under RLS as the artist").toBe(
      "authenticated",
    );
    expect(
      visibleToWriter,
      "the writer's own transaction must see its insert, or nothing was written",
    ).toBe(1);
    expect(
      visibleOutside,
      "the insert must still be UNCOMMITTED when the RPC is issued",
    ).toBe(0);
    expect(
      t.rpcIssued,
      "the RPC must be issued BEFORE the writer commits",
    ).toBeLessThan(t.committed);
    expect(
      blockedByWriter,
      `no backend was blocked by the writer, so the two sessions never contended (${timeline})`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      blockedMs,
      `the RPC returned without waiting for the writer, so there was no race (${timeline})`,
    ).toBeGreaterThanOrEqual(HOLD_MS / 2);
    expect(
      rpcError,
      `the RPC must reach a verdict, not fail (${rpcError?.code}: ${rpcError?.message})`,
    ).toBeNull();

    // --- the verdict ------------------------------------------------------
    // A membership that COMMITTED before this call returned is a membership
    // that exists. The rule does not become conditional on when the writer
    // got there.
    expect(
      verdict,
      `the delete must refuse a collection that gained a membership while it waited (${timeline})`,
    ).toBe("not_eligible");

    // --- and the verdict meant something ----------------------------------
    expect(
      await countMemberships(collectionId),
      `the committed membership must survive (${timeline})`,
    ).toBe(1);
    expect(
      await countCollections(collectionId),
      `the refused collection must survive (${timeline})`,
    ).toBe(1);
    const { data: product } = await admin
      .from("products")
      .select("id")
      .eq("id", productId);
    expect(product ?? [], "the product must survive regardless").toHaveLength(
      1,
    );
  });
});
