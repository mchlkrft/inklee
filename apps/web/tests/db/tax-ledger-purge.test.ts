import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  makeActor,
  type Actor,
} from "./helpers/actor";
import { PgSession } from "./helpers/pg-session";

vi.mock("server-only", () => ({}));

import {
  purgeExpiredTransactionTaxSnapshots,
  runBillingRecordRetentionPurges,
} from "@/lib/server/billing-record-retention";
import { financialYearRetentionCutoff } from "@/lib/server/retention-cutoffs";

/**
 * The tax-ledger retention horizon: counsel Q1 (migration 0148) and counsel
 * round 4 §7.4 (migration 0150).
 *
 * Q1 made the append-only ledger deletable by exactly one path at 7 years
 * from financial-year end. §7.4 then answered the scope question 0148 raised
 * and did not resolve: "the retention basis for a tax snapshot is the
 * accounting obligation, which is time-bound... and indifferent to whether
 * the account still exists. A live artist's eight-year-old snapshot has
 * exhausted its Art. 6(1)(c) basis and storage limitation applies." So the
 * purge now covers EVERY snapshot past the horizon, not only de-identified
 * ones, with one carve-out: rows under an open dispute, audit or litigation
 * hold are excluded case by case under Art. 17(3)(e), "flagged rather than
 * silently skipped".
 *
 * ===========================================================================
 * WHY THIS FILE IS SHAPED THE WAY IT IS
 * ===========================================================================
 *
 * Counsel, same paragraph: "a compliance guard is tested only when its
 * REMOVAL fails the suite. Adopt mutation-style verification as the standard
 * for every guard this process has created."
 *
 * The guard is `tts_block_mutation()`'s DELETE exemption, which has THREE
 * conditions. Before this file was rewritten, only ONE of them was covered.
 * Measured, not assumed, against migration 0148 on 2026-08-03:
 *
 *   marker      remove it -> suite RED   (1 failure)  [covered]
 *   artist_id   remove it -> suite GREEN (12 passed)  [NOT covered]
 *   horizon     remove it -> suite GREEN (12 passed)  [NOT covered]
 *
 * The reason both gaps existed is the same, and it is worth naming because it
 * is easy to rebuild: every "must be refused" test went through
 * `purge_expired_tax_snapshots()`, whose OWN predicate already filtered those
 * rows out. The RPC refused to ASK, so the trigger was never given the chance
 * to answer, and deleting the trigger's condition changed nothing observable.
 * A test of a backstop has to route around the thing in front of it.
 *
 * So the trigger conditions are now tested through a privileged raw SQL
 * session that sets the marker by hand and issues the DELETE directly. That
 * is precisely the caller the third condition exists to stop: someone with
 * raw SQL who can forge the marker, but who still cannot forge `now()` and
 * cannot see past a legal hold.
 *
 * ===========================================================================
 * THE MUTATIONS, AND WHAT EACH ONE REDS
 * ===========================================================================
 *
 * Each was executed against the local stack, confirmed red, and the file
 * restored byte-exact (sha256 compared) afterwards.
 *
 *   1. Drop `coalesce(current_setting('inklee.tts_retention_purge',...)`
 *      from the trigger
 *        -> reds "refuses an ad-hoc DELETE over the API"
 *        -> reds "TRIGGER CONDITION 1"
 *   2. Drop `OLD.created_at < financial_year_retention_cutoff(now(), 7)`
 *      from the trigger
 *        -> reds "TRIGGER CONDITION 2"
 *   3. Drop `not retention_legal_hold_active(...)` from the trigger
 *        -> reds "TRIGGER CONDITION 3"
 *   4. Drop the hold exclusion from `purge_expired_tax_snapshots()`'s
 *      `held_chain` CTE
 *        -> reds the carve-out tests (the purge tries to delete a held row
 *           and the trigger stops it, so the step ERRORS instead of holding)
 *   5. Return `held_count`/`held_ids` as 0/[] from the RPC
 *        -> reds "the carve-out is reported, not silent"
 *   6. Restore `and s.artist_id is null` to the RPC predicate (i.e. undo
 *      §7.4)
 *        -> reds "a LIVE artist's snapshot past the horizon IS purged"
 *
 * Every one of those is paired with a DISTINCTION test, because a guard that
 * refuses everything passes every "must be refused" test ever written. The
 * distinction for the trigger conditions is `TRIGGER DISTINCTION`: the same
 * privileged path, on a row that satisfies all three conditions, succeeds.
 */

