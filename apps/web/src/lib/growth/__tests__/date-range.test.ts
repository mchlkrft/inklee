import { describe, expect, it } from "vitest";
import {
  GROWTH_EPOCH,
  dayKeyInTimeZone,
  resolveGrowthRange,
  startOfDayInTimeZone,
} from "../date-range";

const TZ = "Europe/Berlin";
const DAY_MS = 86_400_000;

/** Fixed reference: 2026-07-10 17:30 in Berlin (CEST, UTC+2). */
const NOW = new Date("2026-07-10T15:30:00Z");

describe("resolveGrowthRange presets", () => {
  it("anchors the last 7 days to the start of tomorrow in Berlin", () => {
    const range = resolveGrowthRange({ range: "7" }, TZ, NOW);
    expect(range.key).toBe("7");
    expect(range.label).toBe("Last 7 days");
    // Start of 2026-07-11 in Berlin is 2026-07-10 22:00 UTC, so all of
    // "today" is inside the half-open [from, to).
    expect(range.to.toISOString()).toBe("2026-07-10T22:00:00.000Z");
    expect(range.from.toISOString()).toBe("2026-07-03T22:00:00.000Z");
    expect(range.bucket).toBe("day");
  });

  it("makes the previous period adjacent and equal in length", () => {
    const range = resolveGrowthRange({ range: "7" }, TZ, NOW);
    expect(range.previousTo?.getTime()).toBe(range.from.getTime());
    expect(range.previousFrom?.toISOString()).toBe("2026-06-26T22:00:00.000Z");
    expect(range.previousTo!.getTime() - range.previousFrom!.getTime()).toBe(
      range.to.getTime() - range.from.getTime(),
    );
  });

  it("defaults to the last 30 days when range is missing", () => {
    const range = resolveGrowthRange({}, TZ, NOW);
    expect(range.key).toBe("30");
    expect(range.label).toBe("Last 30 days");
    expect(range.from.toISOString()).toBe("2026-06-10T22:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-07-10T22:00:00.000Z");
    expect(range.previousFrom?.toISOString()).toBe("2026-05-11T22:00:00.000Z");
    expect(range.bucket).toBe("day");
  });

  it("falls back to 30 days for unknown range values", () => {
    const range = resolveGrowthRange({ range: "banana" }, TZ, NOW);
    expect(range.key).toBe("30");
    expect(range.label).toBe("Last 30 days");
  });

  it("resolves 90 days with a weekly bucket", () => {
    const range = resolveGrowthRange({ range: "90" }, TZ, NOW);
    expect(range.key).toBe("90");
    expect(range.from.toISOString()).toBe("2026-04-11T22:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-07-10T22:00:00.000Z");
    expect(range.bucket).toBe("week");
    // Equal-length previous window even across the March DST change.
    expect(range.previousTo!.getTime() - range.previousFrom!.getTime()).toBe(
      90 * DAY_MS,
    );
  });

  it("resolves 365 days with a monthly bucket", () => {
    const range = resolveGrowthRange({ range: "365" }, TZ, NOW);
    expect(range.key).toBe("365");
    expect(range.label).toBe("Last 365 days");
    expect(range.to.getTime() - range.from.getTime()).toBe(365 * DAY_MS);
    expect(range.bucket).toBe("month");
  });

  it("uses the Berlin calendar day, not the UTC day, near midnight", () => {
    // 23:30 UTC is already 2026-07-11 01:30 in Berlin.
    const lateNow = new Date("2026-07-10T23:30:00Z");
    const range = resolveGrowthRange({ range: "7" }, TZ, lateNow);
    expect(range.to.toISOString()).toBe("2026-07-11T22:00:00.000Z");
    expect(range.from.toISOString()).toBe("2026-07-04T22:00:00.000Z");
  });
});

describe("resolveGrowthRange custom", () => {
  it("turns the inclusive end date into an exclusive bound", () => {
    const range = resolveGrowthRange(
      { range: "custom", from: "2026-06-01", to: "2026-06-10" },
      TZ,
      NOW,
    );
    expect(range.key).toBe("custom");
    expect(range.label).toBe("2026-06-01 to 2026-06-10");
    expect(range.from.toISOString()).toBe("2026-05-31T22:00:00.000Z");
    // Exclusive bound = start of 2026-06-11 in Berlin.
    expect(range.to.toISOString()).toBe("2026-06-10T22:00:00.000Z");
    expect(range.bucket).toBe("day");
  });

  it("gives the previous window the same length, ending at from", () => {
    const range = resolveGrowthRange(
      { range: "custom", from: "2026-06-01", to: "2026-06-10" },
      TZ,
      NOW,
    );
    expect(range.previousFrom?.toISOString()).toBe("2026-05-21T22:00:00.000Z");
    expect(range.previousTo?.toISOString()).toBe("2026-05-31T22:00:00.000Z");
  });

  it("supports a single-day window (from equals to)", () => {
    const range = resolveGrowthRange(
      { range: "custom", from: "2026-06-05", to: "2026-06-05" },
      TZ,
      NOW,
    );
    expect(range.from.toISOString()).toBe("2026-06-04T22:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-06-05T22:00:00.000Z");
    expect(range.previousFrom?.toISOString()).toBe("2026-06-03T22:00:00.000Z");
  });

  it("falls back to 30 days on malformed or inverted inputs", () => {
    const cases = [
      { range: "custom", from: "junk", to: "2026-06-10" },
      { range: "custom", from: "2026-6-01", to: "2026-06-10" },
      { range: "custom", from: "2026-06-10", to: "2026-06-01" }, // from > to
      { range: "custom", from: "2026-06-01" }, // missing to
      { range: "custom" },
    ];
    for (const params of cases) {
      const range = resolveGrowthRange(params, TZ, NOW);
      expect(range.key).toBe("30");
      expect(range.label).toBe("Last 30 days");
    }
  });

  it("selects the series bucket from the window length", () => {
    const bucketOf = (from: string, to: string) =>
      resolveGrowthRange({ range: "custom", from, to }, TZ, NOW).bucket;
    expect(bucketOf("2026-05-01", "2026-06-14")).toBe("day"); // 45 days
    expect(bucketOf("2026-05-01", "2026-06-15")).toBe("week"); // 46 days
    expect(bucketOf("2026-04-01", "2026-10-17")).toBe("week"); // 200 days
    expect(bucketOf("2026-04-01", "2026-10-18")).toBe("month"); // 201 days
  });
});

