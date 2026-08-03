import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, anonClient } from "./helpers/actor";

/**
 * Counsel round-4 ruling 7.5 (docs/legal/counsel-handoff-round-4-2026-08-02.md
 * §7.5), migration 0153.
 *
 * Counsel refused a hard deletion deadline for an archived account whose
 * Connect teardown cannot complete ("force-deleting a Connect account with a
 * non-zero balance orphans money and forecloses refunds ... the balance *is*
 * the legal claim"). What was refused instead is SILENT indefinite retention,
 * and the replacement is a per-account case, reviewed annually, recording the
 * reason, the amount and what resolution requires. Acceptance criterion, in
 * counsel's words: "the stated period then remains honest: seven years, or
 * documented cause."
 *
 * The half that can only be proven against a real database is that the
 * EVIDENCE cannot be rewritten. A review log an operator can edit or quietly
 * delete does not evidence that a review happened, and "documented cause"
 * collapses back into the thing counsel refused. So every guard below is
 * asserted through an ordinary service-role client, which is how anyone would
 * actually touch these rows, and every refusal is paired with the positive
 * control showing the legitimate operation still works.
 */

let admin: SupabaseClient;
const createdRecordIds: string[] = [];

beforeAll(() => {
  admin = adminClient();
});

afterAll(async () => {
  // Release 0148's purge guard, then delete the archive rows. Everything else
  // (cases, reviews) is reached by 0153's cascades, which is itself part of
  // what this file asserts.
  if (createdRecordIds.length > 0) {
    await admin
      .from("deleted_account_records")
      .update({ connect_teardown_state: "completed" })
      .in("id", createdRecordIds);
    await admin
      .from("deleted_account_records")
      .delete()
      .in("id", createdRecordIds);
  }
}, 60_000);

