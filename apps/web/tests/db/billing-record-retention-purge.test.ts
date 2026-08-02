import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";

// Same "server-only" workaround as shop-retention-purge.test.ts.
vi.mock("server-only", () => ({}));

import {
  purgeDeletedAccountWithdrawalCases,
  purgeDeletedAccountBillingContractConfirmations,
  purgeDeletedAccountBillingConsentRecords,
  purgeDeletedAccountBillingSubscriptions,
  runBillingRecordRetentionPurges,
} from "@/lib/server/billing-record-retention";
import { financialYearRetentionCutoff } from "@/lib/server/retention-cutoffs";

/**
 * BDEL-RET-002 (docs/audit/findings.yaml): migration 0129's SET NULL fix
 * removed the crash-on-delete defect but left these five billing tables
 * with no retention END date, so a deleted account's rows survive
 * indefinitely — the exact inverse of the defect 0129 fixed. These tests
 * prove the 7-year-from-financial-year-end deadline actually fires, scoped
 * ONLY to already-de-identified rows (artist_id IS NULL), and that the
 * dependency ordering never trips an FK violation (23503) on a table with
 * NO cascade of its own on these relationships.
 *
 * `transaction_tax_snapshots` was proven here to be NEVER purged, and to
 * permanently block its referenced subscription as a direct consequence. That
 * changed on 2026-08-03: counsel Q1 amended the immutability control
 * (migration 0148) so the ledger stays immutable against EDITS and becomes
 * deletable by exactly one path at the 7-year horizon. What this file still
 * proves is the half that did NOT change — a snapshot blocks its subscription
 * for as long as the snapshot itself survives, and an ad-hoc DELETE over the
 * API is still refused. The amended behaviour, the purge lane and the
 * subscription being FREED once the snapshot ages out, is proven in
 * `tests/db/tax-ledger-purge.test.ts`.
 */

const NOW = new Date("2026-08-02T12:00:00.000Z");
// financialYearRetentionCutoff(NOW, 7) = 2019-01-01. A row dated financial
// year 2018 or earlier is purgeable; financial year 2019 or later survives.
const OLD_ENOUGH = "2018-12-31T23:59:59.000Z"; // FY2018 -> purgeable
const NOT_OLD_ENOUGH = "2019-06-15T00:00:00.000Z"; // FY2019 -> survives

let admin: SupabaseClient;
let liveArtist: Actor;

// Exact-id tracking rather than a blanket "artist_id IS NULL" cleanup
// filter: this local Supabase instance is shared with other agents running
// their own db tests concurrently in this session (observed directly while
// building shop-retention-purge.test.ts), and a broad filter would delete
// another test's still-in-progress fixtures on these same tables.
const createdIds = {
  withdrawalCases: [] as string[],
  confirmations: [] as string[],
  consents: [] as string[],
  subscriptions: [] as string[],
};

beforeAll(async () => {
  admin = adminClient();
  liveArtist = await makeActor(admin, "bdel-ret-002");
}, 60_000);

afterAll(async () => {
  // Order matters here too (same FK shape the purge functions respect).
  if (createdIds.withdrawalCases.length > 0) {
    await admin
      .from("withdrawal_cases")
      .delete()
      .in("id", createdIds.withdrawalCases);
  }
  if (createdIds.confirmations.length > 0) {
    await admin
      .from("billing_contract_confirmations")
      .delete()
      .in("id", createdIds.confirmations);
  }
  if (createdIds.consents.length > 0) {
    await admin
      .from("billing_consent_records")
      .delete()
      .in("id", createdIds.consents);
  }
  if (createdIds.subscriptions.length > 0) {
    await admin
      .from("billing_subscriptions")
      .delete()
      .in("id", createdIds.subscriptions);
  }
  // transaction_tax_snapshots rows created by this file are cleaned up
  // through the ONE path that may delete them (counsel Q1, 0148), which only
  // reaches rows past the 7-year horizon. Rows inside their window still have
  // no cleanup path short of a raw superuser session bypassing the trigger,
  // which would misrepresent the very invariant under test; those stay as
  // harmless, randomly-named leftovers on a local dev database.
  await admin.rpc("purge_expired_tax_snapshots", { _dry_run: false });
  await admin.from("profiles").delete().eq("id", liveArtist.id);
  await admin.auth.admin.deleteUser(liveArtist.id);
}, 60_000);

