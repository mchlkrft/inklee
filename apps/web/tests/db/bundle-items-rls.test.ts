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

async function makeVariant(
  client: SupabaseClient,
  productId: string,
  name: string,
): Promise<string> {
  const { data, error } = await client
    .from("product_variants")
    .insert({ product_id: productId, name })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

describe("bundle items, variant-aware (FD6, migration 0138)", () => {
  it("allows the SAME product twice in one bundle at TWO DIFFERENT variants", async () => {
    const { data: prod } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "two-variant product",
        price_amount: 25,
        currency: "eur",
      })
      .select("id")
      .single();
    const v1 = await makeVariant(owner.client, prod!.id, "Small");
    const v2 = await makeVariant(owner.client, prod!.id, "Large");

    const first = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: prod!.id,
      variant_id: v1,
      artist_id: owner.id,
    });
    expect(first.error, first.error?.message).toBeNull();

    // FAILS IF the unique constraint was left as (bundle_id, product_id):
    // this second slot for the SAME product would collide with the first
    // purely on product identity, even though the variant differs — exactly
    // the case FD6 exists to allow.
    const second = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: prod!.id,
      variant_id: v2,
      artist_id: owner.id,
    });
    expect(second.error, second.error?.message).toBeNull();
  });

  it("still refuses the SAME product at the SAME variant twice", async () => {
    const { data: prod } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "dup-variant product",
        price_amount: 25,
        currency: "eur",
      })
      .select("id")
      .single();
    const v1 = await makeVariant(owner.client, prod!.id, "Only");

    const first = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: prod!.id,
      variant_id: v1,
      artist_id: owner.id,
    });
    expect(first.error, first.error?.message).toBeNull();

    const { error } = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: prod!.id,
      variant_id: v1,
      artist_id: owner.id,
    });
    expect(error?.code, "expected the 3-column unique constraint to fire").toBe(
      "23505",
    );
  });

  it("refuses a variant that belongs to a DIFFERENT product, even the SAME owner's (RLS, 42501)", async () => {
    const { data: prodA } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "slot product",
        price_amount: 12,
        currency: "eur",
      })
      .select("id")
      .single();
    const { data: prodB } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "variant owner product",
        price_amount: 12,
        currency: "eur",
      })
      .select("id")
      .single();
    const foreignVariant = await makeVariant(owner.client, prodB!.id, "M");

    // Positive control: the SAME variant used on ITS OWN product succeeds,
    // so the refusal below is proven to be about ownership, not about the
    // variant or the FK being generally broken.
    const control = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: prodB!.id,
      variant_id: foreignVariant,
      artist_id: owner.id,
    });
    expect(control.error, control.error?.message).toBeNull();

    // FAILS IF the WITH CHECK's "variant belongs to product" clause is
    // dropped: the FK alone only proves foreignVariant EXISTS, not that it
    // belongs to prodA, and this insert would succeed, filing prodA's bundle
    // slot against a size chart that describes a completely different item.
    const { error } = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: prodA!.id,
      variant_id: foreignVariant,
      artist_id: owner.id,
    });
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("refuses a variant belonging to ANOTHER artist's product (RLS, 42501)", async () => {
    const foreignVariant = await makeVariant(
      other.client,
      other.productId,
      "Other's variant",
    );
    const { error } = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: owner.productId,
      variant_id: foreignVariant,
      artist_id: owner.id,
    });
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("a null variant_id is always accepted regardless of the product's own variants", async () => {
    const { data: prod } = await owner.client
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "null-slot product",
        price_amount: 12,
        currency: "eur",
      })
      .select("id")
      .single();
    await makeVariant(owner.client, prod!.id, "Ignored");

    const { error } = await owner.client.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: prod!.id,
      variant_id: null,
      artist_id: owner.id,
    });
    expect(error, error?.message).toBeNull();
  });

  it("DOCUMENTS the boundary: the service role is NOT stopped from a cross-product variant_id", async () => {
    // Deliberate, not a gap re-opened by accident: this table's write policies
    // exist for the ARTIST'S OWN client (the editor); the checkout snapshot
    // write is service-role and bypasses RLS entirely by design (0135's own
    // choice for order_item_bundle_components, extended here). The
    // money-path guard for THIS specific defect class lives in application
    // code (resolveBundleLines, goods-checkout.ts), re-verified at sale time
    // regardless of what any writer already proved — see migration 0138's own
    // comment. If this test ever starts failing (i.e. the service role gets
    // refused), the reasoning above is stale and should be revisited, not
    // just the test.
    const { data: prodA } = await admin
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "svc slot product",
        price_amount: 12,
        currency: "eur",
      })
      .select("id")
      .single();
    const { data: prodB } = await admin
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "svc variant owner product",
        price_amount: 12,
        currency: "eur",
      })
      .select("id")
      .single();
    const { data: variant } = await admin
      .from("product_variants")
      .insert({ product_id: prodB!.id, name: "svc variant" })
      .select("id")
      .single();

    const { error } = await admin.from("product_bundle_items").insert({
      bundle_id: owner.bundleId,
      product_id: prodA!.id,
      variant_id: variant!.id,
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