// financialYearRetentionCutoff(now, 7) with a 2026 clock = 2019-01-01. The RPC
// CLAMPS any caller-supplied `_now` to `least(_now, now())`, so these fixtures
// are dated against the real clock rather than an injected one — see the clamp
// test at the bottom for why that clamp is the point.
const OLD_ENOUGH = "2018-12-31T23:59:59.000Z"; // FY2018 -> purgeable today
const NOT_OLD_ENOUGH = "2019-06-15T00:00:00.000Z"; // FY2019 -> inside the window

let admin: SupabaseClient;
let liveArtist: Actor;
/** Raw SQL, superuser. The only way to reach the trigger's 2nd and 3rd
 *  conditions: PostgREST cannot send `set_config` alongside a DELETE, which
 *  is exactly what the 1st condition relies on. */
let root: PgSession;

const createdSubscriptionIds: string[] = [];
const createdHoldIds: string[] = [];

beforeAll(async () => {
  admin = adminClient();
  root = PgSession.open("tax-ledger-horizon");
  liveArtist = await makeActor(admin, "q74-tax-ledger");
}, 60_000);

afterAll(async () => {
  // Holds first: a leftover hold would make every LATER run of this file find
  // rows it cannot purge, and the failure would look like a broken purge.
  if (createdHoldIds.length > 0) {
    await root.query(
      "delete from retention_legal_holds where id = any($1::uuid[])",
      [createdHoldIds],
    );
  }
  // Snapshots that survived their test on purpose are cleaned up through the
  // ONE path that may delete them — which is itself a small end-to-end proof
  // that the path works. Rows that are not past the horizon cannot be removed
  // at all (that is the invariant), so they are left as harmless local
  // leftovers, exactly as this suite's predecessor documented.
  await admin.rpc("purge_expired_tax_snapshots", { _dry_run: false });
  if (createdSubscriptionIds.length > 0) {
    await admin
      .from("billing_subscriptions")
      .delete()
      .in("id", createdSubscriptionIds);
  }
  await admin.from("profiles").delete().eq("id", liveArtist.id);
  await admin.auth.admin.deleteUser(liveArtist.id);
  await root.close();
}, 60_000);

