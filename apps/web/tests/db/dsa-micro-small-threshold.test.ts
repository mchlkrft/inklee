import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./helpers/actor";

// Migration 0156: the DSA Section 4 (Art. 29) trader-traceability exclusion
// trigger row, seeded from counsel round-6 figures (master-package §6.4).
// tax_thresholds is service-role-only (RLS enabled, zero policies since 0108),
// so this reads via the admin client. The gate proves the seeded row carries
// the figures and the doc-side facts the money-only table cannot column
// (the 50-staff second limb, the two-consecutive-periods rule, the citation).

let admin: SupabaseClient;

beforeAll(() => {
  admin = adminClient();
});

describe("DSA micro/small threshold row (migration 0156)", () => {
  it("is seeded with the counsel-confirmed EUR 10m ceiling and EUR 8m warning", async () => {
    const { data, error } = await admin
      .from("tax_thresholds")
      .select("limit_minor, warning_minor, currency, status, notes")
      .eq("threshold_type", "dsa_micro_small_2003_361")
      .single();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // EUR 10,000,000 and EUR 8,000,000 in minor units (cents).
    expect(Number(data!.limit_minor)).toBe(1_000_000_000);
    expect(Number(data!.warning_minor)).toBe(800_000_000);
    expect(data!.currency).toBe("eur");
  });

  it("respects the warning<=limit constraint (early warning below the ceiling)", async () => {
    const { data } = await admin
      .from("tax_thresholds")
      .select("limit_minor, warning_minor")
      .eq("threshold_type", "dsa_micro_small_2003_361")
      .single();
    expect(Number(data!.warning_minor)).toBeLessThanOrEqual(
      Number(data!.limit_minor),
    );
  });

  it("carries the three facts the money-only table cannot column", async () => {
    const { data } = await admin
      .from("tax_thresholds")
      .select("notes")
      .eq("threshold_type", "dsa_micro_small_2003_361")
      .single();
    const notes = String(data!.notes).toLowerCase();
    // Second limb (headcount), the two-consecutive-periods rule, and the
    // Art. 29 / Section 4 citation counsel confirmed (Q1 + Q2).
    expect(notes).toContain("50 staff");
    expect(notes).toContain("two consecutive accounting periods");
    expect(notes).toContain("article 29");
    expect(notes).toContain("section 4");
  });
});
