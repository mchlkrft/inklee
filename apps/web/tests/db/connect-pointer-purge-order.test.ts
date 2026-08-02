import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./helpers/actor";

vi.mock("server-only", () => ({}));

import {
  findConnectTeardownDue,
  connectPointerPurgeable,
} from "@/lib/server/connect-account-teardown";

/**
 * Counsel Q13(c) (docs/legal/counsel-handoff-2026-08-02.md §5.3), migration
 * 0148: "condition the pointer purge on the Stripe-side action having
 * completed; a purge that can outrun the deletion it enables is a design
 * fault."
 *
 * `deleted_account_records.stripe_account_id` is the ONLY thing that can ever
 * find a deleted artist's Connected Account again. The retention cron deletes
 * that row at 7 years. Before 0148, nothing stopped it doing so while the
 * account was still live at Stripe, which orphans the account permanently
 * with nothing left to identify it by.
 *
 * The guarantee is enforced by a DB trigger, not by the cron's filter, and
 * that distinction is what this file tests: the cron is one caller, the
 * trigger holds for all of them. So the refusal is proven through a plain
 * service-role delete — the most ordinary way anyone would ever remove one of
 * these rows — and every refusal is paired with the positive control that
 * shows the same delete succeeding once the condition is actually met.
 */

let admin: SupabaseClient;
const createdIds: string[] = [];

beforeAll(() => {
  admin = adminClient();
});

afterAll(async () => {
  // Release the guard on anything still standing, then remove it. Doing the
  // cleanup this way rather than with a raw superuser bypass keeps the
  // invariant honest: even the test cannot delete a guarded row.
  if (createdIds.length > 0) {
    await admin
      .from("deleted_account_records")
      .update({ connect_teardown_state: "completed" })
      .in("id", createdIds);
    await admin.from("deleted_account_records").delete().in("id", createdIds);
  }
}, 60_000);

