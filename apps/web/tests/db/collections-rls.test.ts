import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dbEnv } from "./helpers/db-env";

/**
 * Authenticated database regression tests for product_collections (P5d, Gate A).
 *
 * These exist because migration 0120 shipped the table with RLS enabled and a
 * SELECT policy only, while every write path uses the USER-scoped client. The
 * feature was pushed to production unable to insert a single row, and the
 * whole gate stayed green because every other test exercised pure functions.
 *
 * So: this file talks to a real Postgres through a real anon-key client with a
 * real JWT. It MUST fail if migration 0121's write policies are absent. A test
 * that runs as the service role would pass either way and would be worthless
 * here, which is precisely the trap that produced the defect.
 *
 * FAILS LOUDLY when unconfigured. It used to skip, which is how the suite that
 * proves the repair came to exit 0 having asserted nothing. `dbEnv()` also
 * refuses any non-local target: these tests create and delete real users.
 */

const { url: URL, anonKey: ANON, serviceKey: SERVICE } = dbEnv();

const PASSWORD = "Passw0rd!123";

type Actor = { id: string; email: string; client: SupabaseClient };

let admin: SupabaseClient;
let owner: Actor;
let other: Actor;

async function makeActor(label: string): Promise<Actor> {
  const email = `p5d-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  // `profiles.slug` is NOT NULL, and the upsert fails silently without it,
  // which then surfaces as an FK violation on the collection insert and looks
  // exactly like an RLS problem. Checked rather than assumed.
  const slug = `p5d-${label}-${id.slice(0, 8)}`;
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id, slug, display_name: `P5D ${label}` });
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

describe("product_collections RLS, authenticated client", () => {
  it("lets an owner INSERT their own collection", async () => {
    const { data, error } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Prints" })
      .select("id")
      .single();
    // The assertion that would have caught the shipped defect.
    expect(error, error?.message).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("lets an owner UPDATE their own collection", async () => {
    const { data: made } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Before" })
      .select("id")
      .single();
    const { data, error } = await owner.client
      .from("product_collections")
      .update({ name: "After" })
      .eq("id", made!.id)
      .select("id, name")
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.name).toBe("After");
  });

  it("lets an owner DELETE their own collection", async () => {
    const { data: made } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Doomed" })
      .select("id")
      .single();
    const { data, error } = await owner.client
      .from("product_collections")
      .delete()
      .eq("id", made!.id)
      .select("id");
    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("lets an owner REORDER their own collections", async () => {
    const { data: made, error: madeErr } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Ordered" })
      .select("id")
      .single();
    expect(madeErr, madeErr?.message).toBeNull();

    // ASSERTS AFFECTED ROWS. Through PostgREST an RLS-denied UPDATE returns
    // `{ data: [], error: null }`: it fails SILENTLY, so `expect(error)
    // .toBeNull()` proves nothing for this verb. The sibling UPDATE tests in
    // this block survive only because they chain `.select().single()`, which
    // turns zero rows into PGRST116; this one had no `.select()` at all.
    // Executed: with ONLY the UPDATE policy on this table dropped, three tests
    // in this file went red and this one stayed green.
    const { data: moved, error } = await owner.client
      .from("product_collections")
      .update({ position: 3 })
      .eq("id", made!.id)
      .select("id, position");
    expect(error, error?.message).toBeNull();
    expect(moved, "the reorder must affect exactly one row").toHaveLength(1);

    const { data: after } = await owner.client
      .from("product_collections")
      .select("position")
      .eq("id", made!.id)
      .single();
    expect(after?.position, "the new position must be durable").toBe(3);
  });

  it("lets an owner toggle visibility, which is the archive/restore shape", async () => {
    const { data: made } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Toggle" })
      .select("id")
      .single();
    const off = await owner.client
      .from("product_collections")
      .update({ is_public_visible: false })
      .eq("id", made!.id)
      .select("is_public_visible")
      .single();
    expect(off.error, off.error?.message).toBeNull();
    expect(off.data?.is_public_visible).toBe(false);
  });
});

