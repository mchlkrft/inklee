import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dbEnv } from "./helpers/db-env";

/**
 * Authenticated database regression tests for product_bundles (Stage 3).
 *
 * Migration 0132 ships the write policies FROM DAY ONE (the 0120/0123 lesson:
 * a SELECT-only policy + user-scoped writes is a 100% broken feature that every
 * pure-function test still passes). This file is the gate that proves it: it
 * talks to a real Postgres through a real anon-key client with a real JWT, and
 * MUST fail if the per-command write policies are absent. A service-role test
 * would pass either way and is worthless here.
 *
 * FAILS LOUDLY when unconfigured; `dbEnv()` refuses any non-local target.
 */

const { url: URL, anonKey: ANON, serviceKey: SERVICE } = dbEnv();

const PASSWORD = "Passw0rd!123";

type Actor = { id: string; email: string; client: SupabaseClient };

let admin: SupabaseClient;
let owner: Actor;
let other: Actor;

async function makeActor(label: string): Promise<Actor> {
  const email = `bundle-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  const slug = `bundle-${label}-${id.slice(0, 8)}`;
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id, slug, display_name: `BUNDLE ${label}` });
  if (profileError) throw profileError;

  const client = createClient(URL, ANON);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  return { id, email, client };
}

async function destroyActor(a: Actor | undefined) {
  if (!a) return;
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

describe("product_bundles RLS, authenticated client", () => {
  it("lets an owner INSERT their own bundle", async () => {
    const { data, error } = await owner.client
      .from("product_bundles")
      .insert({ artist_id: owner.id, name: "Starter kit", price_amount: 40 })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("lets an owner UPDATE their own bundle", async () => {
    const { data: made } = await owner.client
      .from("product_bundles")
      .insert({ artist_id: owner.id, name: "Before" })
      .select("id")
      .single();
    const { data, error } = await owner.client
      .from("product_bundles")
      .update({ name: "After", price_amount: 25 })
      .eq("id", made!.id)
      .select("id, name")
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.name).toBe("After");
  });

  it("lets an owner DELETE their own bundle", async () => {
    const { data: made } = await owner.client
      .from("product_bundles")
      .insert({ artist_id: owner.id, name: "Doomed" })
      .select("id")
      .single();
    const { data, error } = await owner.client
      .from("product_bundles")
      .delete()
      .eq("id", made!.id)
      .select("id");
    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("lets an owner REORDER (asserts affected rows, not just no error)", async () => {
    const { data: made, error: madeErr } = await owner.client
      .from("product_bundles")
      .insert({ artist_id: owner.id, name: "Ordered" })
      .select("id")
      .single();
    expect(madeErr, madeErr?.message).toBeNull();
    // A silent RLS-denied UPDATE returns { data: [], error: null }; asserting
    // exactly one affected row is what catches a missing UPDATE policy.
    const { data: moved, error } = await owner.client
      .from("product_bundles")
      .update({ position: 3 })
      .eq("id", made!.id)
      .select("id, position");
    expect(error, error?.message).toBeNull();
    expect(moved, "the reorder must affect exactly one row").toHaveLength(1);
  });
});

describe("product_bundles cross-account isolation", () => {
  it("refuses an INSERT that names someone else as the owner (positive control first)", async () => {
    // Positive control: proves this client CAN insert at all, so the rejection
    // below is about ownership, not "all inserts blocked" (the trap that let a
    // missing-all-policies table pass a cross-account test).
    const control = await other.client
      .from("product_bundles")
      .insert({ artist_id: other.id, name: "Control" })
      .select("id")
      .single();
    expect(control.error, control.error?.message).toBeNull();

    const { error } = await other.client
      .from("product_bundles")
      .insert({ artist_id: owner.id, name: "Stolen" })
      .select("id")
      .single();
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot SELECT another artist's bundle", async () => {
    const { data: made } = await owner.client
      .from("product_bundles")
      .insert({ artist_id: owner.id, name: "Private" })
      .select("id")
      .single();
    const { data } = await other.client
      .from("product_bundles")
      .select("id")
      .eq("id", made!.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot UPDATE another artist's bundle", async () => {
    const { data: made } = await owner.client
      .from("product_bundles")
      .insert({ artist_id: owner.id, name: "Untouchable" })
      .select("id")
      .single();
    const { data } = await other.client
      .from("product_bundles")
      .update({ name: "Hijacked" })
      .eq("id", made!.id)
      .select("id");
    expect(data ?? []).toHaveLength(0);
    const { data: after } = await owner.client
      .from("product_bundles")
      .select("name")
      .eq("id", made!.id)
      .single();
    expect(after?.name).toBe("Untouchable");
  });

  it("cannot re-assign a bundle to another artist via UPDATE", async () => {
    const { data: made, error: madeErr } = await owner.client
      .from("product_bundles")
      .insert({ artist_id: owner.id, name: "Owned" })
      .select("id")
      .single();
    expect(madeErr, madeErr?.message).toBeNull();
    const { error } = await owner.client
      .from("product_bundles")
      .update({ artist_id: other.id })
      .eq("id", made!.id)
      .select("id");
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot DELETE another artist's bundle", async () => {
    const { data: made } = await owner.client
      .from("product_bundles")
      .insert({ artist_id: owner.id, name: "Persistent" })
      .select("id")
      .single();
    const { data } = await other.client
      .from("product_bundles")
      .delete()
      .eq("id", made!.id)
      .select("id");
    expect(data ?? []).toHaveLength(0);
    const { data: still } = await owner.client
      .from("product_bundles")
      .select("id")
      .eq("id", made!.id);
    expect(still ?? []).toHaveLength(1);
  });
});
