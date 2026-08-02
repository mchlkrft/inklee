import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";

vi.mock("server-only", () => ({}));

import { purgeDeletedAccountTransactionTaxSnapshots } from "@/lib/server/billing-record-retention";
import { financialYearRetentionCutoff } from "@/lib/server/retention-cutoffs";

/**
 * Counsel Q1 (docs/legal/counsel-handoff-2026-08-02.md §5.2), migration 0148.
 *
 * `transaction_tax_snapshots` was append-only against EVERYTHING: the trigger
 * refused every UPDATE and every DELETE, so the ledger was retained
 * permanently and (because nearly every real subscription generates a tax
 * event) dragged its subscription rows into permanence with it. Counsel:
 * immutability is a control, not a lawful basis for indefinite retention;
 * amend it so the ledger stays immutable against EDITS and becomes deletable
 * by exactly one path, the retention purge at 7 years from financial-year end.
 *
 * The thing that makes this a control rather than a hole is that the exemption
 * is over-determined, so this file pins BOTH halves:
 *
 *   what must still be REFUSED — every ad-hoc delete over the API, every
 *   update, and (the important one) a purge-lane delete of a row that is not
 *   actually past the horizon or not actually de-identified;
 *
 *   what must now SUCCEED — the purge itself, on exactly the rows the horizon
 *   covers, freeing the subscriptions those rows were pinning.
 *
 * A guard that refuses everything would pass every "must be refused" test in
 * here, which is why every one of them is paired with a positive control.
 */

// financialYearRetentionCutoff(now, 7) with a 2026 clock = 2019-01-01. The RPC
// CLAMPS any caller-supplied `_now` to `least(_now, now())`, so these fixtures
// are dated against the real clock rather than an injected one — see the clamp
// test at the bottom for why that clamp is the point.
const OLD_ENOUGH = "2018-12-31T23:59:59.000Z"; // FY2018 -> purgeable today
const NOT_OLD_ENOUGH = "2019-06-15T00:00:00.000Z"; // FY2019 -> inside the window

let admin: SupabaseClient;
let liveArtist: Actor;

const createdSnapshotIds: string[] = [];
const createdSubscriptionIds: string[] = [];

beforeAll(async () => {
  admin = adminClient();
  liveArtist = await makeActor(admin, "q1-tax-ledger");
}, 60_000);

afterAll(async () => {
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
  const id = data!.id as string;
  createdSnapshotIds.push(id);
  return id;
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

// ===========================================================================

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

describe("the purge path (the one exemption) deletes exactly what the horizon covers", () => {
  it("DELETES a de-identified row past the 7-year horizon — the capability Q1 added", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const result = await purgeDeletedAccountTransactionTaxSnapshots();
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.ids).toContain(id);
    expect(await snapshotExists(id)).toBe(false);
  });

  it("DISTINCTION: leaves a de-identified row that is still inside its window", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: NOT_OLD_ENOUGH,
    });
    const result = await purgeDeletedAccountTransactionTaxSnapshots();
    expect(result.ids).not.toContain(id);
    expect(await snapshotExists(id)).toBe(true);
  });

  it("DISTINCTION: leaves an OLD row that still belongs to a LIVE artist (scope is deleted accounts)", async () => {
    const id = await insertSnapshot({
      artist_id: liveArtist.id,
      created_at: OLD_ENOUGH,
    });
    const result = await purgeDeletedAccountTransactionTaxSnapshots();
    expect(result.ids).not.toContain(id);
    expect(await snapshotExists(id)).toBe(true);
  });

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
    const result = await purgeDeletedAccountTransactionTaxSnapshots();
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
    const result = await purgeDeletedAccountTransactionTaxSnapshots();
    // Deleting the parent while a child still referenced it would raise 23503;
    // both ids in one result is the proof they went in the same statement.
    expect(result.ids).toEqual(expect.arrayContaining([original, correction]));
    expect(await snapshotExists(original)).toBe(false);
    expect(await snapshotExists(correction)).toBe(false);
  });
});

describe("the caller cannot widen the horizon", () => {
  it("a far-future `now` is CLAMPED: it deletes no more than the real clock allows", async () => {
    const inWindow = await insertSnapshot({
      artist_id: null,
      created_at: NOT_OLD_ENOUGH,
    });
    const result = await purgeDeletedAccountTransactionTaxSnapshots(
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
    const narrowed = await purgeDeletedAccountTransactionTaxSnapshots(
      new Date("2024-05-01T00:00:00.000Z"),
    );
    expect(narrowed.ids).not.toContain(id);
    expect(await snapshotExists(id)).toBe(true);
    // ...and with the real clock it goes, so the row was purgeable all along
    // and the previous assertion was the parameter working, not a dead row.
    const real = await purgeDeletedAccountTransactionTaxSnapshots();
    expect(real.ids).toContain(id);
  });
});

describe("dry-run reports what a purge would do, and does nothing", () => {
  it("counts the row, leaves it, and the following real purge removes exactly it", async () => {
    const id = await insertSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const dry = await purgeDeletedAccountTransactionTaxSnapshots(
      new Date(),
      "dry-run",
    );
    expect(dry.ids).toContain(id);
    expect(await snapshotExists(id)).toBe(true);

    const real = await purgeDeletedAccountTransactionTaxSnapshots();
    expect(real.ids).toContain(id);
    expect(real.count).toBe(dry.count);
    expect(await snapshotExists(id)).toBe(false);
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

    await purgeDeletedAccountTransactionTaxSnapshots();
    expect(await snapshotExists(snapshotId)).toBe(false);

    const { error: freed } = await admin
      .from("billing_subscriptions")
      .delete()
      .eq("id", subId);
    expect(freed, freed?.message).toBeNull();
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
