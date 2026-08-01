import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  makeActor,
  type Actor,
} from "./helpers/actor";

/**
 * RLS lockdown for migration 0141 (FD5): `shop_carts`, `shop_cart_items`,
 * `shop_wishlist_items`.
 *
 * These tables have NO owning artist and NO authenticated buyer at all — the
 * product model has no buyer accounts (verified in the FD5 decision-log
 * entry: `signUp` only ever creates an artist profile). So unlike
 * `refunds`/`product_bundles` (SELECT-only-for-owner, or full CRUD for the
 * owning artist), these carry ZERO policies for ANY role. Every access goes
 * through a `"use server"` action on the service-role client, which verifies
 * the caller's guest-cookie token hash in application code — the same
 * posture 0030 already settled for `booking_requests`' customer-token
 * portal. `anon` and `authenticated` must therefore be refused on every
 * verb, and TRUNCATE must be blocked by the explicit REVOKE (RLS alone
 * cannot stop TRUNCATE).
 */

const ADMIN_LABEL = "fd5";

let admin: SupabaseClient;
let anon: SupabaseClient;
let owner: Actor; // an authenticated user exists only to prove "even a real
// session gets nothing" — these tables have no concept of this user at all.

let artistId: string;
let productId: string;
let cartId: string;

beforeAll(async () => {
  admin = adminClient();
  anon = anonClient();
  owner = await makeActor(admin, `${ADMIN_LABEL}-owner`);
  artistId = owner.id;

  const product = await admin
    .from("products")
    .insert({
      artist_id: artistId,
      title: "FD5 fixture product",
      price_amount: 20,
      currency: "eur",
      status: "active",
      is_public_visible: true,
    })
    .select("id")
    .single();
  expect(product.error, product.error?.message).toBeNull();
  productId = product.data!.id as string;

  const cart = await admin
    .from("shop_carts")
    .insert({ guest_token_hash: "fd5-rls-guest-hash", artist_id: artistId })
    .select("id")
    .single();
  expect(cart.error, cart.error?.message).toBeNull();
  cartId = cart.data!.id as string;
}, 60_000);

afterAll(async () => {
  await admin.from("shop_cart_items").delete().eq("artist_id", artistId);
  await admin.from("shop_carts").delete().eq("artist_id", artistId);
  await admin.from("shop_wishlist_items").delete().eq("artist_id", artistId);
  await admin.from("products").delete().eq("artist_id", artistId);
  await admin.from("profiles").delete().eq("id", artistId);
  await admin.auth.admin.deleteUser(artistId);
}, 60_000);

// ===========================================================================