function uniq(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function insertSnapshot(
  fields: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin
    .from("transaction_tax_snapshots")
    .insert({
      kind: "charge",
      tax_policy_version: "v1",
      seller_country: "EE",
      seller_vat_registered: false,
      tax_treatment: "standard",
      currency: "eur",
      net_minor: 1000,
      vat_minor: 0,
      gross_minor: 1000,
      price_tax_behavior: "inclusive",
      content_hash: uniq("hash"),
      ...fields,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data!.id as string;
}

async function insertSubscription(
  fields: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin
    .from("billing_subscriptions")
    .insert({
      stripe_customer_id: uniq("cus"),
      stripe_subscription_id: uniq("sub"),
      stripe_price_id: uniq("price"),
      status: "canceled",
      contract_customer_type: "consumer",
      mode: "test",
      ...fields,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const id = data!.id as string;
  createdSubscriptionIds.push(id);
  return id;
}

async function snapshotExists(id: string): Promise<boolean> {
  const { data } = await admin
    .from("transaction_tax_snapshots")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return Boolean(data);
}

/** Open a hold. Raw SQL rather than PostgREST because the table is
 *  service-role-only by grant and the test is not exercising that path here
 *  (the RLS section below does). */
async function placeHold(
  snapshotId: string,
  reason: "dispute" | "audit" | "litigation" = "dispute",
): Promise<string> {
  const rows = await root.query<{ id: string }>(
    `insert into retention_legal_holds
       (record_table, record_id, reason, case_reference, opened_by)
     values ('transaction_tax_snapshots', $1, $2, $3, 'db-test')
     returning id`,
    [snapshotId, reason, uniq("case")],
  );
  createdHoldIds.push(rows[0].id);
  return rows[0].id;
}

async function releaseHold(holdId: string): Promise<void> {
  await root.query(
    `update retention_legal_holds
        set released_at = now(), released_by = 'db-test', release_note = 'test release'
      where id = $1`,
    [holdId],
  );
}

/**
 * The privileged delete lane: the marker is set BY HAND, then the DELETE is
 * issued directly. This is not a supported path in production; it exists here
 * because it is the only way to hand the trigger a row the RPC's own
 * predicate would have filtered out, and therefore the only way a missing
 * trigger condition can be observed at all.
 */
async function privilegedDelete(
  id: string,
  { withMarker }: { withMarker: boolean },
): Promise<{ ok: boolean; message: string }> {
  await root.begin();
  try {
    if (withMarker) {
      await root.query(
        "select set_config('inklee.tts_retention_purge', 'on', true)",
      );
    }
    await root.query("delete from transaction_tax_snapshots where id = $1", [
      id,
    ]);
    await root.commit();
    return { ok: true, message: "" };
  } catch (err) {
    await root.rollbackIfOpen();
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ===========================================================================
// THE THREE TRIGGER CONDITIONS, ONE TEST EACH.
//
// This whole block is what counsel's "the same fix must cover the
// trigger-test gap" asks for. Note what every one of them has in common: the
// row is constructed so that the OTHER two conditions are satisfied, so the
// only thing standing between the DELETE and success is the condition under
// test. A test whose row fails two conditions cannot tell you which one
// refused it, and would stay green if either were deleted.
// ===========================================================================

describe("tts_block_mutation: each DELETE condition, isolated", () => {
  it("TRIGGER CONDITION 1 — without the transaction-local marker, a raw SQL delete of an otherwise fully-eligible row is refused", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH, // past the horizon
    });
    // No hold, past the horizon, superuser connection: everything except the
    // marker is in place. The next test proves the same row goes once it is.
    const attempt = await privilegedDelete(id, { withMarker: false });
    expect(attempt.ok).toBe(false);
    expect(attempt.message).toContain("append-only");
    expect(await snapshotExists(id)).toBe(true);
  });

  it("TRIGGER CONDITION 2 — WITH the marker forged, a row inside its retention window is still refused (the horizon is re-derived, never supplied)", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: NOT_OLD_ENOUGH, // inside the window
    });
    const attempt = await privilegedDelete(id, { withMarker: true });
    expect(attempt.ok).toBe(false);
    expect(attempt.message).toContain("append-only");
    expect(await snapshotExists(id)).toBe(true);
  });

  it("TRIGGER CONDITION 3 — WITH the marker forged and the horizon passed, an active legal hold still refuses (Art. 17(3)(e))", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const holdId = await placeHold(id, "litigation");
    const attempt = await privilegedDelete(id, { withMarker: true });
    expect(attempt.ok).toBe(false);
    expect(attempt.message).toContain("append-only");
    expect(await snapshotExists(id)).toBe(true);

    // ...and the hold is the ONLY reason. Release it and the identical
    // statement succeeds, which is what makes the assertion above a test of
    // the hold rather than a test of "raw deletes never work".
    await releaseHold(holdId);
    const afterRelease = await privilegedDelete(id, { withMarker: true });
    expect(afterRelease.ok, afterRelease.message).toBe(true);
    expect(await snapshotExists(id)).toBe(false);
  });

  it("TRIGGER DISTINCTION — all three conditions satisfied, the same privileged path DELETES, so the guard is not simply refusing everything", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const attempt = await privilegedDelete(id, { withMarker: true });
    expect(attempt.ok, attempt.message).toBe(true);
    expect(await snapshotExists(id)).toBe(false);
  });

  it("TRIGGER DISTINCTION — a LIVE artist's row is now equally deletable through that path, which is the §7.4 widening at the trigger level", async () => {
    const id = await insertSnapshot({
      artist_id: liveArtist.id,
      created_at: OLD_ENOUGH,
    });
    const attempt = await privilegedDelete(id, { withMarker: true });
    expect(attempt.ok, attempt.message).toBe(true);
    expect(await snapshotExists(id)).toBe(false);
  });
});

