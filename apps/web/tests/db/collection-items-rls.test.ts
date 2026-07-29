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
    const { data: extra } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Removable",
        price_amount: 5,
        currency: "eur",
      })
      .select("id")
      .single();
    await owner.client.from("product_collection_items").insert({
      collection_id: owner.collectionId,
      product_id: extra!.id,
      artist_id: owner.id,
    });
    await owner.client
      .from("product_collection_items")
      .delete()
      .eq("collection_id", owner.collectionId)
      .eq("product_id", extra!.id);

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
  it("cannot file ANOTHER artist's product into its own collection", async () => {
    const { error } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: owner.collectionId,
        product_id: other.productId,
        artist_id: owner.id,
      });
    expect(error, "foreign product must be rejected").not.toBeNull();
  });

  it("cannot file its own product into ANOTHER artist's collection", async () => {
    const { error } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: other.collectionId,
        product_id: owner.productId,
        artist_id: owner.id,
      });
    expect(error, "foreign collection must be rejected").not.toBeNull();
  });

  it("cannot claim a membership row by naming someone else as owner", async () => {
    const { error } = await owner.client
      .from("product_collection_items")
      .insert({
        collection_id: other.collectionId,
        product_id: other.productId,
        artist_id: other.id,
      });
    expect(error).not.toBeNull();
  });

  it("cannot read another artist's membership rows", async () => {
    await other.client.from("product_collection_items").insert({
      collection_id: other.collectionId,
      product_id: other.productId,
      artist_id: other.id,
    });
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
    const { data: prod } = await owner.client
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

    await owner.client
      .from("products")
      .update({ collection_id: null })
      .eq("id", prod!.id);

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
    const { data: prod } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Doomed product",
        price_amount: 9,
        currency: "eur",
      })
      .select("id")
      .single();
    await owner.client.from("product_collection_items").insert({
      collection_id: owner.collectionId,
      product_id: prod!.id,
      artist_id: owner.id,
    });

    await owner.client.from("products").delete().eq("id", prod!.id);

    const { data: rows } = await owner.client
      .from("product_collection_items")
      .select("id")
      .eq("product_id", prod!.id);
    expect(rows ?? []).toHaveLength(0);
  });
});