async function insertArchiveRow(
  fields: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin
    .from("deleted_account_records")
    .insert({
      // Bare uuid by design: this table intentionally has NO FK to profiles so
      // it survives the cascade (migration 0047).
      artist_id: crypto.randomUUID(),
      record: { schemaVersion: 3, deposits: [], orders: [] },
      ...fields,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const id = data!.id as string;
  createdIds.push(id);
  return id;
}

async function rowExists(id: string): Promise<boolean> {
  const { data } = await admin
    .from("deleted_account_records")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return Boolean(data);
}

const OLD_ENOUGH = "2018-12-31T23:59:59.000Z"; // past the 7-year window today
const NOT_OLD_ENOUGH = "2025-06-15T00:00:00.000Z"; // well inside it

describe("the retained Connect pointer cannot be purged before the account is gone", () => {
  it("REFUSES the delete while the teardown is still pending", async () => {
    const id = await insertArchiveRow({
      stripe_account_id: "acct_q13_pending",
      connect_teardown_state: "pending",
      deleted_at: OLD_ENOUGH,
    });
    const { error } = await admin
      .from("deleted_account_records")
      .delete()
      .eq("id", id);
    expect(error?.message).toContain("cannot be purged");
    expect(await rowExists(id)).toBe(true);
  });

  it("REFUSES it while the teardown is blocked (e.g. a non-zero balance)", async () => {
    const id = await insertArchiveRow({
      stripe_account_id: "acct_q13_blocked",
      connect_teardown_state: "blocked",
      connect_teardown_last_error: "non-zero balance",
      deleted_at: OLD_ENOUGH,
    });
    const { error } = await admin
      .from("deleted_account_records")
      .delete()
      .eq("id", id);
    expect(error?.message).toContain("cannot be purged");
    expect(await rowExists(id)).toBe(true);
  });

  it("REFUSES it for a live pointer marked `not_applicable`, which is a contradiction, not a pass", async () => {
    const id = await insertArchiveRow({
      stripe_account_id: "acct_q13_contradiction",
      connect_teardown_state: "not_applicable",
      deleted_at: OLD_ENOUGH,
    });
    const { error } = await admin
      .from("deleted_account_records")
      .delete()
      .eq("id", id);
    expect(error?.message).toContain("cannot be purged");
    expect(await rowExists(id)).toBe(true);
  });

  it("DISTINCTION: ALLOWS the delete once the teardown completed — the guard is not just refusing everything", async () => {
    const id = await insertArchiveRow({
      stripe_account_id: "acct_q13_completed",
      connect_teardown_state: "completed",
      connect_teardown_completed_at: new Date().toISOString(),
      deleted_at: OLD_ENOUGH,
    });
    const { error } = await admin
      .from("deleted_account_records")
      .delete()
      .eq("id", id);
    expect(error, error?.message).toBeNull();
    expect(await rowExists(id)).toBe(false);
  });

  it("DISTINCTION: ALLOWS the delete when no pointer was ever retained", async () => {
    const id = await insertArchiveRow({
      stripe_account_id: null,
      connect_teardown_state: "not_applicable",
      deleted_at: OLD_ENOUGH,
    });
    const { error } = await admin
      .from("deleted_account_records")
      .delete()
      .eq("id", id);
    expect(error, error?.message).toBeNull();
    expect(await rowExists(id)).toBe(false);
  });

  it("the state column only accepts the four defined values", async () => {
    const { error } = await admin.from("deleted_account_records").insert({
      artist_id: crypto.randomUUID(),
      record: {},
      stripe_account_id: "acct_q13_bad_state",
      connect_teardown_state: "done",
    });
    expect(error?.code).toBe("23514");
  });
});

describe("window-end selection (counsel Q13(b): the same 7-year financial window)", () => {
  it("picks up a pending pointer past the window and ignores one inside it", async () => {
    const due = await insertArchiveRow({
      stripe_account_id: "acct_q13_due",
      connect_teardown_state: "pending",
      deleted_at: OLD_ENOUGH,
    });
    const notDue = await insertArchiveRow({
      stripe_account_id: "acct_q13_not_due",
      connect_teardown_state: "pending",
      deleted_at: NOT_OLD_ENOUGH,
    });

    const rows = await findConnectTeardownDue();
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(due);
    expect(ids).not.toContain(notDue);
  });

  it("re-attempts a BLOCKED row (a balance can clear on its own) and never re-attempts a completed one", async () => {
    const blocked = await insertArchiveRow({
      stripe_account_id: "acct_q13_retry",
      connect_teardown_state: "blocked",
      deleted_at: OLD_ENOUGH,
    });
    const done = await insertArchiveRow({
      stripe_account_id: "acct_q13_done",
      connect_teardown_state: "completed",
      deleted_at: OLD_ENOUGH,
    });

    const ids = (await findConnectTeardownDue()).map((r) => r.id);
    expect(ids).toContain(blocked);
    expect(ids).not.toContain(done);
  });

  it("ignores a row with no pointer, however old (nothing to tear down)", async () => {
    const id = await insertArchiveRow({
      stripe_account_id: null,
      connect_teardown_state: "pending",
      deleted_at: OLD_ENOUGH,
    });
    const ids = (await findConnectTeardownDue()).map((r) => r.id);
    expect(ids).not.toContain(id);
  });
});

describe("connectPointerPurgeable mirrors the trigger exactly", () => {
  // The cron's DELETE filter and the trigger must agree, or the step either
  // errors on every cycle (filter too loose) or never purges (too tight).
  // These are the same four cases asserted against the DB above.
  it.each([
    [{ stripe_account_id: "acct_x", connect_teardown_state: "pending" }, false],
    [{ stripe_account_id: "acct_x", connect_teardown_state: "blocked" }, false],
    [
      { stripe_account_id: "acct_x", connect_teardown_state: "not_applicable" },
      false,
    ],
    [
      { stripe_account_id: "acct_x", connect_teardown_state: "completed" },
      true,
    ],
    [{ stripe_account_id: null, connect_teardown_state: "pending" }, true],
  ])("%o -> %s", (row, expected) => {
    expect(
      connectPointerPurgeable(
        row as {
          stripe_account_id: string | null;
          connect_teardown_state: string;
        },
      ),
    ).toBe(expected);
  });
});
