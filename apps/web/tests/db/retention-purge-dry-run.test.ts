import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/cron/retention-purge/route";
import { PURGED_EMAIL_PLACEHOLDER } from "@/lib/server/shop-retention";

/**
 * Counsel Q14, element (1): "a staging run against real-schema synthetic
 * expiring data covering every block, recorded."
 *
 * The complaint Q14 answers is that the retention purge has never executed
 * against real expiring data and cannot until 2028, so "it runs monthly
 * without erroring" is indistinguishable from "it is a no-op". Every other
 * test of this control mocks the database, which means none of them can catch
 * a block whose predicate is simply WRONG against the real schema — a renamed
 * column, a dropped table, a filter PostgREST rejects. Those blocks would
 * report an error on their first real run, in production, unattended, at
 * whatever hour the cron fires.
 *
 * This file runs the ACTUAL route handler against a real Postgres in
 * `dry-run` mode. It proves three things a mocked test cannot:
 *
 *   1. every block's query is valid against the live schema (no block errors)
 *   2. a synthetic expiring row is actually MATCHED end to end, through the
 *      route, not just through the purge function in isolation
 *   3. the run writes its evidence row, and the dry-run leaves the data alone
 *
 * It is the local-stack half of counsel's element (1). The production
 * counterpart is the manual dry-run described in
 * `docs/retention-purge-operations.md`, which nobody can run from here.
 */

const LABEL = "q14-dryrun";
const SECRET = "q14-dry-run-secret";

/** Blocks that must every one report a count. Deliberately a REQUIRED SUBSET
 *  rather than an exact set: a future block should not red this file, but a
 *  block that silently disappears or starts erroring must. */
const REQUIRED_BLOCKS = [
  "purged_financial_records",
  "purged_audit_rows",
  "purged_admin_rows",
  "purged_analytics_events",
  "purged_activity_days",
  "purged_web_analytics_events",
  "purged_wa_visits",
  "purged_wa_rollup_days",
  "purged_map_reports",
  "purged_cancelled_standalone_order_emails",
  "purged_completed_standalone_order_emails",
  "purged_abandoned_carts",
  "purged_inactive_wishlist_items",
  "unstamped_cancelled_standalone_orders",
  "purged_deleted_account_withdrawal_cases",
  "purged_deleted_account_billing_contract_confirmations",
  "purged_deleted_account_billing_consent_records",
  "purged_deleted_account_billing_subscriptions",
  // The tax ledger was missing from this list while it was the one billing
  // block whose predicate lived in an RPC rather than in PostgREST filters —
  // i.e. the one whose disappearance this file was least able to notice.
  // Added with counsel round 4 §7.4 (migration 0150).
  "purged_expired_transaction_tax_snapshots",
  // Counsel §7.4 requires the Art. 17(3)(e) carve-out be "flagged rather than
  // silently skipped", so the held count is a BLOCK, not a detail inside one.
  // Listing it here is what makes its disappearance a test failure.
  "transaction_tax_snapshots_held_by_legal_hold",
  // LO-5 DPIA §7 mitigation R6 (intake-retention.ts). Listed here so the
  // route-level dry-run proves these four queries are valid against the
  // DEPLOYED schema, which their own unit tests (a faked store) cannot: a
  // block keyed to `projects.closed_at` on a database that never ran
  // migration 0152 must red here rather than on its first unattended run.
  "purged_unconverted_intake_media",
  "purged_closed_project_intake_media",
  "unstamped_closed_projects",
  "stale_open_projects_retaining_intake_media",
];

let admin: SupabaseClient;
let artist: Actor;
let expiringOrderId: string;
let previousSecret: string | undefined;