describe("resolveGrowthRange month presets (Europe/Berlin)", () => {
  it("resolves this month with the previous month as comparison", () => {
    const range = resolveGrowthRange({ range: "month" }, TZ, NOW);
    expect(range.key).toBe("month");
    expect(range.label).toBe("This month");
    expect(range.from.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-07-31T22:00:00.000Z");
    expect(range.previousFrom?.toISOString()).toBe("2026-05-31T22:00:00.000Z");
    expect(range.previousTo?.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(range.bucket).toBe("day");
  });

  it("resolves last month one step further back", () => {
    const range = resolveGrowthRange({ range: "prev-month" }, TZ, NOW);
    expect(range.key).toBe("prev-month");
    expect(range.label).toBe("Last month");
    expect(range.from.toISOString()).toBe("2026-05-31T22:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(range.previousFrom?.toISOString()).toBe("2026-04-30T22:00:00.000Z");
    expect(range.previousTo?.toISOString()).toBe("2026-05-31T22:00:00.000Z");
  });

  it("uses the Berlin month when UTC is still in the previous month", () => {
    // 2026-06-30 23:30 UTC is already 2026-07-01 01:30 in Berlin.
    const lateNow = new Date("2026-06-30T23:30:00Z");
    const range = resolveGrowthRange({ range: "month" }, TZ, lateNow);
    expect(range.from.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-07-31T22:00:00.000Z");
  });

  it("handles a month whose bounds straddle the DST change", () => {
    // March 2026: starts in CET (UTC+1), ends in CEST (UTC+2).
    const april = new Date("2026-04-15T12:00:00Z");
    const range = resolveGrowthRange({ range: "prev-month" }, TZ, april);
    expect(range.from.toISOString()).toBe("2026-02-28T23:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-03-31T22:00:00.000Z");
    expect(range.previousFrom?.toISOString()).toBe("2026-01-31T23:00:00.000Z");
    expect(range.previousTo?.toISOString()).toBe("2026-02-28T23:00:00.000Z");
  });
});

describe("resolveGrowthRange all time", () => {
  it("spans from the growth epoch to now with no previous period", () => {
    const range = resolveGrowthRange({ range: "all" }, TZ, NOW);
    expect(range.key).toBe("all");
    expect(range.label).toBe("All time");
    expect(range.from.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(range.from.getTime()).toBe(GROWTH_EPOCH.getTime());
    expect(range.to.getTime()).toBe(NOW.getTime());
    expect(range.previousFrom).toBeNull();
    expect(range.previousTo).toBeNull();
    expect(range.bucket).toBe("month");
  });
});

describe("timezone day helpers across the 2026-03-29 DST change", () => {
  it("finds local midnight before the spring-forward day (CET, UTC+1)", () => {
    expect(startOfDayInTimeZone("2026-03-29", TZ).toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
  });

  it("finds local midnight after the spring-forward day (CEST, UTC+2)", () => {
    expect(startOfDayInTimeZone("2026-03-30", TZ).toISOString()).toBe(
      "2026-03-29T22:00:00.000Z",
    );
  });

  it("gives the spring-forward day only 23 hours", () => {
    const start = startOfDayInTimeZone("2026-03-29", TZ).getTime();
    const nextStart = startOfDayInTimeZone("2026-03-30", TZ).getTime();
    expect(nextStart - start).toBe(23 * 3_600_000);
  });

  it("maps instants to Berlin day keys across the boundary", () => {
    expect(dayKeyInTimeZone(new Date("2026-03-28T22:59:59Z"), TZ)).toBe(
      "2026-03-28",
    );
    expect(dayKeyInTimeZone(new Date("2026-03-28T23:00:00Z"), TZ)).toBe(
      "2026-03-29",
    );
    expect(dayKeyInTimeZone(new Date("2026-03-29T21:59:59Z"), TZ)).toBe(
      "2026-03-29",
    );
    expect(dayKeyInTimeZone(new Date("2026-03-29T22:00:00Z"), TZ)).toBe(
      "2026-03-30",
    );
  });

  it("round-trips day keys through startOfDay and back", () => {
    const keys = [
      "2026-03-28", // last full CET day
      "2026-03-29", // the 23-hour day
      "2026-03-30", // first full CEST day
      "2026-01-15", // plain winter day
      "2026-07-15", // plain summer day
    ];
    for (const key of keys) {
      expect(dayKeyInTimeZone(startOfDayInTimeZone(key, TZ), TZ)).toBe(key);
    }
  });

  it("uses the fixed winter and summer offsets on plain days", () => {
    expect(startOfDayInTimeZone("2026-01-15", TZ).toISOString()).toBe(
      "2026-01-14T23:00:00.000Z",
    );
    expect(startOfDayInTimeZone("2026-07-15", TZ).toISOString()).toBe(
      "2026-07-14T22:00:00.000Z",
    );
  });
});
