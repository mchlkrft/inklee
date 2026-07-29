import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dbEnv } from "./helpers/db-env";

/**
 * Authenticated database tests for discount_codes (P5d, Gate A finding A2).
 *
 * `discount_codes` carried the same defect as `product_collections`: RLS on,
 * SELECT policy only, both write callers on the user-scoped client. It reached
 * production on the revenue path and was found only because a review checked a
 * comment claiming this table was a healthy precedent.
 *
 * The last describe block is the unusual one. It asserts that DELETE is NOT
 * granted. That is a real product rule (deactivate, never delete, so redemption
 * history survives), and an absent policy is indistinguishable from a forgotten
 * one unless something states which it is.
 */

const { url: URL, anonKey: ANON, serviceKey: SERVICE } = dbEnv();

const PASSWORD = "Passw0rd!123";

type Actor = { id: string; client: SupabaseClient };

let admin: SupabaseClient;
let owner: Actor;
let other: Actor;

let codeSeq = 0;
const nextCode = (label: string) => `${label}-${(codeSeq += 1)}`;

async function makeActor(label: string): Promise<Actor> {
  const email = `p5dd-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  const { error: pErr } = await admin.from("profiles").upsert({
    id,
    slug: `p5dd-${label}-${id.slice(0, 8)}`,
    display_name: `P5DD ${label}`,
  });
  if (pErr) throw pErr;

  const client = createClient(URL, ANON);
  const { error: sErr } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (sErr) throw sErr;
  return { id, client };
}

async function destroyActor(a: Actor | undefined) {
  if (!a) return;
  await admin.from("discount_codes").delete().eq("artist_id", a.id);
  await admin.from("profiles").delete().eq("id", a.id);
  await admin.auth.admin.deleteUser(a.id);
}

/** A valid row for `artistId`. Every check constraint on the table is
 *  satisfied here so a failure can only be about permissions. */
const codeRow = (artistId: string, code: string) => ({
  artist_id: artistId,
  code,
  kind: "percent",
  value: 1000, // 10.00%, inside discount_percent_range
  currency: "eur",
  min_subtotal_minor: 0,
  active: true,
});

beforeAll(async () => {
  admin = createClient(URL, SERVICE);
  owner = await makeActor("owner");
  other = await makeActor("other");
}, 60_000);

afterAll(async () => {
  await destroyActor(owner);
  await destroyActor(other);
}, 60_000);

describe("discount_codes RLS, authenticated client", () => {
  it("lets an owner CREATE a discount code", async () => {
    // The assertion that would have caught the production defect. Before 0123
    // this returned 42501, which saveDiscountCore reports to the artist as
    // "Couldn't save. Try again." on every attempt, forever.
    const { data, error } = await owner.client
      .from("discount_codes")
      .insert(codeRow(owner.id, nextCode("WELCOME")))
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("lets an owner EDIT a discount code", async () => {
    const { data: made } = await owner.client
      .from("discount_codes")
      .insert(codeRow(owner.id, nextCode("EDIT")))
      .select("id")
      .single();
    const { data, error } = await owner.client
      .from("discount_codes")
      .update({ value: 2000 })
      .eq("id", made!.id)
      .select("value")
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.value).toBe(2000);
  });

  it("lets an owner DEACTIVATE a code, which is the supported retirement", async () => {
    const { data: made } = await owner.client
      .from("discount_codes")
      .insert(codeRow(owner.id, nextCode("RETIRE")))
      .select("id")
      .single();
    const { data, error } = await owner.client
      .from("discount_codes")
      .update({ active: false })
      .eq("id", made!.id)
      .select("active")
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.active).toBe(false);
  });
});

describe("discount_codes cross-account isolation", () => {
  it("refuses a code that names someone else as the owner", async () => {
    // Positive control first: proves this client can insert at all, so the
    // rejection below is about the ownership it named and not about writes
    // being blocked wholesale. Without it this test passes even with every
    // write policy missing.
    const control = await other.client
      .from("discount_codes")
      .insert(codeRow(other.id, nextCode("CONTROL")))
      .select("id")
      .single();
    expect(control.error, control.error?.message).toBeNull();

    const { error } = await other.client
      .from("discount_codes")
      .insert(codeRow(owner.id, nextCode("STOLEN")))
      .select("id")
      .single();
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot read another artist's codes", async () => {
    const { data: made } = await owner.client
      .from("discount_codes")
      .insert(codeRow(owner.id, nextCode("PRIVATE")))
      .select("id")
      .single();
    const { data } = await other.client
      .from("discount_codes")
      .select("id")
      .eq("id", made!.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot edit another artist's code", async () => {
    const { data: made } = await owner.client
      .from("discount_codes")
      .insert(codeRow(owner.id, nextCode("UNTOUCHABLE")))
      .select("id")
      .single();
    const { data } = await other.client
      .from("discount_codes")
      .update({ value: 9900 })
      .eq("id", made!.id)
      .select("id");
    // RLS filters the row out rather than erroring: zero rows affected.
    expect(data ?? []).toHaveLength(0);

    const { data: after } = await owner.client
      .from("discount_codes")
      .select("value")
      .eq("id", made!.id)
      .single();
    expect(after?.value).toBe(1000);
  });

  it("cannot hand its own code to another artist", async () => {
    const { data: made } = await owner.client
      .from("discount_codes")
      .insert(codeRow(owner.id, nextCode("OWNED")))
      .select("id")
      .single();
    // USING lets the owner target the row; WITH CHECK rejects the new shape.
    const { error } = await owner.client
      .from("discount_codes")
      .update({ artist_id: other.id })
      .eq("id", made!.id)
      .select("id");
    expect(error?.code).toBe("42501");
  });
});

describe("discount_codes DELETE is withheld by design", () => {
  it("refuses to delete even the owner's own code", async () => {
    const { data: made } = await owner.client
      .from("discount_codes")
      .insert(codeRow(owner.id, nextCode("PERMANENT")))
      .select("id")
      .single();

    // No DELETE policy exists, so this is filtered to zero rows rather than
    // erroring. The row surviving is the assertion that matters: redemption
    // history stays attached to a code an artist once published.
    const { error } = await owner.client
      .from("discount_codes")
      .delete()
      .eq("id", made!.id);
    expect(error).toBeNull();

    const { data: still } = await owner.client
      .from("discount_codes")
      .select("id")
      .eq("id", made!.id);
    expect(still, "a published code must not be deletable").toHaveLength(1);
  });
});
