import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";

/**
 * THE SELLER BOUNDARY (FD5, founder ruling 2026-08-01): "a cart belongs to
 * ONE artist. Products from different artists can never combine into one
 * payment." The brief mandates this be REFUSED, not filtered, not silently
 * dropped — this file is the mutation proof.
 *
 * `shop_cart_items.artist_id` is bound by TWO composite foreign keys at
 * once: (cart_id, artist_id) -> shop_carts(id, artist_id), and (product_id,
 * artist_id) -> products(id, artist_id). A row can only exist where BOTH the
 * cart's owner and the product's owner equal the SAME artist_id value — so a
 * cross-artist item is not representable for ANY role, including the
 * service role that is the ONLY writer of this table. This is the
 * strongest available form of "refused": the database itself cannot store
 * the violating row, which is a stronger guarantee than any application-code
 * check could provide on its own (a check can have a bug; a constraint
 * violation cannot be silently skipped by one).
 *
 * Every attempt below runs as the SERVICE ROLE (bypasses RLS entirely) —
 * this is deliberate: RLS is not what is being tested here, the FOREIGN KEY
 * is, and the service role is the only client that will ever touch this
 * table in production, so this is the actual attack surface (a bug in
 * `addProductToCart`/`resolveCartSelectionsForCheckout`, not a malicious
 * anon request, which 0141's REVOKE already stops cold per
 * shop-carts-rls.test.ts).
 */

const ADMIN_LABEL = "fd5-boundary";

let admin: SupabaseClient;
let sellerA: Actor;
let sellerB: Actor;
let productA: string;
let productB: string;
let bundleB: string;
let cartForSellerA: string;

beforeAll(async () => {
  admin = adminClient();
  sellerA = await makeActor(admin, `${ADMIN_LABEL}-a`);
  sellerB = await makeActor(admin, `${ADMIN_LABEL}-b`);

  const pa = await admin
    .from("products")
    .insert({
      artist_id: sellerA.id,
      title: "Seller A print",
      price_amount: 20,
      currency: "eur",
      status: "active",
      is_public_visible: true,
    })
    .select("id")
    .single();
  expect(pa.error, pa.error?.message).toBeNull();
  productA = pa.data!.id as string;

  const pb = await admin
    .from("products")
    .insert({
      artist_id: sellerB.id,
      title: "Seller B print",
      price_amount: 15,
      currency: "eur",
      status: "active",
      is_public_visible: true,
    })
    .select("id")
    .single();
  expect(pb.error, pb.error?.message).toBeNull();
  productB = pb.data!.id as string;

  const bb = await admin
    .from("product_bundles")
    .insert({
      artist_id: sellerB.id,
      name: "Seller B bundle",
      price_amount: 25,
      currency: "eur",
      is_public_visible: true,
    })
    .select("id")
    .single();
  expect(bb.error, bb.error?.message).toBeNull();
  bundleB = bb.data!.id as string;

  const cart = await admin
    .from("shop_carts")
    .insert({ guest_token_hash: "fd5-boundary-guest", artist_id: sellerA.id })
    .select("id")
    .single();
  expect(cart.error, cart.error?.message).toBeNull();
  cartForSellerA = cart.data!.id as string;
}, 60_000);

afterAll(async () => {
  for (const seller of [sellerA, sellerB]) {
    await admin.from("shop_cart_items").delete().eq("artist_id", seller.id);
    await admin.from("shop_carts").delete().eq("artist_id", seller.id);
    await admin.from("product_bundles").delete().eq("artist_id", seller.id);
    await admin.from("products").delete().eq("artist_id", seller.id);
    await admin.from("profiles").delete().eq("id", seller.id);
    await admin.auth.admin.deleteUser(seller.id);
  }
}, 60_000);

// ===========================================================================

describe("the seller boundary is a schema-level impossibility, not a filter", () => {
  it("POSITIVE CONTROL: a same-seller item inserts cleanly", async () => {
    const { error } = await admin.from("shop_cart_items").insert({
      cart_id: cartForSellerA,
      artist_id: sellerA.id,
      kind: "product",
      product_id: productA,
      quantity: 1,
    });
    expect(error, error?.message).toBeNull();
  });

  it("REFUSED: a cart_item naming seller A's cart but seller B's product", async () => {
    const { error } = await admin.from("shop_cart_items").insert({
      cart_id: cartForSellerA,
      // artist_id agrees with the CART here — the attack is smuggling a
      // foreign product in under the cart's own owner, exactly the shape a
      // bug in add-to-cart validation could produce.
      artist_id: sellerA.id,
      kind: "product",
      product_id: productB, // belongs to sellerB, not sellerA
      quantity: 1,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
    expect(error?.message).toMatch(/shop_cart_items_product_fk/);
  });

  it("REFUSED: a cart_item whose artist_id disagrees with its OWN cart's owner", async () => {
    const { error } = await admin.from("shop_cart_items").insert({
      cart_id: cartForSellerA, // owned by sellerA
      artist_id: sellerB.id, // claims sellerB
      kind: "product",
      product_id: productB, // consistent with the claimed artist_id...
      quantity: 1,
    });
    // ...but the CART fk catches it: (cart_id, artist_id) must match
    // shop_carts(id, artist_id), and this cart's id is bound to sellerA.
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
    expect(error?.message).toMatch(/shop_cart_items_cart_fk/);
  });

  it("REFUSED: a cross-artist BUNDLE item, same mechanism", async () => {
    const { error } = await admin.from("shop_cart_items").insert({
      cart_id: cartForSellerA,
      artist_id: sellerA.id,
      kind: "bundle",
      bundle_id: bundleB, // belongs to sellerB
      quantity: 1,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
    expect(error?.message).toMatch(/shop_cart_items_bundle_fk/);
  });

  it("no cross-artist row exists after every attempted mutation above", async () => {
    const { data } = await admin
      .from("shop_cart_items")
      .select("id, artist_id, product_id, bundle_id")
      .eq("cart_id", cartForSellerA);
    for (const row of data ?? []) {
      expect(
        row.artist_id,
        "every stored row must agree with its cart's own seller",
      ).toBe(sellerA.id);
    }
  });
});

// resolveCartSelectionsForCheckout's OWN application-level assertion (the
// defense-in-depth the FD5 brief also asked for: "never rely on the query
// already filtering it") is exercised against a MOCKED database in
// src/lib/server/__tests__/shop-cart.test.ts ("SELLER BOUNDARY: refuses the
// ENTIRE checkout..."), not here. This file intentionally stays scoped to
// what only a real Postgres instance can prove — the schema-level
// impossibility above — rather than importing the full application module
// graph (Stripe, Sentry, email, entitlements...) into the `tests/db/` harness,
// which every other file in this directory also avoids.