describe("shop_carts: zero policies for anon or authenticated", () => {
  it("service role CAN read/write (positive control)", async () => {
    const { data, error } = await admin
      .from("shop_carts")
      .select("id")
      .eq("id", cartId);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  it("anon cannot SELECT any row (the 0141 REVOKE denies the grant outright, RLS never even runs)", async () => {
    const { data, error } = await anon
      .from("shop_carts")
      .select("id")
      .eq("id", cartId);
    expect(error?.code, "expected a permission rejection").toBe("42501");
    expect(error?.message).toContain("permission denied");
    expect(data).toBeNull();
  });

  it("an authenticated user cannot SELECT any row either — this table has no owner concept", async () => {
    const { data, error } = await owner.client
      .from("shop_carts")
      .select("id")
      .eq("id", cartId);
    expect(error?.code, "expected a permission rejection").toBe("42501");
    expect(data).toBeNull();
  });

  it("anon cannot INSERT", async () => {
    const { error } = await anon
      .from("shop_carts")
      .insert({ guest_token_hash: "forged", artist_id: artistId });
    expect(error?.code, "expected a permission rejection").toBe("42501");
    expect(error?.message).toContain("permission denied");
  });

  it("authenticated cannot INSERT", async () => {
    const { error } = await owner.client
      .from("shop_carts")
      .insert({ guest_token_hash: "forged", artist_id: artistId });
    expect(error?.code, "expected a permission rejection").toBe("42501");
  });

  it("anon cannot UPDATE", async () => {
    const { error } = await anon
      .from("shop_carts")
      .update({ currency: "usd" })
      .eq("id", cartId);
    expect(error?.code, "expected a permission rejection").toBe("42501");
    const { data: after } = await admin
      .from("shop_carts")
      .select("currency")
      .eq("id", cartId)
      .single();
    expect(after?.currency, "the row must be untouched").toBe("eur");
  });

  it("anon cannot DELETE", async () => {
    const { error } = await anon.from("shop_carts").delete().eq("id", cartId);
    expect(error?.code, "expected a permission rejection").toBe("42501");
    const { data: still } = await admin
      .from("shop_carts")
      .select("id")
      .eq("id", cartId);
    expect(still ?? [], "the cart must survive").toHaveLength(1);
  });
});

describe("shop_cart_items: zero policies for anon or authenticated", () => {
  let itemId: string;

  it("service role CAN write (positive control)", async () => {
    const { data, error } = await admin
      .from("shop_cart_items")
      .insert({
        cart_id: cartId,
        artist_id: artistId,
        kind: "product",
        product_id: productId,
        quantity: 1,
      })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    itemId = data!.id as string;
  });

  it("anon cannot SELECT any row", async () => {
    const { data, error } = await anon.from("shop_cart_items").select("id");
    expect(error?.code, "expected a permission rejection").toBe("42501");
    expect(data).toBeNull();
  });

  it("anon cannot INSERT", async () => {
    const { error } = await anon.from("shop_cart_items").insert({
      cart_id: cartId,
      artist_id: artistId,
      kind: "product",
      product_id: productId,
      quantity: 1,
    });
    expect(error?.code, "expected a permission rejection").toBe("42501");
  });

  it("authenticated cannot UPDATE", async () => {
    const { error } = await owner.client
      .from("shop_cart_items")
      .update({ quantity: 99 })
      .eq("id", itemId);
    expect(error?.code, "expected a permission rejection").toBe("42501");
  });

  it("anon cannot DELETE", async () => {
    const { error } = await anon
      .from("shop_cart_items")
      .delete()
      .eq("id", itemId);
    expect(error?.code, "expected a permission rejection").toBe("42501");
  });

  it("an authenticated role cannot TRUNCATE shop_cart_items — only the 0141 REVOKE holds it off", async () => {
    const { PgSession } = await import("./helpers/pg-session");
    const session = PgSession.open("fd5-truncate");
    try {
      await session.begin();
      // becomeArtist switches the RAW session (opened with superuser
      // credentials) to `authenticated` — without this the session stays
      // `postgres` and TRUNCATE would succeed, proving nothing (same
      // methodology as refund-ledger-rls.test.ts's own truncate test).
      // There is no "artist" concept for this table; any authenticated
      // subject demonstrates the same REVOKE-enforced refusal.
      await session.becomeArtist(owner.id);
      let code: string | undefined;
      try {
        await session.query("truncate shop_cart_items");
      } catch (e) {
        code = (e as { code?: string }).code;
      }
      expect(code, "TRUNCATE must be refused by the grant").toBe("42501");
      await session.rollbackIfOpen();
    } finally {
      await session.close();
    }
    const { data: still } = await admin
      .from("shop_cart_items")
      .select("id")
      .eq("id", itemId);
    expect(still ?? [], "the item must survive").toHaveLength(1);
  });
});

describe("shop_wishlist_items: zero policies for anon or authenticated", () => {
  let wishId: string;

  it("service role CAN write (positive control)", async () => {
    const { data, error } = await admin
      .from("shop_wishlist_items")
      .insert({
        guest_token_hash: "fd5-rls-wishlist-hash",
        artist_id: artistId,
        product_id: productId,
      })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    wishId = data!.id as string;
  });

  it("anon cannot SELECT, INSERT, UPDATE or DELETE", async () => {
    const sel = await anon
      .from("shop_wishlist_items")
      .select("id")
      .eq("id", wishId);
    expect(sel.error?.code, "expected a permission rejection").toBe("42501");
    expect(sel.data).toBeNull();

    const ins = await anon.from("shop_wishlist_items").insert({
      guest_token_hash: "forged",
      artist_id: artistId,
      product_id: productId,
    });
    expect(ins.error?.code).toBe("42501");

    const upd = await anon
      .from("shop_wishlist_items")
      .update({ artist_id: artistId })
      .eq("id", wishId);
    expect(upd.error?.code).toBe("42501");

    const del = await anon
      .from("shop_wishlist_items")
      .delete()
      .eq("id", wishId);
    expect(del.error?.code).toBe("42501");

    const { data: still } = await admin
      .from("shop_wishlist_items")
      .select("id")
      .eq("id", wishId);
    expect(still ?? [], "the wishlist entry must survive").toHaveLength(1);
  });
});
