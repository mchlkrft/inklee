import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";
import { deleteOwnAccountCore } from "@/lib/server/account-deletion";

/**
 * Counsel Q13 CLAUSE 1 — "retain the account pointer only".
 *
 * The ratified decision has three clauses; clauses 1 and 3 were reported as
 * implemented and clause 2 (request the account's deletion at window-end) as
 * a gap. Building clause 2 exposed that clause 1 was only PARTLY true, and
 * the failure is invisible from the clause-1 code itself: `account-deletion.ts`
 * does write `profile.stripe_account_id` into
 * `deleted_account_records.stripe_account_id`, exactly as reported — but only
 * INSIDE a conditional that fired on financial records (a paid deposit, an
 * order, a subscription, an appointment payment). An artist with a Connected
 * Account and none of those produced NO ARCHIVE ROW AT ALL, so the pointer
 * was discarded at deletion and clause 2 became unperformable for precisely
 * those accounts, permanently and silently. The account stays live at Stripe
 * with nothing left to identify it by.
 *
 * That is why this is a REAL `deleteOwnAccountCore` call and not an assertion
 * about the conditional: the defect was in which rows reach the insert, not
 * in the insert. No Stripe key is reachable from this file (STRIPE_SECRET_KEY
 * is absent from .env.e2e, so `@/lib/stripe` exports null), and the fixture
 * deliberately has no deposit, no order, no subscription and no appointment
 * payment — that emptiness IS the test.
 */

let admin: SupabaseClient;
let pointerOnly: Actor;
let noPointer: Actor;

const CONNECT_ID = `acct_q13_clause1_${crypto.randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  admin = adminClient();
  pointerOnly = await makeActor(admin, "q13-pointer");
  noPointer = await makeActor(admin, "q13-nopointer");

  // The ONLY thing this artist has is a Connect account. No money anywhere.
  const { error } = await admin
    .from("profiles")
    .update({ stripe_account_id: CONNECT_ID })
    .eq("id", pointerOnly.id);
  expect(error, error?.message).toBeNull();
}, 60_000);

afterAll(async () => {
  // Release the 0148 purge-ordering guard before cleaning up: an archive row
  // with a live pointer and an incomplete teardown cannot be deleted, which
  // is the invariant `connect-pointer-purge-order.test.ts` proves. Doing it
  // this way rather than with a raw bypass keeps that invariant honest here
  // too.
  for (const id of [pointerOnly?.id, noPointer?.id]) {
    if (!id) continue;
    await admin
      .from("deleted_account_records")
      .update({ connect_teardown_state: "completed" })
      .eq("artist_id", id);
    await admin.from("deleted_account_records").delete().eq("artist_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
}, 60_000);

describe("Q13 clause 1: the Connect pointer survives deletion on its own merit", () => {
  it("retains the pointer for an artist whose ONLY asset is a Connected Account", async () => {
    const result = await deleteOwnAccountCore(pointerOnly.id, {
      surface: "web",
    });
    expect(result, JSON.stringify(result)).toEqual({ ok: true });

    const { data, error } = await admin
      .from("deleted_account_records")
      .select("stripe_account_id, connect_teardown_state")
      .eq("artist_id", pointerOnly.id)
      .maybeSingle();
    expect(error, error?.message).toBeNull();
    // The row exists BECAUSE of the pointer, with no financial record to
    // carry it. This is the assertion that was false before 0148's companion
    // change.
    expect(data).not.toBeNull();
    expect(data!.stripe_account_id).toBe(CONNECT_ID);
    // ...and it is marked as OWING the window-end action, which is what makes
    // it undeletable until that action completes.
    expect(data!.connect_teardown_state).toBe("pending");
  });

  it("DISTINCTION: an artist with neither a pointer nor financial records still writes NO row", async () => {
    // The fix must not turn every deletion into a retained record. Retention
    // needs a reason, and this artist has none: nothing owed at Stripe and
    // nothing owed to the Accounting Act.
    const result = await deleteOwnAccountCore(noPointer.id, {
      surface: "web",
    });
    expect(result, JSON.stringify(result)).toEqual({ ok: true });

    const { data, error } = await admin
      .from("deleted_account_records")
      .select("id")
      .eq("artist_id", noPointer.id);
    expect(error, error?.message).toBeNull();
    expect(data).toEqual([]);
  });
});
