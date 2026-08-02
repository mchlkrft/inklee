import { describe, it, expect, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./helpers/actor";

/**
 * 0145 CHECK constraints on `tax_thresholds`. `status` had no CHECK since
 * 0108 (any string was accepted); `warning_minor` is new and has no
 * constraint of its own without this migration. `tax_thresholds` carries RLS
 * enabled with zero policies (0108: "service-role only"), so this is not an
 * RLS subject — a CHECK constraint binds every role, including the service
 * role that is this table's only writer — and the admin client is the
 * correct (and only possible) actor for it, unlike the RLS-subject files in
 * this directory.
 *
 * PRE-FLIGHT (AGENTS.md footgun: "a migration that re-runs without erroring
 * has not necessarily converged" has a sibling risk on the ADD side — adding
 * a CHECK to a table with pre-existing rows converges only if every existing
 * row already satisfies it). `select distinct status from tax_thresholds`
 * run against local Postgres 2026-08-02, before writing this file: the
 * table had been reset to empty by an unrelated isolated-migration probe
 * earlier in the same session, so the query returned zero rows — a fact
 * about this environment's history, not evidence either way about
 * accumulated data. `record-tax-approval.cjs` (the normal seeder) requires
 * `ssl: "require"` and refuses to connect to local Postgres, and it is a
 * billing script out of scope to modify for this probe. What COULD be
 * confirmed directly: `resolveThresholdStatus` (tax-threshold-rollup.ts)
 * returns only the literal union `"under" | "approaching" | "exceeded"` and
 * is documented (0145's own header) as the sole writer of any non-default
 * status; the column default is `'under'` (0108); and 0145's own
 * `alter table ... add constraint ... check (...)` carries no `NOT VALID`,
 * so Postgres validates every existing row at ALTER time — it already ran
 * clean against whatever the historically-accumulated local/production data
 * was as of this migration's own application, which a NOT VALID-less ALTER
 * cannot do silently. This file cannot re-derive that historical fact; it
 * proves the constraint's mechanical behavior going forward instead.
 *
 * MUTATION THAT REDS THIS FILE: drop either guarded `do $$ ... end $$` block
 * in 0145, or loosen either CHECK's expression. Executed 2026-08-02 as part
 * of this migration's own convergence probe: manually dropping
 * `tax_thresholds_status_check` and re-running 0145 restored it (the
 * guarded-block shape AGENTS.md names as convergent); this file is the
 * behavioral proof the restored constraint actually rejects what it should.
 */

let admin: SupabaseClient;
const PROBE_PREFIX = "probe_0145_";
const insertedTypes: string[] = [];

afterAll(async () => {
  admin = admin ?? adminClient();
  if (insertedTypes.length > 0) {
    await admin
      .from("tax_thresholds")
      .delete()
      .in("threshold_type", insertedTypes);
  }
});

describe("tax_thresholds CHECK constraints (0145)", () => {
  it("accepts a valid row (positive control)", async () => {
    admin = adminClient();
    const threshold_type = `${PROBE_PREFIX}valid`;
    insertedTypes.push(threshold_type);

    const { data, error } = await admin
      .from("tax_thresholds")
      .insert({
        threshold_type,
        limit_minor: 4_000_000,
        warning_minor: 3_500_000,
        status: "approaching",
      })
      .select("status")
      .single();

    expect(error, error?.message).toBeNull();
    expect(data?.status).toBe("approaching");
  });

  it("rejects an out-of-vocabulary status", async () => {
    const threshold_type = `${PROBE_PREFIX}bad-status`;

    const { data, error } = await admin.from("tax_thresholds").insert({
      threshold_type,
      limit_minor: 100,
      warning_minor: 50,
      status: "urgent", // not in ('under', 'approaching', 'exceeded')
    });

    expect(data).toBeNull();
    expect(
      error,
      "an out-of-vocabulary status must be rejected",
    ).not.toBeNull();
    expect(error?.code, "expected a check-constraint violation").toBe("23514");
    expect(error?.message).toContain("tax_thresholds_status_check");

    // Confirm the row was never written, not merely that an error came back.
    const { data: rows } = await admin
      .from("tax_thresholds")
      .select("id")
      .eq("threshold_type", threshold_type);
    expect(rows ?? []).toHaveLength(0);
  });

  it("rejects warning_minor above limit_minor", async () => {
    const threshold_type = `${PROBE_PREFIX}bad-warning`;

    const { data, error } = await admin.from("tax_thresholds").insert({
      threshold_type,
      limit_minor: 100,
      warning_minor: 150, // above the statutory limit it warns about
      status: "under",
    });

    expect(data).toBeNull();
    expect(
      error,
      "a warning point above the limit must be rejected",
    ).not.toBeNull();
    expect(error?.code, "expected a check-constraint violation").toBe("23514");
    expect(error?.message).toContain("tax_thresholds_warning_lte_limit_check");

    const { data: rows } = await admin
      .from("tax_thresholds")
      .select("id")
      .eq("threshold_type", threshold_type);
    expect(rows ?? []).toHaveLength(0);
  });

  it("accepts a null warning_minor (union_turnover_sme has none confirmed)", async () => {
    const threshold_type = `${PROBE_PREFIX}null-warning`;
    insertedTypes.push(threshold_type);

    const { data, error } = await admin
      .from("tax_thresholds")
      .insert({
        threshold_type,
        limit_minor: 10_000_000,
        warning_minor: null,
        status: "under",
      })
      .select("warning_minor")
      .single();

    expect(error, error?.message).toBeNull();
    expect(data?.warning_minor).toBeNull();
  });
});