function request(query = ""): Request {
  return new Request(`https://inkl.ee/api/cron/retention-purge${query}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

beforeAll(async () => {
  previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;

  admin = adminClient();
  artist = await makeActor(admin, LABEL);

  // Synthetic expiring data: a standalone order cancelled 45 days ago, which
  // is past the 30-day guest-email rule whatever day this test runs.
  const { data, error } = await admin
    .from("orders")
    .insert({
      artist_id: artist.id,
      deposit_amount: 0,
      subtotal_amount: 0,
      client_email: "q14-dryrun-expiring@example.com",
      status: "cancelled",
      cancelled_at: new Date(
        Date.now() - 45 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  expiringOrderId = data!.id as string;
}, 60_000);

afterAll(async () => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;

  await admin.from("orders").delete().eq("artist_id", artist.id);
  await admin.from("profiles").delete().eq("id", artist.id);
  await admin.auth.admin.deleteUser(artist.id);
}, 60_000);

describe("Q14: a full dry-run of the real route against a real database", () => {
  it("executes every block against the live schema with no block failing", async () => {
    const res = await GET(request("?mode=dry-run"));
    const body = (await res.json()) as Record<string, unknown>;

    // `errors` is the assertion that matters: a block whose SQL does not
    // match the deployed schema lands there instead of throwing, so a test
    // that only checked the status would pass while blocks were broken.
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    expect(res.status).toBe(200);
    expect(body.mode).toBe("dry-run");

    for (const block of REQUIRED_BLOCKS) {
      expect(typeof body[block], `block ${block} reported no count`).toBe(
        "number",
      );
    }
  });

  it("matches the synthetic expiring row and does not touch it", async () => {
    const res = await GET(request("?mode=dry-run"));
    const body = (await res.json()) as Record<string, number>;

    expect(
      body.purged_cancelled_standalone_order_emails,
    ).toBeGreaterThanOrEqual(1);

    const after = await admin
      .from("orders")
      .select("client_email")
      .eq("id", expiringOrderId)
      .single();
    expect(after.data?.client_email).toBe("q14-dryrun-expiring@example.com");
    expect(after.data?.client_email).not.toBe(PURGED_EMAIL_PLACEHOLDER);
  });

  it("records the run in retention_purge_runs with the per-block counts", async () => {
    const before = new Date().toISOString();
    await GET(request("?mode=dry-run"));

    const { data, error } = await admin
      .from("retention_purge_runs")
      .select("mode, ok, step_counts, step_errors, duration_ms")
      .gte("ran_at", before)
      .order("ran_at", { ascending: false })
      .limit(1);
    expect(error, error?.message).toBeNull();
    expect(data, "the run left no evidence row").toHaveLength(1);

    const row = data![0] as Record<string, unknown>;
    expect(row.mode).toBe("dry-run");
    expect(row.ok).toBe(true);
    expect(row.step_errors).toEqual([]);
    const counts = row.step_counts as Record<string, number>;
    for (const block of REQUIRED_BLOCKS) {
      expect(typeof counts[block], `run log is missing ${block}`).toBe(
        "number",
      );
    }
  });

  it("refuses a run without the cron secret", async () => {
    const res = await GET(
      new Request("https://inkl.ee/api/cron/retention-purge?mode=dry-run"),
    );
    expect(res.status).toBe(401);
  });
});

describe("retention_purge_runs is service-role only", () => {
  it("an authenticated client cannot read the evidence log", async () => {
    const { data, error } = await artist.client
      .from("retention_purge_runs")
      .select("id");
    // RLS on with no policy: PostgREST returns an empty set rather than an
    // error for a SELECT, and the REVOKE turns it into a 42501. Either is a
    // refusal; what must never happen is rows coming back.
    if (!error) expect(data ?? []).toHaveLength(0);
    else expect(error.code).toBe("42501");
  });

  it("an authenticated client cannot forge an evidence row", async () => {
    const { error } = await artist.client
      .from("retention_purge_runs")
      .insert({ mode: "purge", ok: true });
    expect(
      error,
      "an artist must not be able to write the audit log",
    ).not.toBeNull();
    expect(["42501", "PGRST301"]).toContain(error!.code);
  });

  // The `mode` check constraint, the zero-count row and the failed-run row are
  // pinned in retention-dry-run.test.ts, which owns the ledger's own
  // behaviour. This file owns who may reach it.
});