describe("the append-only control still refuses everything it refused before", () => {
  it("refuses an ad-hoc DELETE over the API, even of a row that IS past the horizon", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const { error } = await admin
      .from("transaction_tax_snapshots")
      .delete()
      .eq("id", id);
    // This is the row the purge is allowed to delete. Reaching it any other
    // way is still refused: PostgREST cannot set the transaction-local marker,
    // so the exemption never opens for it.
    expect(error?.message).toContain("append-only");
    expect(await snapshotExists(id)).toBe(true);
  });

  it("refuses an UPDATE (corrections are still new rows)", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const { error } = await admin
      .from("transaction_tax_snapshots")
      .update({ gross_minor: 1 })
      .eq("id", id);
    expect(error?.message).toContain("append-only");
  });
});

// ===========================================================================
// §7.4: THE HORIZON NO LONGER ASKS WHETHER THE ACCOUNT STILL EXISTS
// ===========================================================================

describe("the purge path covers every account status past the horizon", () => {
  it("DELETES a de-identified row past the 7-year horizon — the capability Q1 added", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const result = await purgeExpiredTransactionTaxSnapshots();
    expect(result.ids).toContain(id);
    expect(await snapshotExists(id)).toBe(false);
  });

  it("DELETES a LIVE artist's row past the horizon — the §7.4 widening, and the assertion this file previously made in reverse", async () => {
    const id = await insertSnapshot({
      artist_id: liveArtist.id,
      created_at: OLD_ENOUGH,
    });
    const result = await purgeExpiredTransactionTaxSnapshots();
    expect(result.ids).toContain(id);
    expect(await snapshotExists(id)).toBe(false);
    // The artist is untouched. Counsel widened a retention deadline, not the
    // account lifecycle.
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("id", liveArtist.id)
      .maybeSingle();
    expect(data?.id).toBe(liveArtist.id);
  });

  it("DISTINCTION: leaves a LIVE artist's row that is still inside its window", async () => {
    const id = await insertSnapshot({
      artist_id: liveArtist.id,
      created_at: NOT_OLD_ENOUGH,
    });
    const result = await purgeExpiredTransactionTaxSnapshots();
    expect(result.ids).not.toContain(id);
    expect(await snapshotExists(id)).toBe(true);
  });

  it("DISTINCTION: leaves a de-identified row that is still inside its window", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: NOT_OLD_ENOUGH,
    });
    const result = await purgeExpiredTransactionTaxSnapshots();
    expect(result.ids).not.toContain(id);
    expect(await snapshotExists(id)).toBe(true);
  });
});

// ===========================================================================
// THE CARVE-OUT: EXCLUDED, AND VISIBLE
// ===========================================================================

