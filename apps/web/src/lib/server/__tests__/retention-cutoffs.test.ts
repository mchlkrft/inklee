import { describe, it, expect } from "vitest";
import {
  financialYearRetentionCutoff,
  daysAgoCutoff,
  monthsAgoCutoff,
} from "../retention-cutoffs";

describe("financialYearRetentionCutoff", () => {
  it("returns 1 Jan of (now's year - retainYears)", () => {
    const cutoff = financialYearRetentionCutoff(
      new Date("2026-08-02T12:00:00Z"),
      7,
    );
    expect(cutoff.toISOString()).toBe("2019-01-01T00:00:00.000Z");
  });

  it("is NOT '7 years from the row's own date' — the naive version is wrong except for a 1 Jan row", () => {
    // An order recorded 2019-06-15. Naive-wrong arithmetic ("subtract 7
    // years from the row's own date") would call it purgeable the instant
    // `now` passes 2026-06-15. The counsel-specified rule is "7 years from
    // the END of the financial year" (financial year = calendar year), so
    // this row must survive through 31 Dec 2026 and become purgeable only
    // on/after 1 Jan 2027.
    const orderTimestamp = new Date("2019-06-15T00:00:00Z");
    const naiveWrongCutoff = new Date("2026-06-15T00:00:00Z");

    // The moment the naive formula would already purge it (one day past its
    // own wrong cutoff), the correct rule still retains it.
    const dayAfterNaiveCutoff = new Date("2026-06-16T00:00:00Z");
    const correctCutoffAtThatPoint = financialYearRetentionCutoff(
      dayAfterNaiveCutoff,
      7,
    );
    expect(orderTimestamp.getTime()).toBeGreaterThanOrEqual(
      correctCutoffAtThatPoint.getTime(),
    ); // NOT before the cutoff yet -> must NOT be purged.
    expect(orderTimestamp.getTime()).toBeLessThan(naiveWrongCutoff.getTime());

    // One day before the correct cutoff instant (31 Dec 2026): still
    // retained.
    const oneDayBeforeCorrectCutoff = financialYearRetentionCutoff(
      new Date("2026-12-31T00:00:00Z"),
      7,
    );
    expect(orderTimestamp.getTime()).toBeGreaterThanOrEqual(
      oneDayBeforeCorrectCutoff.getTime(),
    );

    // One day after the correct cutoff instant (1 Jan 2027): now purgeable.
    const atCorrectCutoff = financialYearRetentionCutoff(
      new Date("2027-01-01T00:00:00Z"),
      7,
    );
    expect(orderTimestamp.getTime()).toBeLessThan(atCorrectCutoff.getTime());
  });

  it("a row dated exactly 1 Jan of its financial year sits exactly on the boundary, never purged early", () => {
    // Financial year 2019 ends 31 Dec 2019; retained through 31 Dec 2026;
    // purgeable on/after 1 Jan 2027.
    const row = new Date("2019-01-01T00:00:00Z");
    const cutoffAtStartOf2027 = financialYearRetentionCutoff(
      new Date("2027-01-01T00:00:00Z"),
      7,
    );
    expect(row.getTime()).toBeLessThan(cutoffAtStartOf2027.getTime());

    const cutoffAtEndOf2026 = financialYearRetentionCutoff(
      new Date("2026-12-31T23:59:59Z"),
      7,
    );
    expect(row.getTime()).toBeGreaterThanOrEqual(cutoffAtEndOf2026.getTime());
  });
});

describe("daysAgoCutoff", () => {
  it("subtracts exact 24h periods, not calendar days", () => {
    const now = new Date("2026-08-02T10:00:00.000Z");
    const cutoff = daysAgoCutoff(now, 30);
    expect(cutoff.toISOString()).toBe("2026-07-03T10:00:00.000Z");
  });
});

describe("monthsAgoCutoff", () => {
  it("subtracts exact calendar months via UTC month arithmetic", () => {
    const now = new Date("2026-08-02T10:00:00.000Z");
    const cutoff = monthsAgoCutoff(now, 12);
    expect(cutoff.toISOString()).toBe("2025-08-02T10:00:00.000Z");
  });
});
