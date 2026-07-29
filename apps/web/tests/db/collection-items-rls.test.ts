import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dbEnv } from "./helpers/db-env";

/**
 * Authenticated database tests for product_collection_items (P5d, Gate B).
 *
 * The interesting property is not "the owner can write". It is that
 * `artist_id = auth.uid()` ALONE would have been insufficient: the FK proves a
 * referenced row exists, never who owns it, so an artist could otherwise file
 * someone else's product into their own collection just by naming the id. The
 * EXISTS clauses in the policy are what stop that, and the cross-account tests
 * below are what prove it.
 */

const { url: URL, anonKey: ANON, serviceKey: SERVICE } = dbEnv();

const PASSWORD = "Passw0rd!123";

type Actor = {
  id: string;
  client: SupabaseClient;
  collectionId: string;
  productId: string;
};

let admin: SupabaseClient;
let owner: Actor;
let other: Actor;

async function makeActor(label: string): Promise<Actor> {
  const email = `p5db-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  const { error: pErr } = await admin.from("profiles").upsert({
    id,
    slug: `p5db-${label}-${id.slice(0, 8)}`,
    display_name: `P5DB ${label}`,
  });
  if (pErr) throw pErr;

  const client = createClient(URL, ANON);
  const { error: sErr } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (sErr) throw sErr;

  const { data: col, error: cErr } = await client
    .from("product_collections")
    .insert({ artist_id: id, name: `${label} collection` })
    .select("id")
    .single();
  if (cErr) throw cErr;

  const { data: prod, error: prErr } = await client
    .from("products")
    .insert({
      artist_id: id,
      title: `${label} product`,
      price_amount: 20,
      currency: "eur",
    })
    .select("id")
    .single();
  if (prErr) throw prErr;

  return { id, client, collectionId: col.id, productId: prod.id };
}

async function destroyActor(a: Actor | undefined) {
  if (!a) return;
  await admin.from("product_collection_items").delete().eq("artist_id", a.id);
  await admin.from("products").delete().eq("artist_id", a.id);
  await admin.from("product_collections").delete().eq("artist_id", a.id);
  await admin.from("profiles").delete().eq("id", a.id);
  await admin.auth.admin.deleteUser(a.id);
}

beforeAll(async () => {
  admin = createClient(URL, SERVICE);
  owner = await makeActor("owner");
  other = await makeActor("other");
}, 60_000);

afterAll(async () => {
  await destroyActor(owner);
  await destroyActor(other);
}, 60_000);

describe("collection membership, owner", () => {
  it("adds a product to a collection", async () => {
    const { error } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: owner.collectionId,
        product_id: owner.productId,
        artist_id: owner.id,
        position: 0,
      });
    expect(error, error?.message).toBeNull();
  });

  it("refuses the same product twice in one collection", async () => {
    const { error } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: owner.collectionId,
        product_id: owner.productId,
        artist_id: owner.id,
        position: 1,
      });
    expect(error?.code).toBe("23505");
  });

  it("puts ONE product in TWO collections with independent positions", async () => {
    const { data: second } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Second" })
      .select("id")
      .single();

    const { error } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: second!.id,
        product_id: owner.productId,
        artist_id: owner.id,
        position: 7,
      });
    expect(error, error?.message).toBeNull();

    const { data: rows } = await owner.client
      .from("product_collection_items")
      .select("collection_id, position")
      .eq("product_id", owner.productId)
      .order("position", { ascending: true });
    expect(rows).toHaveLength(2);
    expect(rows!.map((r) => r.position)).toEqual([0, 7]);
  });

  it("reorders within a collection", async () => {
    const { error } = await owner.client
      .from("product_collection_items")
      .update({ position: 5 })
      .eq("collection_id", owner.collectionId)
      .eq("product_id", owner.productId);
    expect(error, error?.message).toBeNull();
  });

  it("removes a product from a collection without touching the product", async () => {
    const { data: extra, error: extraErr } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Removable",
        price_amount: 5,
        currency: "eur",
      })
      .select("id")
      .single();
    expect(extraErr, extraErr?.message).toBeNull();

    const { error: insertErr } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: owner.collectionId,
        product_id: extra!.id,
        artist_id: owner.id,
      });
    expect(insertErr, insertErr?.message).toBeNull();

    const { error: deleteErr } = await owner.client
      .from("product_collection_items")
      .delete()
      .eq("collection_id", owner.collectionId)
      .eq("product_id", extra!.id);
    expect(deleteErr, deleteErr?.message).toBeNull();

    const { data: stillThere } = await owner.client
      .from("products")
      .select("id")
      .eq("id", extra!.id);
    expect(stillThere).toHaveLength(1);
  });
});

describe("collection membership, cross-account", () => {
  // The FK proves the row exists; it says nothing about who owns it. Without
  // the EXISTS clauses in the policy, both of these would succeed.
  //
  // All three below assert 42501, not a foreign-key code, and that was
  // verified rather than assumed (probed directly against the local stack):
  // WITH CHECK is evaluated for an authenticated, non-service-role client
  // before the composite FK is ever consulted, so RLS rejects these rows on
  // its own EXISTS clauses / artist_id check first. The FK only becomes the
  // active guarantee once RLS is out of the picture, which is exactly what
  // the service-role tests in "cross-ownership is unrepresentable" below
  // exercise.
  //
  // Each also carries its own same-owner positive control on a FRESH row,
  // not a reused one: A8's original fix (in collections-rls.test.ts) never
  // got swept to this file, so all three previously asserted only
  // `not.toBeNull()`, which "every insert is blocked" satisfies just as well
  // as "cross-account inserts are blocked" — the exact class of vacuous pass
  // this gate exists to catch.
  it("cannot file ANOTHER artist's product into its own collection", async () => {
    const { data: ownProduct, error: setupErr } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "N1 control product",
        price_amount: 8,
        currency: "eur",
      })
      .select("id")
      .single();
    expect(setupErr, setupErr?.message).toBeNull();
    const control = await owner.client.from("product_collection_items").insert({
      collection_id: owner.collectionId,
      product_id: ownProduct!.id,
      artist_id: owner.id,
    });
    expect(control.error, control.error?.message).toBeNull();

    const { error } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: owner.collectionId,
        product_id: other.productId,
        artist_id: owner.id,
      });
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot file its own product into ANOTHER artist's collection", async () => {
    const { data: ownCollection, error: setupErr } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "N1 control collection" })
      .select("id")
      .single();
    expect(setupErr, setupErr?.message).toBeNull();
    const control = await owner.client.from("product_collection_items").insert({
      collection_id: ownCollection!.id,
      product_id: owner.productId,
      artist_id: owner.id,
    });
    expect(control.error, control.error?.message).toBeNull();

    const { error } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: other.collectionId,
        product_id: owner.productId,
        artist_id: owner.id,
      });
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot claim a membership row by naming someone else as owner", async () => {
    const { data: ownProduct, error: setupErr } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "N1 control product 2",
        price_amount: 8,
        currency: "eur",
      })
      .select("id")
      .single();
    expect(setupErr, setupErr?.message).toBeNull();
    const control = await owner.client.from("product_collection_items").insert({
      collection_id: owner.collectionId,
      product_id: ownProduct!.id,
      artist_id: owner.id,
    });
    expect(control.error, control.error?.message).toBeNull();

    const { error } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: other.collectionId,
        product_id: other.productId,
        artist_id: other.id,
      });
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot read another artist's membership rows", async () => {
    const { error: setupErr } = await other.client
      .from("product_collection_items")
      .insert({
        collection_id: other.collectionId,
        product_id: other.productId,
        artist_id: other.id,
      });
    expect(
      setupErr,
      "setup insert must succeed, or the read-hiding assertion below proves nothing",
    ).toBeNull();

    const { data } = await owner.client
      .from("product_collection_items")
      .select("id")
      .eq("collection_id", other.collectionId);
    expect(data ?? []).toHaveLength(0);
  });
});

describe("legacy column compatibility", () => {
  // `products` carries a FOR ALL policy, so a client built before the join
  // table can still write collection_id directly. The trigger is what stops
  // the two models silently disagreeing.
  it("mirrors a legacy collection_id write into the join table", async () => {
    const { data: prod } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Legacy assigned",
        price_amount: 9,
        currency: "eur",
      })
      .select("id")
      .single();

    await owner.client
      .from("products")
      .update({ collection_id: owner.collectionId })
      .eq("id", prod!.id);

    const { data: mirrored } = await owner.client
      .from("product_collection_items")
      .select("id")
      .eq("collection_id", owner.collectionId)
      .eq("product_id", prod!.id);
    expect(mirrored, "legacy write must appear in the new model").toHaveLength(
      1,
    );
  });

  it("removes the mirrored row when the legacy column is cleared", async () => {
    const { data: prod, error: insertErr } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Legacy cleared",
        price_amount: 9,
        currency: "eur",
        collection_id: owner.collectionId,
      })
      .select("id")
      .single();
    expect(insertErr, insertErr?.message).toBeNull();

    // Precondition: the mirror must exist BEFORE clearing, or "it's gone
    // after clearing" borrows its guarantee from a sibling test instead of
    // proving anything itself.
    const { data: mirroredBefore } = await owner.client
      .from("product_collection_items")
      .select("id")
      .eq("product_id", prod!.id);
    expect(
      mirroredBefore,
      "the mirror must exist before it can be cleared",
    ).toHaveLength(1);

    const { error: updateErr } = await owner.client
      .from("products")
      .update({ collection_id: null })
      .eq("id", prod!.id);
    expect(updateErr, updateErr?.message).toBeNull();

    const { data: gone } = await owner.client
      .from("product_collection_items")
      .select("id")
      .eq("product_id", prod!.id);
    expect(gone ?? []).toHaveLength(0);
  });

  it("is idempotent: re-writing the same legacy value adds nothing", async () => {
    const { data: prod } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Legacy repeated",
        price_amount: 9,
        currency: "eur",
        collection_id: owner.collectionId,
      })
      .select("id")
      .single();

    await owner.client
      .from("products")
      .update({ collection_id: owner.collectionId, title: "Legacy repeated 2" })
      .eq("id", prod!.id);

    const { data: rows } = await owner.client
      .from("product_collection_items")
      .select("id")
      .eq("product_id", prod!.id);
    expect(rows).toHaveLength(1);
  });

  it("cascades membership away when a product is hard-deleted", async () => {
    const { data: prod, error: prodErr } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Doomed product",
        price_amount: 9,
        currency: "eur",
      })
      .select("id")
      .single();
    expect(prodErr, prodErr?.message).toBeNull();

    const { error: itemErr } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: owner.collectionId,
        product_id: prod!.id,
        artist_id: owner.id,
      });
    expect(itemErr, itemErr?.message).toBeNull();

    const { error: deleteErr } = await owner.client
      .from("products")
      .delete()
      .eq("id", prod!.id);
    expect(deleteErr, deleteErr?.message).toBeNull();

    const { data: rows } = await owner.client
      .from("product_collection_items")
      .select("id")
      .eq("product_id", prod!.id);
    expect(rows ?? []).toHaveLength(0);
  });
});

describe("cross-ownership is unrepresentable, not merely denied", () => {
  // These run as the SERVICE role, which bypasses RLS entirely. That is the
  // point: policies constrain client roles only, and the service client is what
  // runs webhooks, admin paths and backfills. If the guarantee lived only in
  // the WITH CHECK, every one of those callers could still write a row pairing
  // one artist's collection with another's product. The composite foreign keys
  // added in 0122 are what make that state unstorable for EVERY role.
  it("refuses a cross-owner membership even as the service role", async () => {
    const { error } = await admin.from("product_collection_items").insert({
      collection_id: owner.collectionId,
      product_id: other.productId,
      artist_id: owner.id,
    });
    expect(error, "the FK must reject this").not.toBeNull();
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses a membership whose artist_id disagrees with its parents", async () => {
    // A FRESH product, deliberately. Reusing owner.productId here returned
    // 23505 instead: the (collection, product) pair already existed from an
    // earlier test, so the unique constraint rejected the row before the
    // foreign key was ever consulted, and the test proved nothing about
    // ownership. The pair below is new, so only the FK can refuse it.
    const { data: prod } = await admin
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Mismatched owner",
        price_amount: 14,
        currency: "eur",
      })
      .select("id")
      .single();

    const { error } = await admin.from("product_collection_items").insert({
      collection_id: owner.collectionId,
      product_id: prod!.id,
      artist_id: other.id,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("still accepts a correct row as the service role", async () => {
    // Positive control: the rejections above are about ownership, not about
    // the service role being unable to write this table at all.
    const { data: prod } = await admin
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Service inserted",
        price_amount: 11,
        currency: "eur",
      })
      .select("id")
      .single();
    const { error } = await admin.from("product_collection_items").insert({
      collection_id: owner.collectionId,
      product_id: prod!.id,
      artist_id: owner.id,
    });
    expect(error, error?.message).toBeNull();
  });
});

describe("archive lifecycle", () => {
  // Archiving is the reversible retirement, and that is only true if it keeps
  // membership AND per-collection ordering. If a restore came back empty or
  // reshuffled, archive would just be a slower delete.
  it("keeps membership and order across an archive/restore round trip", async () => {
    const { data: c } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Seasonal" })
      .select("id")
      .single();

    const ids: string[] = [];
    for (const n of [0, 1, 2]) {
      const { data: p } = await owner.client
        .from("products")
        .insert({
          artist_id: owner.id,
          title: `Arch ${n}`,
          price_amount: 12,
          currency: "eur",
        })
        .select("id")
        .single();
      ids.push(p!.id);
      await owner.client.from("product_collection_items").insert({
        collection_id: c!.id,
        product_id: p!.id,
        artist_id: owner.id,
        position: 2 - n, // deliberately not insertion order
      });
    }

    const before = await owner.client
      .from("product_collection_items")
      .select("product_id, position")
      .eq("collection_id", c!.id)
      .order("position", { ascending: true });

    await owner.client
      .from("product_collections")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", c!.id);

    const { data: whileArchived } = await owner.client
      .from("product_collection_items")
      .select("id")
      .eq("collection_id", c!.id);
    expect(whileArchived, "archiving must not drop membership").toHaveLength(3);

    const { error: restoreError } = await owner.client
      .from("product_collections")
      .update({ archived_at: null })
      .eq("id", c!.id);
    expect(restoreError, restoreError?.message).toBeNull();

    const after = await owner.client
      .from("product_collection_items")
      .select("product_id, position")
      .eq("collection_id", c!.id)
      .order("position", { ascending: true });
    expect(after.data).toEqual(before.data);
  });

  it("deleting a collection removes membership but never the products", async () => {
    const { data: c, error: cErr } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Doomed section" })
      .select("id")
      .single();
    expect(cErr, cErr?.message).toBeNull();

    const { data: p, error: pErr } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Survivor",
        price_amount: 13,
        currency: "eur",
      })
      .select("id")
      .single();
    expect(pErr, pErr?.message).toBeNull();

    const { error: itemErr } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: c!.id,
        product_id: p!.id,
        artist_id: owner.id,
      });
    expect(itemErr, itemErr?.message).toBeNull();

    const { error: deleteErr } = await owner.client
      .from("product_collections")
      .delete()
      .eq("id", c!.id);
    expect(deleteErr, deleteErr?.message).toBeNull();

    const { data: items } = await owner.client
      .from("product_collection_items")
      .select("id")
      .eq("collection_id", c!.id);
    expect(items ?? []).toHaveLength(0);

    const { data: stillThere } = await owner.client
      .from("products")
      .select("id")
      .eq("id", p!.id);
    expect(stillThere, "the product must survive its collection").toHaveLength(
      1,
    );
  });
});