/** An archived account past the 7-year window whose teardown is blocked. */
async function makeBlockedArchiveRow(tag: string): Promise<string> {
  const { data, error } = await admin
    .from("deleted_account_records")
    .insert({
      artist_id: crypto.randomUUID(),
      record: { schemaVersion: 3, deposits: [], orders: [] },
      stripe_account_id: `acct_75_${tag}`,
      connect_teardown_state: "blocked",
      connect_teardown_last_error: "non-zero balance",
      deleted_at: "2017-06-01T00:00:00.000Z",
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const id = data!.id as string;
  createdRecordIds.push(id);
  return id;
}

async function makeCase(
  recordId: string,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("connect_teardown_escalations")
    .insert({
      record_id: recordId,
      reason: "Unresolved balance on the connected account (2500 EUR).",
      resolution_requires: "Every bucket must reach zero.",
      balance_detail: [{ bucket: "available", amount: 2500, currency: "eur" }],
      balance_minor: 2500,
      balance_currency: "eur",
      next_review_due_at: "2034-06-01T00:00:00.000Z",
      ...fields,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data!.id as string;
}

async function makeReview(
  escalationId: string,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("connect_teardown_escalation_reviews")
    .insert({
      escalation_id: escalationId,
      reviewed_by: "ops@inklee",
      decision: "continue_retention",
      reason: "Unresolved balance on the connected account (2500 EUR).",
      resolution_requires: "Every bucket must reach zero.",
      balance_detail: [{ bucket: "available", amount: 2500, currency: "eur" }],
      balance_minor: 2500,
      balance_currency: "eur",
      ...fields,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data!.id as string;
}

describe("the annual review log is evidence, so it cannot be rewritten", () => {
  it("REFUSES an UPDATE of a recorded review", async () => {
    const rec = await makeBlockedArchiveRow("upd");
    const esc = await makeCase(rec);
    const rev = await makeReview(esc);

    const { error } = await admin
      .from("connect_teardown_escalation_reviews")
      .update({ note: "actually we decided something else" })
      .eq("id", rev);

    expect(error?.message).toContain("append-only");

    // And the original is untouched.
    const { data } = await admin
      .from("connect_teardown_escalation_reviews")
      .select("note")
      .eq("id", rev)
      .single();
    expect(data!.note).toBeNull();
  });

  it("REFUSES a direct DELETE of a review while its case still exists", async () => {
    const rec = await makeBlockedArchiveRow("del");
    const esc = await makeCase(rec);
    const rev = await makeReview(esc);

    const { error } = await admin
      .from("connect_teardown_escalation_reviews")
      .delete()
      .eq("id", rev);

    expect(error?.message).toContain("cannot be deleted while its case exists");

    const { data } = await admin
      .from("connect_teardown_escalation_reviews")
      .select("id")
      .eq("id", rev)
      .maybeSingle();
    expect(data).not.toBeNull();
  });

  /**
   * DISTINCTION, and the reason the delete guard is written as "the parent is
   * still there" rather than a blanket refusal: the retention this dossier
   * documents does eventually END, and when the archive row is lawfully purged
   * the case and its reviews must go with it. A blanket refusal would make the
   * archive row itself undeletable and would leave an operator record about a
   * person whose financial record was just destroyed.
   */
  it("DISTINCTION: the cascade from the CASE removes its reviews", async () => {
    const rec = await makeBlockedArchiveRow("csc1");
    const esc = await makeCase(rec);
    const rev = await makeReview(esc);

    const { error } = await admin
      .from("connect_teardown_escalations")
      .delete()
      .eq("id", esc);
    expect(error, error?.message).toBeNull();

    const { data } = await admin
      .from("connect_teardown_escalation_reviews")
      .select("id")
      .eq("id", rev)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("DISTINCTION: purging the archive row (teardown completed) cascades case AND reviews", async () => {
    const rec = await makeBlockedArchiveRow("csc2");
    const esc = await makeCase(rec);
    const rev = await makeReview(esc);

    // 0148 still refuses the purge while the teardown is incomplete, which is
    // the ordering guarantee this feature sits on top of.
    const blocked = await admin
      .from("deleted_account_records")
      .delete()
      .eq("id", rec);
    expect(blocked.error?.message).toContain("cannot be purged");

    await admin
      .from("deleted_account_records")
      .update({ connect_teardown_state: "completed" })
      .eq("id", rec);
    const { error } = await admin
      .from("deleted_account_records")
      .delete()
      .eq("id", rec);
    expect(error, error?.message).toBeNull();

    const left = await admin
      .from("connect_teardown_escalations")
      .select("id")
      .eq("id", esc)
      .maybeSingle();
    expect(left.data).toBeNull();
    const leftReview = await admin
      .from("connect_teardown_escalation_reviews")
      .select("id")
      .eq("id", rev)
      .maybeSingle();
    expect(leftReview.data).toBeNull();
  });

  it("DISTINCTION: appending a SECOND review is exactly how a correction is made", async () => {
    const rec = await makeBlockedArchiveRow("append");
    const esc = await makeCase(rec);
    await makeReview(esc, { reviewed_at: "2034-06-02T00:00:00.000Z" });
    await makeReview(esc, {
      reviewed_at: "2035-06-02T00:00:00.000Z",
      note: "Balance still unresolved, retention continues.",
    });

    const { data } = await admin
      .from("connect_teardown_escalation_reviews")
      .select("id")
      .eq("escalation_id", esc);
    expect(data).toHaveLength(2);
  });
});

describe("the case row cannot record an incoherent decision", () => {
  it("one case per archived account", async () => {
    const rec = await makeBlockedArchiveRow("uniq");
    await makeCase(rec);
    const { error } = await admin.from("connect_teardown_escalations").insert({
      record_id: rec,
      reason: "duplicate",
      resolution_requires: "x",
      next_review_due_at: "2034-06-01T00:00:00.000Z",
    });
    expect(error?.code).toBe("23505");
  });

  it("REFUSES a resolved case with no resolution date", async () => {
    const rec = await makeBlockedArchiveRow("resnull");
    const { error } = await admin.from("connect_teardown_escalations").insert({
      record_id: rec,
      state: "resolved",
      resolved_at: null,
      reason: "r",
      resolution_requires: "x",
      next_review_due_at: "2034-06-01T00:00:00.000Z",
    });
    expect(error?.code).toBe("23514");
  });

  it("REFUSES an open case that claims a resolution date", async () => {
    const rec = await makeBlockedArchiveRow("openres");
    const { error } = await admin.from("connect_teardown_escalations").insert({
      record_id: rec,
      state: "open",
      resolved_at: "2034-01-01T00:00:00.000Z",
      reason: "r",
      resolution_requires: "x",
      next_review_due_at: "2034-06-01T00:00:00.000Z",
    });
    expect(error?.code).toBe("23514");
  });

  it("REFUSES an amount with no currency, which is not an amount", async () => {
    const rec = await makeBlockedArchiveRow("amtnocur");
    const { error } = await admin.from("connect_teardown_escalations").insert({
      record_id: rec,
      reason: "r",
      resolution_requires: "x",
      balance_minor: 2500,
      balance_currency: null,
      next_review_due_at: "2034-06-01T00:00:00.000Z",
    });
    expect(error?.code).toBe("23514");
  });

  it("DISTINCTION: a multi-currency case with NO scalar summary is valid", async () => {
    // This is the shape `summariseBalance` produces when the money is in two
    // currencies: the breakdown carries the truth and the scalar stays null.
    const rec = await makeBlockedArchiveRow("multicur");
    const id = await makeCase(rec, {
      balance_detail: [
        { bucket: "available", amount: 100, currency: "eur" },
        { bucket: "available", amount: 200, currency: "usd" },
      ],
      balance_minor: null,
      balance_currency: null,
    });
    expect(id).toBeTruthy();
  });

  it("only accepts the two defined case states", async () => {
    const rec = await makeBlockedArchiveRow("badstate");
    const { error } = await admin.from("connect_teardown_escalations").insert({
      record_id: rec,
      state: "pending",
      reason: "r",
      resolution_requires: "x",
      next_review_due_at: "2034-06-01T00:00:00.000Z",
    });
    expect(error?.code).toBe("23514");
  });

  it("only accepts the two defined review decisions", async () => {
    const rec = await makeBlockedArchiveRow("baddecision");
    const esc = await makeCase(rec);
    const { error } = await admin
      .from("connect_teardown_escalation_reviews")
      .insert({
        escalation_id: esc,
        reviewed_by: "ops@inklee",
        decision: "looks_fine",
        reason: "r",
        resolution_requires: "x",
      });
    expect(error?.code).toBe("23514");
  });

  it("a case cannot reference an archived account that does not exist", async () => {
    const { error } = await admin.from("connect_teardown_escalations").insert({
      record_id: crypto.randomUUID(),
      reason: "r",
      resolution_requires: "x",
      next_review_due_at: "2034-06-01T00:00:00.000Z",
    });
    expect(error?.code).toBe("23503");
  });
});

describe("updated_at is maintained by the database, not by the caller", () => {
  // The weekly refresh and the annual review are two different writers. A
  // column only the call sites remember to set is the silent-drift failure
  // 0149 PART A documents, so the trigger owns it.
  it("moves on any update, without the writer setting it", async () => {
    const rec = await makeBlockedArchiveRow("touch");
    const esc = await makeCase(rec);
    const before = await admin
      .from("connect_teardown_escalations")
      .select("updated_at")
      .eq("id", esc)
      .single();

    await new Promise((r) => setTimeout(r, 15));
    await admin
      .from("connect_teardown_escalations")
      .update({ observed_at: "2034-02-02T00:00:00.000Z" })
      .eq("id", esc);

    const after = await admin
      .from("connect_teardown_escalations")
      .select("updated_at")
      .eq("id", esc)
      .single();
    expect(
      new Date(after.data!.updated_at as string).getTime(),
    ).toBeGreaterThan(new Date(before.data!.updated_at as string).getTime());
  });
});

describe("the operations tables are not reachable by client roles", () => {
  // 0146/0149 precedent: RLS on with NO policy denies every non-service role,
  // and the REVOKE removes the default anon/authenticated table grants that
  // would otherwise still be sitting there. These rows carry Stripe-linked
  // operational detail about deleted accounts and have no artist scope at all,
  // so the correct client-role reach is zero.
  //
  // Asserted through a real anon-key client. A service-role client bypasses
  // both RLS and grants, so it would pass whether or not either exists, which
  // is precisely how the P5d write policies shipped missing.
  it("an anon-key client can neither read nor write the case table", async () => {
    const anon = anonClient();
    const read = await anon.from("connect_teardown_escalations").select("id");
    expect(read.error).not.toBeNull();
    expect(read.data).toBeNull();

    const write = await anon.from("connect_teardown_escalations").insert({
      record_id: crypto.randomUUID(),
      reason: "r",
      resolution_requires: "x",
      next_review_due_at: "2034-06-01T00:00:00.000Z",
    });
    expect(write.error).not.toBeNull();
  });

  it("an anon-key client can neither read nor write the review log", async () => {
    const anon = anonClient();
    const read = await anon
      .from("connect_teardown_escalation_reviews")
      .select("id");
    expect(read.error).not.toBeNull();
    expect(read.data).toBeNull();

    const write = await anon
      .from("connect_teardown_escalation_reviews")
      .insert({
        escalation_id: crypto.randomUUID(),
        reviewed_by: "attacker",
        decision: "resolved",
        reason: "r",
        resolution_requires: "x",
      });
    expect(write.error).not.toBeNull();
  });

  // DISTINCTION: the tables are not simply broken for everyone. The service
  // role, which is what the retention cron runs as, reads them fine, and every
  // other test in this file is a service-role write that succeeds.
  it("DISTINCTION: the service role CAN read them, so the denial above is role-scoped", async () => {
    const { error } = await admin
      .from("connect_teardown_escalations")
      .select("id")
      .limit(1);
    expect(error, error?.message).toBeNull();
  });
});