describe("legal holds exclude a row from the purge and are reported, not skipped", () => {
  it("a held row past the horizon is NOT purged and IS returned in heldIds", async () => {
    const id = await insertSnapshot({
      artist_id: liveArtist.id,
      created_at: OLD_ENOUGH,
    });
    await placeHold(id, "dispute");

    const result = await purgeExpiredTransactionTaxSnapshots();
    expect(result.ids).not.toContain(id);
    expect(result.heldIds).toContain(id);
    expect(result.heldCount).toBe(result.heldIds.length);
    expect(await snapshotExists(id)).toBe(true);
  });

  it("DISTINCTION: releasing the hold lets the identical row purge on the very next run, and it stops being reported as held", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const holdId = await placeHold(id, "audit");

    const held = await purgeExpiredTransactionTaxSnapshots();
    expect(held.heldIds).toContain(id);
    expect(await snapshotExists(id)).toBe(true);

    await releaseHold(holdId);

    const freed = await purgeExpiredTransactionTaxSnapshots();
    expect(freed.heldIds).not.toContain(id);
    expect(freed.ids).toContain(id);
    expect(await snapshotExists(id)).toBe(false);
  });

  it("a hold placed on a row still INSIDE its window is not reported as held — nothing is being withheld yet", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: NOT_OLD_ENOUGH,
    });
    await placeHold(id, "dispute");
    const result = await purgeExpiredTransactionTaxSnapshots();
    // Retained, but by the horizon, not by the carve-out. Reporting it as
    // held would inflate the number counsel asked to be able to read.
    expect(result.ids).not.toContain(id);
    expect(result.heldIds).not.toContain(id);
  });

  it("two holds on one row: releasing only the first keeps the row held", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const disputeHold = await placeHold(id, "dispute");
    await placeHold(id, "audit");

    await releaseHold(disputeHold);

    const result = await purgeExpiredTransactionTaxSnapshots();
    expect(result.ids).not.toContain(id);
    expect(result.heldIds).toContain(id);
    expect(await snapshotExists(id)).toBe(true);
  });

  it("a hold on a CORRECTION also holds back the snapshot it corrects, and both are reported", async () => {
    const original = await insertSnapshot({
      artist_id: null,
      created_at: "2018-06-01T00:00:00.000Z",
    });
    const correction = await insertSnapshot({
      kind: "credit_note",
      corrects_snapshot_id: original,
      artist_id: null,
      created_at: "2018-07-01T00:00:00.000Z",
      net_minor: -1000,
      vat_minor: 0,
      gross_minor: -1000,
    });
    await placeHold(correction, "litigation");

    const result = await purgeExpiredTransactionTaxSnapshots();
    // The FK is NO ACTION, so the original cannot go while the correction
    // stays. Its retention is therefore just as attributable to the hold, and
    // reporting only the directly-held row would understate the carve-out.
    expect(result.ids).not.toContain(original);
    expect(result.ids).not.toContain(correction);
    expect(result.heldIds).toContain(correction);
    expect(result.heldIds).toContain(original);
    expect(await snapshotExists(original)).toBe(true);
    expect(await snapshotExists(correction)).toBe(true);
  });
});