describe("product_collections cross-account isolation", () => {
  it("refuses an INSERT that names someone else as the owner", async () => {
    // POSITIVE CONTROL FIRST, and it is the point of this test rather than
    // setup noise. Asserting only that the foreign insert errors accepts the
    // wrong error for the wrong reason: when every write policy was missing,
    // this was the ONE cross-account test that still passed, because "all
    // inserts are blocked" satisfies it just as well as "cross-account inserts
    // are blocked". The control proves this client can insert at all, so the
    // rejection below can only be about the ownership it named.
    const control = await other.client
      .from("product_collections")
      .insert({ artist_id: other.id, name: "Control" })
      .select("id")
      .single();
    expect(control.error, control.error?.message).toBeNull();

    // WITH CHECK is what stops this. USING alone would let it through.
    const { error } = await other.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Stolen" })
      .select("id")
      .single();
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot SELECT another artist's collection", async () => {
    const { data: made } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Private" })
      .select("id")
      .single();
    const { data } = await other.client
      .from("product_collections")
      .select("id")
      .eq("id", made!.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot UPDATE another artist's collection", async () => {
    const { data: made } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Untouchable" })
      .select("id")
      .single();
    const { data } = await other.client
      .from("product_collections")
      .update({ name: "Hijacked" })
      .eq("id", made!.id)
      .select("id");
    // RLS filters the row out rather than erroring: zero rows affected.
    //
    // WHAT THIS DOES NOT PROVE, established by execution: widening the UPDATE
    // policy to `using (true) with check (true)` leaves this test GREEN, and
    // the whole file green. The isolation actually being demonstrated here
    // comes from the SELECT policy, which decides which existing rows an
    // UPDATE's WHERE clause can even see. Widen SELECT and UPDATE together and
    // this test does go red, so it is not vacuous, but it cannot tell a sound
    // UPDATE policy from a wide-open one. That matters for THIS table: its
    // SELECT policy is `TO public`, and a future public-shop read policy would
    // silently remove the only protection this test is actually exercising.
    expect(data ?? []).toHaveLength(0);

    const { data: after } = await owner.client
      .from("product_collections")
      .select("name")
      .eq("id", made!.id)
      .single();
    expect(after?.name).toBe("Untouchable");
  });

  it("cannot re-assign a collection to itself via UPDATE", async () => {
    const { data: made, error: madeErr } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Owned" })
      .select("id")
      .single();
    expect(madeErr, madeErr?.message).toBeNull();

    // Asserts the specific code rather than just non-null: found during an
    // independent audit that this test had the same under-specified shape as
    // the "refuses an INSERT" test above before A8's fix, just never named.
    //
    // RETRACTION. This comment used to read "the owner may target the row, but
    // WITH CHECK rejects the new shape", and claimed that was verified
    // empirically. It was not. Executed 2026-07-29: widening ONLY this table's
    // UPDATE policy to `with check (true)`, leaving SELECT alone, still yields
    // 42501 and the re-assignment still does not land. So WITH CHECK is not
    // what produces this error. Postgres also requires the POST-UPDATE row to
    // satisfy the SELECT policy, and `artist_id = auth.uid()` fails there once
    // artist_id has been handed away. Dropping the SELECT policy with UPDATE
    // wide open turns this into `error: null` with the row simply invisible to
    // the WHERE clause, which is the third distinct behaviour.
    //
    // The assertion is kept: 42501 is the right observable. Only the
    // explanation of WHICH clause enforces it was wrong.
    const { error } = await owner.client
      .from("product_collections")
      .update({ artist_id: other.id })
      .eq("id", made!.id)
      .select("id");
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot DELETE another artist's collection", async () => {
    const { data: made } = await owner.client
      .from("product_collections")
      .insert({ artist_id: owner.id, name: "Persistent" })
      .select("id")
      .single();
    // Same caveat as the cross-account UPDATE above, and it was executed the
    // same way: widening the DELETE policy to `using (true)` leaves this test
    // green. It goes red only when the SELECT policy is widened alongside it.
    const { data } = await other.client
      .from("product_collections")
      .delete()
      .eq("id", made!.id)
      .select("id");
    expect(data ?? []).toHaveLength(0);

    const { data: still } = await owner.client
      .from("product_collections")
      .select("id")
      .eq("id", made!.id);
    expect(still ?? []).toHaveLength(1);
  });
});