function uniq(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function insertWithdrawalCase(fields: Record<string, unknown>) {
  const { data, error } = await admin
    .from("withdrawal_cases")
    .insert(fields)
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const id = data!.id as string;
  createdIds.withdrawalCases.push(id);
  return id;
}

async function insertConfirmation(fields: Record<string, unknown>) {
  const { data, error } = await admin
    .from("billing_contract_confirmations")
    .insert(fields)
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const id = data!.id as string;
  createdIds.confirmations.push(id);
  return id;
}

async function insertConsent(fields: Record<string, unknown>) {
  const { data, error } = await admin
    .from("billing_consent_records")
    .insert({
      consent_type: "terms_acceptance",
      consent_version: "v1",
      ...fields,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const id = data!.id as string;
  createdIds.consents.push(id);
  return id;
}

async function insertSubscription(fields: Record<string, unknown>) {
  const { data, error } = await admin
    .from("billing_subscriptions")
    .insert({
      stripe_customer_id: uniq("cus"),
      stripe_subscription_id: uniq("sub"),
      stripe_price_id: uniq("price"),
      status: "active",
      contract_customer_type: "business",
      mode: "test",
      ...fields,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const id = data!.id as string;
  createdIds.subscriptions.push(id);
  return id;
}

async function insertTaxSnapshot(fields: Record<string, unknown>) {
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
      vat_minor: 200,
      gross_minor: 1200,
      price_tax_behavior: "inclusive",
      content_hash: uniq("hash"),
      ...fields,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data!.id as string;
}

async function exists(table: string, id: string): Promise<boolean> {
  const { data } = await admin
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return Boolean(data);
}

// ===========================================================================

describe("withdrawal_cases (leaf): 7y from created_at, deleted-account-only", () => {
  it("survives at FY2019 (inside the 7y window)", async () => {
    const id = await insertWithdrawalCase({
      artist_id: null,
      created_at: NOT_OLD_ENOUGH,
    });
    await purgeDeletedAccountWithdrawalCases(NOW);
    expect(await exists("withdrawal_cases", id)).toBe(true);
  });

  it("is deleted at FY2018 (past the 7y window)", async () => {
    const id = await insertWithdrawalCase({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const result = await purgeDeletedAccountWithdrawalCases(NOW);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(await exists("withdrawal_cases", id)).toBe(false);
  });

  it("leaves a still-live artist's withdrawal case untouched even if old (out of scope)", async () => {
    const id = await insertWithdrawalCase({
      artist_id: liveArtist.id,
      created_at: OLD_ENOUGH,
    });
    await purgeDeletedAccountWithdrawalCases(NOW);
    expect(await exists("withdrawal_cases", id)).toBe(true);
  });
});

describe("billing_contract_confirmations (leaf): 7y from generated_at, deleted-account-only", () => {
  it("survives at FY2019", async () => {
    const id = await insertConfirmation({
      artist_id: null,
      generated_at: NOT_OLD_ENOUGH,
    });
    await purgeDeletedAccountBillingContractConfirmations(NOW);
    expect(await exists("billing_contract_confirmations", id)).toBe(true);
  });

  it("is deleted at FY2018", async () => {
    const id = await insertConfirmation({
      artist_id: null,
      generated_at: OLD_ENOUGH,
    });
    const result = await purgeDeletedAccountBillingContractConfirmations(NOW);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(await exists("billing_contract_confirmations", id)).toBe(false);
  });
});

describe("billing_consent_records: 7y from consented_at, protected by a still-young withdrawal_case", () => {
  it("survives at FY2019", async () => {
    const id = await insertConsent({
      artist_id: null,
      consented_at: NOT_OLD_ENOUGH,
    });
    await purgeDeletedAccountBillingConsentRecords(NOW);
    expect(await exists("billing_consent_records", id)).toBe(true);
  });

  it("is deleted at FY2018 when unreferenced", async () => {
    const id = await insertConsent({
      artist_id: null,
      consented_at: OLD_ENOUGH,
    });
    const result = await purgeDeletedAccountBillingConsentRecords(NOW);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(await exists("billing_consent_records", id)).toBe(false);
  });

  it("survives at FY2018 when a still-young withdrawal_case references it (protects its parent)", async () => {
    const consentId = await insertConsent({
      artist_id: null,
      consented_at: OLD_ENOUGH,
    });
    const caseId = await insertWithdrawalCase({
      artist_id: null,
      created_at: NOT_OLD_ENOUGH, // too young to be purged itself
      immediate_performance_consent_id: consentId,
    });
    await purgeDeletedAccountBillingConsentRecords(NOW);
    expect(await exists("billing_consent_records", consentId)).toBe(true);
    await admin.from("withdrawal_cases").delete().eq("id", caseId);
  });
});

describe("billing_subscriptions: 7y from created_at, protected by any still-existing dependent", () => {
  it("survives at FY2019", async () => {
    const id = await insertSubscription({
      artist_id: null,
      created_at: NOT_OLD_ENOUGH,
    });
    await purgeDeletedAccountBillingSubscriptions(NOW);
    expect(await exists("billing_subscriptions", id)).toBe(true);
  });

  it("is deleted at FY2018 when unreferenced", async () => {
    const id = await insertSubscription({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const result = await purgeDeletedAccountBillingSubscriptions(NOW);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(await exists("billing_subscriptions", id)).toBe(false);
  });

  it("survives at FY2018 when a still-young withdrawal_case references it", async () => {
    const subId = await insertSubscription({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const caseId = await insertWithdrawalCase({
      artist_id: null,
      created_at: NOT_OLD_ENOUGH,
      billing_subscription_id: subId,
    });
    await purgeDeletedAccountBillingSubscriptions(NOW);
    expect(await exists("billing_subscriptions", subId)).toBe(true);
    await admin.from("withdrawal_cases").delete().eq("id", caseId);
  });

  it("survives at FY2018 when a still-young billing_contract_confirmation references it", async () => {
    const subId = await insertSubscription({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const confId = await insertConfirmation({
      artist_id: null,
      generated_at: NOT_OLD_ENOUGH,
      billing_subscription_id: subId,
    });
    await purgeDeletedAccountBillingSubscriptions(NOW);
    expect(await exists("billing_subscriptions", subId)).toBe(true);
    await admin
      .from("billing_contract_confirmations")
      .delete()
      .eq("id", confId);
  });

  it("survives while a transaction_tax_snapshot references it, however old the subscription is, because THIS step never purges snapshots", async () => {
    const subId = await insertSubscription({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const snapshotId = await insertTaxSnapshot({
      artist_id: null,
      billing_subscription_id: subId,
    });
    // A hundred years from now this step still cannot touch it: the block
    // lasts exactly as long as the snapshot does, and only the snapshot step
    // (which runs BEFORE this one in a full run) can end it. Before counsel
    // Q1 that made the block permanent; now it makes the ORDERING
    // load-bearing, which is what this assertion pins.
    const farFuture = new Date("2126-01-01T00:00:00.000Z");
    await purgeDeletedAccountBillingSubscriptions(farFuture);
    expect(await exists("billing_subscriptions", subId)).toBe(true);
    expect(await exists("transaction_tax_snapshots", snapshotId)).toBe(true);
  });
});

describe("transaction_tax_snapshots: an ad-hoc DELETE over the API is still refused", () => {
  it("the immutability trigger rejects a direct delete attempt regardless of age", async () => {
    const id = await insertTaxSnapshot({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const { error } = await admin
      .from("transaction_tax_snapshots")
      .delete()
      .eq("id", id);
    expect(error?.message).toContain("append-only");
    expect(await exists("transaction_tax_snapshots", id)).toBe(true);
    // Manual cleanup: the row is nulled via UPDATE (the one mutation the
    // trigger allows), which is fine for the fixture since afterAll doesn't
    // rely on this row's artist_id.
  });
});

describe("runBillingRecordRetentionPurges: end-to-end dependency convergence", () => {
  it("a young withdrawal_case protects its consent record and subscription; once it ages past its own cutoff, a SINGLE later run purges the whole freed chain", async () => {
    const subId = await insertSubscription({
      artist_id: null,
      created_at: OLD_ENOUGH,
    });
    const confId = await insertConfirmation({
      artist_id: null,
      generated_at: OLD_ENOUGH,
      billing_subscription_id: subId,
    });
    const consentId = await insertConsent({
      artist_id: null,
      consented_at: OLD_ENOUGH,
    });
    const caseId = await insertWithdrawalCase({
      artist_id: null,
      created_at: NOT_OLD_ENOUGH, // deliberately too young, protects sub + consent
      billing_subscription_id: subId,
      immediate_performance_consent_id: consentId,
    });

    // First run at NOW: the leaf confirmation (old, unreferenced) is
    // purged; the withdrawal_case survives (too young) and, by surviving,
    // protects both the consent record and the subscription.
    const first = await runBillingRecordRetentionPurges(NOW);
    expect(first.purged_deleted_account_billing_contract_confirmations).toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(await exists("billing_contract_confirmations", confId)).toBe(false);
    expect(await exists("withdrawal_cases", caseId)).toBe(true);
    expect(await exists("billing_consent_records", consentId)).toBe(true);
    expect(await exists("billing_subscriptions", subId)).toBe(true);

    // Time passes far enough that the withdrawal_case's OWN financial year
    // (2019) is now also past its cutoff. A single later run purges the
    // case (now old enough itself), which frees the consent record and the
    // subscription in the SAME run (leaf-first ordering).
    const muchLater = new Date("2027-06-01T00:00:00.000Z");
    const second = await runBillingRecordRetentionPurges(muchLater);
    expect(Object.values(second).every((r) => r.ok)).toBe(true);
    expect(await exists("withdrawal_cases", caseId)).toBe(false);
    expect(await exists("billing_consent_records", consentId)).toBe(false);
    expect(await exists("billing_subscriptions", subId)).toBe(false);
  });
});

// Sanity: the OLD_ENOUGH/NOT_OLD_ENOUGH fixture dates above are pinned
// against the SAME cutoff function the purge functions call internally, so
// a future edit to the fixture constants can't silently drift from what the
// arithmetic actually requires without a failure showing up here.
describe("fixture/production cutoff agreement", () => {
  it("financialYearRetentionCutoff(NOW, 7) sits between OLD_ENOUGH and NOT_OLD_ENOUGH", () => {
    const cutoff = financialYearRetentionCutoff(NOW, 7);
    expect(cutoff.toISOString()).toBe("2019-01-01T00:00:00.000Z");
    expect(new Date(OLD_ENOUGH).getTime()).toBeLessThan(cutoff.getTime());
    expect(new Date(NOT_OLD_ENOUGH).getTime()).toBeGreaterThanOrEqual(
      cutoff.getTime(),
    );
  });
});