describe("the run surfaces the carve-out as its own block", () => {
  it("reports transaction_tax_snapshots_held_by_legal_hold alongside the purge count", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    await placeHold(id, "dispute");

    const steps = await runBillingRecordRetentionPurges(new Date(), "dry-run");

    const purge = steps.purged_expired_transaction_tax_snapshots;
    expect(purge, JSON.stringify(steps)).toBeDefined();
    expect(purge.ok).toBe(true);

    const heldBlock = steps.transaction_tax_snapshots_held_by_legal_hold;
    expect(heldBlock, JSON.stringify(steps)).toBeDefined();
    expect(heldBlock.ok).toBe(true);
    // A held row that only ever showed up as "one fewer than expected" in the
    // purge count would be exactly the silent skip counsel ruled against.
    expect(heldBlock.ok && heldBlock.count).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// SELF-REFERENCE, INCLUDING THE CHAIN 0148 GOT ONE LEVEL DEEP
// ===========================================================================

describe("a snapshot is never purged while something that stays still references it", () => {
  it("a correction still inside its own window keeps the snapshot it corrects alive", async () => {
    const original = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const correction = await insertSnapshot({
      kind: "credit_note",
      corrects_snapshot_id: original,
      artist_id: null,
      created_at: NOT_OLD_ENOUGH,
      net_minor: -1000,
      vat_minor: 0,
      gross_minor: -1000,
    });
    const result = await purgeExpiredTransactionTaxSnapshots();
    expect(result.ids).not.toContain(original);
    expect(await snapshotExists(original)).toBe(true);
    expect(await snapshotExists(correction)).toBe(true);
  });

  it("DISTINCTION: once the correction is ALSO past the horizon both go, in one statement, with no FK violation", async () => {
    const original = await insertSnapshot({
      artist_id: null,
      created_at: "2018-06-01T00:00:00.000Z",
    });
    const correction = await insertSnapshot({
      kind: "credit_note",
      corrects_snapshot_id: original,
      artist_id: null,
      created_at: "2018-07-01T00:00:00.000Z",
      net_minor: -1000,
      vat_minor: 0,
      gross_minor: -1000,
    });
    const result = await purgeExpiredTransactionTaxSnapshots();
    // Deleting the parent while a child still referenced it would raise 23503;
    // both ids in one result is the proof they went in the same statement.
    expect(result.ids).toEqual(expect.arrayContaining([original, correction]));
    expect(await snapshotExists(original)).toBe(false);
    expect(await snapshotExists(correction)).toBe(false);
  });

  it("a THREE-LINK chain does not abort the run: a young correction protects its parent AND its grandparent", async () => {
    // Regression for the defect described in 0150's header. 0148's exclusion
    // asked only "is there a correction of `s` that is not purgeable?", and
    // answered it from that correction's own age — never from whether the
    // correction was in turn pinned by one of its own. So `grandparent` was
    // selected for deletion while `parent` (correctly retained) still
    // referenced it, and the DELETE failed with 23503, aborting the whole
    // step every cycle.
    const grandparent = await insertSnapshot({
      artist_id: null,
      created_at: "2018-03-01T00:00:00.000Z",
    });
    const parent = await insertSnapshot({
      kind: "credit_note",
      corrects_snapshot_id: grandparent,
      artist_id: null,
      created_at: "2018-04-01T00:00:00.000Z",
      net_minor: -1000,
      vat_minor: 0,
      gross_minor: -1000,
    });
    const child = await insertSnapshot({
      kind: "credit_note",
      corrects_snapshot_id: parent,
      artist_id: null,
      created_at: NOT_OLD_ENOUGH, // young: pins `parent`, which must pin `grandparent`
      net_minor: 1000,
      vat_minor: 0,
      gross_minor: 1000,
    });

    // Not throwing IS the assertion: on 0148 this call raised 23503.
    const result = await purgeExpiredTransactionTaxSnapshots();
    expect(result.ids).not.toContain(grandparent);
    expect(result.ids).not.toContain(parent);
    expect(await snapshotExists(grandparent)).toBe(true);
    expect(await snapshotExists(parent)).toBe(true);
    expect(await snapshotExists(child)).toBe(true);
  });
});

describe("the caller cannot widen the horizon", () => {
  it("a far-future `now` is CLAMPED: it deletes no more than the real clock allows", async () => {
    const inWindow = await insertSnapshot({
      artist_id: null,
      created_at: NOT_OLD_ENOUGH,
    });
    const result = await purgeExpiredTransactionTaxSnapshots(
      new Date("2200-01-01T00:00:00.000Z"),
    );
    expect(result.ids).not.toContain(inWindow);
    expect(await snapshotExists(inWindow)).toBe(true);
  });

  it("DISTINCTION: an EARLIER `now` narrows it, so the parameter is genuinely honoured in the retaining direction", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    // 2024 clock -> cutoff 2017-01-01, so an FY2018 row is NOT yet purgeable.
    const narrowed = await purgeExpiredTransactionTaxSnapshots(
      new Date("2024-05-01T00:00:00.000Z"),
    );
    expect(narrowed.ids).not.toContain(id);
    expect(await snapshotExists(id)).toBe(true);
    // ...and with the real clock it goes, so the row was purgeable all along
    // and the previous assertion was the parameter working, not a dead row.
    const real = await purgeExpiredTransactionTaxSnapshots();
    expect(real.ids).toContain(id);
  });
});

describe("dry-run reports what a purge would do, and does nothing", () => {
  it("counts the row, leaves it, and the following real purge removes exactly it", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const dry = await purgeExpiredTransactionTaxSnapshots(
      new Date(),
      "dry-run",
    );
    expect(dry.ids).toContain(id);
    expect(await snapshotExists(id)).toBe(true);

    const real = await purgeExpiredTransactionTaxSnapshots();
    expect(real.ids).toContain(id);
    expect(real.count).toBe(dry.count);
    expect(await snapshotExists(id)).toBe(false);
  });

  it("a dry-run reports held rows too, so the carve-out is visible before anything is deleted", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    await placeHold(id, "audit");
    const dry = await purgeExpiredTransactionTaxSnapshots(
      new Date(),
      "dry-run",
    );
    expect(dry.heldIds).toContain(id);
    expect(dry.ids).not.toContain(id);
    expect(await snapshotExists(id)).toBe(true);
  });
});

