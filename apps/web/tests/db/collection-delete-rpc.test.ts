import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canDeleteCollection } from "@inklee/shared/collections";
import {
  adminClient,
  anonClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";
import { PgSession } from "./helpers/pg-session";
import {
  DELETE_ELIGIBILITY_CASES,
  type DeleteEligibilityCase,
} from "./helpers/delete-eligibility-cases";

/**
 * Branch coverage for `delete_collection_if_eligible` (migration 0124).
 *
 * Before this file, NO test anywhere in the repository referenced this
 * function by name. It is the only path that deletes a collection, it decides
 * whether an artist's arranging work survives, and its entire behaviour rested
 * on a migration header nobody could execute.
 *
 * Every call below goes through the real anon-key PostgREST client holding a
 * real JWT, because that is the production path and because a service-role
 * client bypasses both RLS and EXECUTE grants: it would return the same
 * verdicts whether or not the security this function relies on exists.
 *
 * The concurrency behaviour is NOT here. See `collection-delete-race.test.ts`.
 */

let admin: SupabaseClient;
let owner: Actor;
let other: Actor;
let pg: PgSession;

/** `other`'s rows, used to prove the caller cannot see or touch them. */
let otherEmptyCollectionId: string;
let otherPopulatedCollectionId: string;

const NONEXISTENT_ID = "00000000-0000-4000-8000-0000000000ff";

async function makeCollection(actor: Actor, name: string): Promise<string> {
  const { data, error } = await actor.client
    .from("product_collections")
    .insert({ artist_id: actor.id, name })
    .select("id")
    .single();
  expect(error, `collection setup failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

/** Returns the created product ids, so the test can prove they SURVIVE. */
async function fillCollection(
  actor: Actor,
  collectionId: string,
  count: number,
  label: string,
): Promise<string[]> {
  const productIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const { data: product, error: productError } = await actor.client
      .from("products")
      .insert({
        artist_id: actor.id,
        title: `${label} ${i}`,
        price_amount: 10 + i,
        currency: "eur",
      })
      .select("id")
      .single();
    expect(
      productError,
      `product setup failed: ${productError?.message}`,
    ).toBeNull();
    productIds.push(product!.id as string);

    const { error: itemError } = await actor.client
      .from("product_collection_items")
      .insert({
        collection_id: collectionId,
        product_id: product!.id,
        artist_id: actor.id,
        position: i,
      });
    // Captured and asserted, never fired-and-forgotten. An undestructured
    // setup write makes a silent RLS rejection invisible, and then the
    // assertions below measure an empty fixture instead of the rule.
    expect(
      itemError,
      `membership setup failed: ${itemError?.message}`,
    ).toBeNull();
  }
  return productIds;
}

async function archive(actor: Actor, collectionId: string): Promise<void> {
  const { data, error } = await actor.client
    .from("product_collections")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", collectionId)
    .select("id, archived_at");
  expect(error, `archive failed: ${error?.message}`).toBeNull();
  expect(data, "the archive must affect exactly one row").toHaveLength(1);
  // The transition is ASSERTED, not merely issued. A trigger pinning
  // `archived_at` to its old value makes every archive a silent no-op while
  // still reporting one affected row, and every downstream assertion in an
  // archived case would then be measuring a LIVE collection.
  expect(
    data![0].archived_at,
    "the collection must actually BE archived, or the archived cases test the live rule",
  ).not.toBeNull();
}

async function callRpc(
  client: SupabaseClient,
  collectionId: string,
  artistId: string,
) {
  return client.rpc("delete_collection_if_eligible", {
    p_collection_id: collectionId,
    p_artist_id: artistId,
  });
}

beforeAll(async () => {
  admin = adminClient();
  pg = PgSession.open("catalog");
  owner = await makeActor(admin, "rpc-owner");
  other = await makeActor(admin, "rpc-other");

  otherEmptyCollectionId = await makeCollection(other, "Other empty");
  otherPopulatedCollectionId = await makeCollection(other, "Other populated");
  await fillCollection(other, otherPopulatedCollectionId, 1, "Other product");
}, 60_000);

afterAll(async () => {
  await pg.close();
  await destroyActor(admin, owner);
  await destroyActor(admin, other);
}, 60_000);

describe("the delete-eligibility case table itself", () => {
  // A shared table is only a guard while it is COMPLETE. Narrowing it to the
  // cases that currently pass is the cheapest way to make a red suite green,
  // and it leaves no trace.
  it("covers the full 2x2 of empty/populated by live/archived", () => {
    const seen = DELETE_ELIGIBILITY_CASES.map(
      (c) =>
        `${c.memberCount === 0 ? "empty" : "populated"}/${c.archived ? "archived" : "live"}`,
    ).sort();
    expect(seen).toEqual([
      "empty/archived",
      "empty/live",
      "populated/archived",
      "populated/live",
    ]);
  });

  it("never declares a verdict that contradicts its own eligibility flag", () => {
    for (const c of DELETE_ELIGIBILITY_CASES) {
      expect(c.rpc, `case "${c.name}"`).toBe(
        c.canDelete ? "deleted" : "not_eligible",
      );
      expect(c.collectionSurvives, `case "${c.name}"`).toBe(!c.canDelete);
    }
  });
});

describe("delete_collection_if_eligible: TypeScript and SQL agree on every branch", () => {
  // BOTH DRIFT DIRECTIONS EXECUTED, 2026-07-29, one at a time and each
  // restored afterwards. These are the runs that make this block an anti-drift
  // guard rather than a claim of one.
  //
  //  - TypeScript drifts: `canDeleteCollection` changed to `memberCount === 0`
  //    (dropping the archive bypass). EXACTLY ONE test red, "populated and
  //    archived", on the TypeScript assertion:
  //      "canDeleteCollection disagrees with the shared table (Archive is the
  //       deliberate first act...): expected false to be true"
  //    The SQL was untouched and never contradicted.
  //
  //  - SQL drifts: 0124's predicate reduced to `archived_at is not null`
  //    (dropping the empty bypass), md5 `a78f6f42…`. "empty and live" red on
  //    the SQL assertion:
  //      "the RPC disagrees with the shared table (Nothing to lose...):
  //       expected 'not_eligible' to be 'deleted'"
  //    TypeScript stayed green throughout, which is the point: the unit suite
  //    cannot see this mutation at all, and before this file nothing could.
  for (const c of DELETE_ELIGIBILITY_CASES as DeleteEligibilityCase[]) {
    it(`${c.name}: canDeleteCollection=${c.canDelete}, rpc=${c.rpc}`, async () => {
      const collectionId = await makeCollection(owner, `Case: ${c.name}`);
      const productIds = await fillCollection(
        owner,
        collectionId,
        c.memberCount,
        `Case ${c.name}`,
      );
      if (c.archived) await archive(owner, collectionId);

      // PRECONDITION. Read the fixture back rather than trusting the writes.
      // "populated" that is silently empty turns the one refusal in the table
      // into the empty case, and the test would pass for the wrong reason.
      const { data: before, error: beforeError } = await owner.client
        .from("product_collection_items")
        .select("id")
        .eq("collection_id", collectionId);
      expect(beforeError, beforeError?.message).toBeNull();
      expect(
        before,
        `the fixture must actually hold ${c.memberCount} membership row(s)`,
      ).toHaveLength(c.memberCount);

      const { data: row, error: rowError } = await owner.client
        .from("product_collections")
        .select("id, archived_at")
        .eq("id", collectionId)
        .single();
      expect(rowError, rowError?.message).toBeNull();
      expect(
        row!.archived_at === null,
        `the fixture must be ${c.archived ? "archived" : "live"}`,
      ).toBe(!c.archived);

      // IMPLEMENTATION 1: the TypeScript rule the UI enables the button from.
      expect(
        canDeleteCollection(
          {
            id: collectionId,
            name: c.name,
            position: 0,
            isPublicVisible: true,
            archivedAt: row!.archived_at as string | null,
          },
          c.memberCount,
        ),
        `canDeleteCollection disagrees with the shared table (${c.rationale})`,
      ).toBe(c.canDelete);

      // IMPLEMENTATION 2: what the database actually does.
      const { data: verdict, error: rpcError } = await callRpc(
        owner.client,
        collectionId,
        owner.id,
      );
      expect(rpcError, rpcError?.message).toBeNull();
      expect(
        verdict,
        `the RPC disagrees with the shared table (${c.rationale})`,
      ).toBe(c.rpc);

      // The verdict is a string. Whether it MEANT anything is a separate
      // question, and the rest of this test is that question.
      const { data: after, error: afterError } = await owner.client
        .from("product_collections")
        .select("id")
        .eq("id", collectionId);
      expect(afterError, afterError?.message).toBeNull();
      expect(
        after ?? [],
        c.collectionSurvives
          ? "the refused collection must still be there"
          : "a 'deleted' verdict must actually remove the row",
      ).toHaveLength(c.collectionSurvives ? 1 : 0);

      const { data: items, error: itemsError } = await owner.client
        .from("product_collection_items")
        .select("id")
        .eq("collection_id", collectionId);
      expect(itemsError, itemsError?.message).toBeNull();
      expect(
        items ?? [],
        c.collectionSurvives
          ? "a refusal must leave membership untouched"
          : "deleting the collection must cascade its membership away",
      ).toHaveLength(c.collectionSurvives ? c.memberCount : 0);

      // THE PRODUCTS SURVIVE. This is the whole reason the cascade is scoped
      // to the join table: a collection is an arrangement of stock, and
      // deleting an arrangement must never delete the stock. With
      // `on delete cascade` on the wrong side, everything above still passes.
      for (const productId of productIds) {
        const { data: product, error: productError } = await owner.client
          .from("products")
          .select("id")
          .eq("id", productId);
        expect(productError, productError?.message).toBeNull();
        expect(
          product ?? [],
          "the product must survive its collection",
        ).toHaveLength(1);
      }
    });
  }
});

describe("delete_collection_if_eligible: identity is not leakable", () => {
  it("reads another artist's collection exactly like an id that never existed", async () => {
    // POSITIVE CONTROL FIRST. Without it, "everything reads as gone" satisfies
    // this test just as well as the real property, and a function that had
    // stopped working entirely would look like perfect isolation.
    const ownCollectionId = await makeCollection(owner, "Leak control");
    await fillCollection(owner, ownCollectionId, 1, "Leak control product");
    const control = await callRpc(owner.client, ownCollectionId, owner.id);
    expect(control.error, control.error?.message).toBeNull();
    expect(
      control.data,
      "the caller must be able to get a non-'gone' verdict at all",
    ).toBe("not_eligible");

    // `other`'s collection is POPULATED, so a leak through the existence check
    // would surface as `not_eligible` rather than `gone`.
    const foreign = await callRpc(
      owner.client,
      otherPopulatedCollectionId,
      owner.id,
    );
    expect(foreign.error, foreign.error?.message).toBeNull();

    const absent = await callRpc(owner.client, NONEXISTENT_ID, owner.id);
    expect(absent.error, absent.error?.message).toBeNull();

    expect(
      foreign.data,
      "another artist's collection must read as 'gone'",
    ).toBe("gone");
    expect(
      foreign.data,
      "an existing foreign row must be INDISTINGUISHABLE from an id that never existed",
    ).toBe(absent.data);

    const { data: survivors } = await admin
      .from("product_collections")
      .select("id")
      .eq("id", otherPopulatedCollectionId);
    expect(
      survivors ?? [],
      "the foreign collection must still exist",
    ).toHaveLength(1);
  });

  it("ignores a spoofed p_artist_id naming the real owner", async () => {
    // The sharpest version of the bypass: `other`'s EMPTY collection, so the
    // function's own eligibility predicate says yes and the `artist_id =
    // p_artist_id` filter matches. Only the DELETE policy stands between this
    // call and destroying a row belonging to someone else.
    //
    // EXECUTED rather than argued: recompiled as `security definer` (md5
    // `089c1ecb…`), this test goes red with
    //   "a spoofed p_artist_id must not grant access to another artist's row:
    //    expected 'deleted' to be 'gone'"
    // and `other`'s collection was in fact destroyed.
    //
    // AND IT IS THE ONLY BRANCH TEST THAT NOTICES. Under the same mutation the
    // sibling test above stayed GREEN, because it passes `p_artist_id =
    // owner.id`, and the function's own explicit `artist_id = p_artist_id`
    // filter excludes the foreign row without RLS being involved at all. That
    // filter is real defense-in-depth and it survives an RLS bypass, which is
    // exactly why it also hides one. Delete this test and nothing in the suite
    // distinguishes SECURITY INVOKER from DEFINER by behaviour.
    const spoof = await callRpc(
      owner.client,
      otherEmptyCollectionId,
      other.id, // NOT the caller
    );
    expect(spoof.error, spoof.error?.message).toBeNull();
    expect(
      spoof.data,
      "a spoofed p_artist_id must not grant access to another artist's row",
    ).toBe("gone");

    const { data: survivors } = await admin
      .from("product_collections")
      .select("id")
      .eq("id", otherEmptyCollectionId);
    expect(
      survivors ?? [],
      "the foreign collection must still exist after the spoofed call",
    ).toHaveLength(1);
  });

  it("reads an already-deleted collection as 'gone', so a retry is harmless", async () => {
    const collectionId = await makeCollection(owner, "Retry twice");
    const first = await callRpc(owner.client, collectionId, owner.id);
    expect(first.error, first.error?.message).toBeNull();
    expect(first.data).toBe("deleted");

    // A retried request landing after the delete already succeeded is the most
    // ordinary thing a client does. It must not error and must not be
    // reported to the artist as a failure of something that worked.
    const second = await callRpc(owner.client, collectionId, owner.id);
    expect(second.error, second.error?.message).toBeNull();
    expect(second.data).toBe("gone");
  });
});

