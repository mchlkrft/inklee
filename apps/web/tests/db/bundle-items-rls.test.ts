import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dbEnv } from "./helpers/db-env";

/**
 * Authenticated database tests for product_bundle_items (Stage 3).
 *
 * The property that matters is not "the owner can write". It is that
 * `artist_id = auth.uid()` ALONE is insufficient: the FK proves a referenced
 * row exists, never who owns it, so without the EXISTS clauses in the policy an
 * artist could file someone else's product into their own bundle by naming the
 * id. The cross-account tests prove the policy stops it; the service-role tests
 * prove the composite FKs make a cross-owner row unstorable even for the role
 * that bypasses RLS.
 */

const { url: URL, anonKey: ANON, serviceKey: SERVICE } = dbEnv();

const PASSWORD = "Passw0rd!123";

type Actor = {
  id: string;
  client: SupabaseClient;
  bundleId: string;
  productId: string;
};

let admin: SupabaseClient;
let owner: Actor;
let other: Actor;

async function makeActor(label: string): Promise<Actor> {
  const email = `bitem-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  const { error: pErr } = await admin.from("profiles").upsert({
    id,
    slug: `bitem-${label}-${id.slice(0, 8)}`,
    display_name: `BITEM ${label}`,
  });
  if (pErr) throw pErr;

  const client = createClient(URL, ANON);
  const { error: sErr } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (sErr) throw sErr;

  const { data: b, error: bErr } = await client
    .from("product_bundles")
    .insert({ artist_id: id, name: `${label} bundle`, price_amount: 40 })
    .select("id")
    .single();
  if (bErr) throw bErr;

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

  return { id, client, bundleId: b.id, productId: prod.id };
}

async function destroyActor(a: Actor | undefined) {
  if (!a) return;
  await admin.from("product_bundle_items").delete().eq("artist_id", a.id);
  await admin.from("products").delete().eq("artist_id", a.id);
  await admin.from("product_bundles").delete().eq("artist_id", a.id);
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

describe("bundle items, owner", () => {
  it("adds a product to a bundle with a quantity", async () => {
    const { error } = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: owner.productId,
      artist_id: owner.id,
      quantity: 2,
      position: 0,
    });
    expect(error, error?.message).toBeNull();
  });

  it("refuses the same product twice in one bundle", async () => {
    const { error } = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: owner.productId,
      artist_id: owner.id,
      position: 1,
    });
    expect(error?.code).toBe("23505");
  });

  it("rejects a non-positive quantity", async () => {
    const { data: p } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Q",
        price_amount: 5,
        currency: "eur",
      })
      .select("id")
      .single();
    const { error } = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: p!.id,
      artist_id: owner.id,
      quantity: 0,
    });
    expect(error?.code, "the quantity check must reject 0").toBe("23514");
  });
});

describe("bundle items, cross-account", () => {
  it("cannot file ANOTHER artist's product into its own bundle", async () => {
    // Positive control on a fresh owned product first.
    const { data: ownProduct } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "ctrl",
        price_amount: 8,
        currency: "eur",
      })
      .select("id")
      .single();
    const control = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: ownProduct!.id,
      artist_id: owner.id,
    });
    expect(control.error, control.error?.message).toBeNull();

    const { error } = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: other.productId,
      artist_id: owner.id,
    });
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot file its own product into ANOTHER artist's bundle", async () => {
    const { data: ownBundle } = await owner.client
      .from("product_bundles")
      .insert({ artist_id: owner.id, name: "ctrl bundle" })
      .select("id")
      .single();
    const control = await owner.client.from("product_bundle_items").insert({
      bundle_id: ownBundle!.id,
      product_id: owner.productId,
      artist_id: owner.id,
    });
    expect(control.error, control.error?.message).toBeNull();

    const { error } = await owner.client.from("product_bundle_items").insert({
      bundle_id: other.bundleId,
      product_id: owner.productId,
      artist_id: owner.id,
    });
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot read another artist's bundle items", async () => {
    const control = await other.client.from("product_bundle_items").insert({
      bundle_id: other.bundleId,
      product_id: other.productId,
      artist_id: other.id,
    });
    expect(control.error, control.error?.message).toBeNull();
    const { data } = await owner.client
      .from("product_bundle_items")
      .select("id")
      .eq("bundle_id", other.bundleId);
    expect(data ?? []).toHaveLength(0);
  });
});

describe("cross-ownership is unrepresentable, not merely denied (service role)", () => {
  it("refuses a cross-owner bundle item even as the service role (FK 23503)", async () => {
    const { error } = await admin.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: other.productId,
      artist_id: owner.id,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses an item whose artist_id disagrees with its parents", async () => {
    const { data: prod } = await admin
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "mismatch",
        price_amount: 14,
        currency: "eur",
      })
      .select("id")
      .single();
    const { error } = await admin.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: prod!.id,
      artist_id: other.id,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("still accepts a correct row as the service role (positive control)", async () => {
    const { data: prod } = await admin
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "svc ok",
        price_amount: 11,
        currency: "eur",
      })
      .select("id")
      .single();
    const { error } = await admin.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: prod!.id,
      artist_id: owner.id,
    });
    expect(error, error?.message).toBeNull();
  });
});

describe("bundle item cascades", () => {
  it("cascades items away when a product is hard-deleted", async () => {
    const { data: prod } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "doomed",
        price_amount: 9,
        currency: "eur",
      })
      .select("id")
      .single();
    await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: prod!.id,
      artist_id: owner.id,
    });
    await owner.client.from("products").delete().eq("id", prod!.id);
    const { data: rows } = await owner.client
      .from("product_bundle_items")
      .select("id")
      .eq("product_id", prod!.id);
    expect(rows ?? []).toHaveLength(0);
  });

  it("cascades items away when the bundle is deleted", async () => {
    const { data: b } = await owner.client
      .from("product_bundles")
      .insert({
        artist_id: owner.id,
        name: "doomed bundle",
        archived_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const { data: prod } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "in doomed",
        price_amount: 9,
        currency: "eur",
      })
      .select("id")
      .single();
    await owner.client.from("product_bundle_items").insert({
      bundle_id: b!.id,
      product_id: prod!.id,
      artist_id: owner.id,
    });
    await owner.client.from("product_bundles").delete().eq("id", b!.id);
    const { data: items } = await owner.client
      .from("product_bundle_items")
      .select("id")
      .eq("bundle_id", b!.id);
    expect(items ?? []).toHaveLength(0);
    // The product survives losing its bundle.
    const { data: stillThere } = await owner.client
      .from("products")
      .select("id")
      .eq("id", prod!.id);
    expect(stillThere ?? []).toHaveLength(1);
  });
});