describe("the knock-on effect Q1 was actually about", () => {
  it("a subscription pinned by a tax snapshot is FREED once the snapshot itself ages out", async () => {
    const subId = await insertSubscription({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const snapshotId = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
      billing_subscription_id: subId,
    });

    // Before: the FK is NO ACTION, so the subscription genuinely cannot be
    // deleted while its snapshot exists. This is the state that used to be
    // permanent.
    const { error: blocked } = await admin
      .from("billing_subscriptions")
      .delete()
      .eq("id", subId);
    expect(blocked?.code).toBe("23503");

    await purgeExpiredTransactionTaxSnapshots();
    expect(await snapshotExists(snapshotId)).toBe(false);

    const { error: freed } = await admin
      .from("billing_subscriptions")
      .delete()
      .eq("id", subId);
    expect(freed, freed?.message).toBeNull();
  });
});

// ===========================================================================
// THE HOLD LEDGER IS NOT A PUBLIC TABLE
// ===========================================================================

describe("retention_legal_holds is reachable only by the service role", () => {
  it("an authenticated user can neither read it nor open a hold of their own", async () => {
    const target = await insertSnapshot({
      artist_id: liveArtist.id,
      created_at: OLD_ENOUGH,
    });

    const read = await liveArtist.client
      .from("retention_legal_holds")
      .select("id");
    expect(read.error?.code).toBe("42501");

    const write = await liveArtist.client.from("retention_legal_holds").insert({
      record_table: "transaction_tax_snapshots",
      record_id: target,
      reason: "dispute",
      case_reference: "self-serve",
      opened_by: "the artist",
    });
    expect(write.error?.code).toBe("42501");

    // DISTINCTION: the service role, which is what the retention run uses,
    // can do both. Without this the assertions above would also pass against
    // a table that simply does not work.
    const asService = await admin.from("retention_legal_holds").select("id");
    expect(asService.error, asService.error?.message).toBeNull();

    await admin.rpc("purge_expired_tax_snapshots", { _dry_run: false });
  });

  it("an anonymous visitor is refused as well", async () => {
    const { error } = await anonClient()
      .from("retention_legal_holds")
      .select("id");
    expect(error).not.toBeNull();
  });

  it("a hold cannot be recorded against a table that does not consult this ledger", async () => {
    // A hold nobody checks is a hold that silently does nothing, which is the
    // exact failure mode counsel ruled out. The CHECK constraint is what stops
    // someone believing they have protected a row in another table.
    const rejected = await root
      .query(
        `insert into retention_legal_holds
           (record_table, record_id, reason, case_reference, opened_by)
         values ('billing_subscriptions', gen_random_uuid(), 'dispute', 'x', 'db-test')`,
      )
      .then(
        () => null,
        (err: unknown) => (err instanceof Error ? err.message : String(err)),
      );
    expect(rejected).toContain("retention_legal_holds_record_table_check");
  });

  it("a release must name who released it", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const holdId = await placeHold(id, "dispute");
    const rejected = await root
      .query(
        "update retention_legal_holds set released_at = now() where id = $1",
        [holdId],
      )
      .then(
        () => null,
        (err: unknown) => (err instanceof Error ? err.message : String(err)),
      );
    expect(rejected).toContain("retention_legal_holds_release_complete_check");

    // DISTINCTION: naming the releaser works, so the constraint is not simply
    // refusing every release.
    await releaseHold(holdId);
    const rows = await root.query<{ released_by: string }>(
      "select released_by from retention_legal_holds where id = $1",
      [holdId],
    );
    expect(rows[0].released_by).toBe("db-test");
  });
});

describe("fixture/production cutoff agreement", () => {
  it("the SQL horizon and the TypeScript horizon are the same instant", async () => {
    const now = new Date();
    const { data, error } = await admin.rpc("financial_year_retention_cutoff", {
      _now: now.toISOString(),
      _retain_years: 7,
    });
    expect(error, error?.message).toBeNull();
    expect(new Date(data as string).toISOString()).toBe(
      financialYearRetentionCutoff(now, 7).toISOString(),
    );
    // And the fixtures straddle it, so a future edit to the constants cannot
    // silently drift from what the arithmetic requires.
    const cutoff = financialYearRetentionCutoff(now, 7);
    expect(new Date(OLD_ENOUGH).getTime()).toBeLessThan(cutoff.getTime());
    expect(new Date(NOT_OLD_ENOUGH).getTime()).toBeGreaterThanOrEqual(
      cutoff.getTime(),
    );
  });
});
