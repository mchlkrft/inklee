import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";

/**
 * 0142 PROFILES COLUMN-GRANT (AGENTS.md footgun 0074/0089). `saveSellerDetailsAction`
 * (apps/web/src/app/(artist)/goods/actions.ts) writes `seller_trading_name` /
 * `seller_address` / `seller_contact` through the artist's OWN session, a
 * user-scoped client, never the service role. 0074 revoked table-level UPDATE
 * on `profiles` and re-grants only an enumerated column list, so a column
 * left off that list is invisible to every authenticated writer no matter
 * what the RLS row policy says. Nothing before this file proved the grant at
 * the DB layer: a passing unit test with a mocked client would stay green
 * even if 0142's `grant update (...)` line were deleted.
 *
 * MUTATION THAT REDS THIS: drop the grant this file exists to prove.
 *   revoke update (seller_trading_name, seller_address, seller_contact)
 *     on public.profiles from authenticated;
 * Executed by hand 2026-08-02 as the migration's own convergence probe: with
 * `seller_trading_name` revoked, the exact same UPDATE statement the "own
 * row" test below issues fails with `42501 permission denied for column
 * seller_trading_name` (re-granted afterward; `\d+ profiles` / migration
 * 0142's own re-run confirmed restoration — see AGENTS.md's convergent-shapes
 * entry, this is the additive-GRANT case it names).
 *
 * The second test is a DIFFERENT boundary: the existing "artists can update
 * own profile" RLS policy (0009-era), not the column grant. Both have to
 * hold for the feature to be safe: the grant makes the COLUMN writable at
 * all, the policy confines WHICH ROW. An UPDATE whose USING clause excludes
 * every row (RLS) returns `{ data: [], error: null }` through PostgREST —
 * silent, not an error — so this asserts on affected-row count, not on
 * `error` being null, the same caution collection-items-rls.test.ts documents
 * for the identical shape.
 */

let admin: SupabaseClient;
let owner: Actor;
let other: Actor;

beforeAll(async () => {
  admin = adminClient();
  owner = await makeActor(admin, "seller-grant-owner");
  other = await makeActor(admin, "seller-grant-other");
}, 60_000);

afterAll(async () => {
  await admin.from("profiles").delete().eq("id", owner?.id);
  await admin.from("profiles").delete().eq("id", other?.id);
  if (owner) await admin.auth.admin.deleteUser(owner.id);
  if (other) await admin.auth.admin.deleteUser(other.id);
}, 60_000);

describe("profiles seller_* column grant (0142)", () => {
  it("writes its OWN seller_trading_name through the user-scoped client", async () => {
    const { data, error } = await owner.client
      .from("profiles")
      .update({
        seller_trading_name: "Owner Ink Studio",
        seller_address: "1 Owner Street, Tallinn",
        seller_contact: "owner@example.com",
      })
      .eq("id", owner.id)
      .select("seller_trading_name, seller_address, seller_contact");

    expect(error, error?.message).toBeNull();
    expect(
      data,
      "the update must actually affect the row, not silently match zero",
    ).toHaveLength(1);
    expect(data![0]).toEqual({
      seller_trading_name: "Owner Ink Studio",
      seller_address: "1 Owner Street, Tallinn",
      seller_contact: "owner@example.com",
    });

    // Durable, not just RETURNING: read back in a separate statement.
    const { data: after } = await admin
      .from("profiles")
      .select("seller_trading_name")
      .eq("id", owner.id)
      .single();
    expect(after?.seller_trading_name).toBe("Owner Ink Studio");
  });

  it("cannot write ANOTHER artist's seller_trading_name", async () => {
    const before = await admin
      .from("profiles")
      .select("seller_trading_name")
      .eq("id", other.id)
      .single();
    expect(before.data?.seller_trading_name ?? null).toBeNull();

    // Same client that just succeeded against its own row, targeting someone
    // else's. The RLS USING clause on "artists can update own profile" hides
    // `other`'s row from `owner`'s UPDATE entirely, so PostgREST reports
    // success with zero affected rows rather than an error — asserting on
    // `data` length, not on `error`, is the whole point of this test.
    const { data, error } = await owner.client
      .from("profiles")
      .update({ seller_trading_name: "Hijacked" })
      .eq("id", other.id)
      .select("seller_trading_name");

    expect(error, error?.message).toBeNull();
    expect(
      data ?? [],
      "the cross-owner update must match zero rows, not silently fall through to nothing asserted",
    ).toHaveLength(0);

    const after = await admin
      .from("profiles")
      .select("seller_trading_name")
      .eq("id", other.id)
      .single();
    expect(
      after.data?.seller_trading_name ?? null,
      "the other artist's column must be untouched",
    ).toBeNull();
  });
});