describe("delete_collection_if_eligible: EXECUTE grants", () => {
  // Deliberately NOT `set role anon`. That statement SEGFAULTS this Supabase
  // Postgres image and takes the backend down with it, established by
  // execution elsewhere in the 2026-07-29 session and therefore NOT re-run
  // here. `has_function_privilege` answers the same question without ever
  // assuming the role, and the behavioural check below uses a real anon-key
  // PostgREST client instead.
  it("is granted to authenticated and to nobody else public-facing", async () => {
    const rows = await pg.query<{
      anon: boolean;
      authenticated: boolean;
      pub: boolean;
    }>(
      `select has_function_privilege('anon', $1, 'execute') as anon,
              has_function_privilege('authenticated', $1, 'execute') as authenticated,
              has_function_privilege('public', $1, 'execute') as pub`,
      ["delete_collection_if_eligible(uuid,uuid)"],
    );
    expect(
      rows[0].authenticated,
      "the artist's own client must be able to call it",
    ).toBe(true);
    expect(rows[0].anon, "a public visitor must not be able to call it").toBe(
      false,
    );
    expect(rows[0].pub, "PUBLIC must not carry it either").toBe(false);
  });

  it("stays SECURITY INVOKER, which is what makes RLS apply at all", async () => {
    // Every isolation claim in this file depends on this one bit. Flip it to
    // DEFINER and the function runs as its owner, RLS stops filtering, and the
    // spoofed-p_artist_id test above becomes the only thing standing between a
    // caller and another artist's rows. Executed: under that mutation this
    // test and that one both go red, and nothing else in this describe block
    // does.
    const rows = await pg.query<{ secdef: boolean }>(
      "select prosecdef as secdef from pg_proc where proname = 'delete_collection_if_eligible'",
    );
    expect(rows, "the function must exist").toHaveLength(1);
    expect(rows[0].secdef).toBe(false);
  });

  it("refuses an anon-key caller with 42501, while the same route works", async () => {
    // The catalog check above and this one answer different questions. That one
    // reads the grant; this one proves the grant is what the deployed route
    // enforces. The service-role call is the positive control: it proves the
    // endpoint EXISTS, so the anon refusal is a permission refusal rather than
    // a 404 from a function that was never deployed.
    const control = await callRpc(admin, otherPopulatedCollectionId, other.id);
    expect(control.error, control.error?.message).toBeNull();
    expect(
      control.data,
      "the service-role control must reach a real verdict",
    ).toBe("not_eligible");

    const anon = anonClient();
    const { error } = await callRpc(anon, otherEmptyCollectionId, other.id);
    expect(error, "an anon caller must be refused").not.toBeNull();
    expect(error?.code, "expected a privilege refusal, not another error").toBe(
      "42501",
    );

    const { data: survivors } = await admin
      .from("product_collections")
      .select("id")
      .eq("id", otherEmptyCollectionId);
    expect(
      survivors ?? [],
      "the anon call must not have deleted anything",
    ).toHaveLength(1);
  });
});
