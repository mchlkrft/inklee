import { describe, it, expect } from "vitest";
import {
  computeAnalytics,
  analyticsCutoffIso,
  type AnalyticsRow,
} from "@inklee/shared/analytics";

const row = (over: Partial<AnalyticsRow>): AnalyticsRow => ({
  status: "pending",
  customer_email: null,
  deposit_amount: null,
  created_at: "2026-06-01T00:00:00Z",
  ...over,
});

describe("computeAnalytics", () => {
  it("guards division by zero on empty rows", () => {
    expect(computeAnalytics([])).toMatchObject({
      total: 0,
      conversionRate: 0,
      rejectionRate: 0,
      returnRate: 0,
      depositRate: null,
      months: [],
    });
  });

  it("counts deposit_pending toward conversion but NOT toward depositPaid", () => {
    const m = computeAnalytics([
      row({ status: "deposit_pending", deposit_amount: 50 }),
      row({ status: "approved", deposit_amount: 50 }),
    ]);
    expect(m.approved).toBe(2); // both count as 'approved' for conversion
    expect(m.conversionRate).toBe(100);
    expect(m.depositRequested).toBe(2);
    expect(m.depositPaid).toBe(1); // only status==='approved'
    expect(m.depositRate).toBe(50);
  });

  it("computes return rate from repeat emails (nulls excluded)", () => {
    const m = computeAnalytics([
      row({ customer_email: "a@x.com" }),
      row({ customer_email: "a@x.com" }),
      row({ customer_email: "b@x.com" }),
      row({ customer_email: null }),
    ]);
    expect(m.uniqueClients).toBe(2);
    expect(m.repeatClients).toBe(1);
    expect(m.returnRate).toBe(50);
  });

  it("rounds rates and aggregates the last 6 months ascending", () => {
    const rows: AnalyticsRow[] = [];
    for (let i = 1; i <= 8; i++) {
      rows.push(
        row({
          created_at: `2026-0${i <= 9 ? i : i}-01T00:00:00Z`.slice(0, 19),
        }),
      );
    }
    const m = computeAnalytics(rows);
    expect(m.months.length).toBe(6);
    const keys = m.months.map((x) => x.month);
    expect([...keys].sort()).toEqual(keys); // ascending
  });
});

describe("analyticsCutoffIso", () => {
  it("returns a cutoff for 30/90 and null for all-time", () => {
    const now = Date.parse("2026-06-19T00:00:00Z");
    expect(analyticsCutoffIso("30", now)).toBe(
      new Date(now - 30 * 86_400_000).toISOString(),
    );
    expect(analyticsCutoffIso("90", now)).toBe(
      new Date(now - 90 * 86_400_000).toISOString(),
    );
    expect(analyticsCutoffIso("all", now)).toBe(null);
    expect(analyticsCutoffIso("anything", now)).toBe(null);
  });
});
