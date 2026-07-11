import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETENTION_THRESHOLDS,
  buildEngagementSummary,
  buildRetentionCohorts,
  classifyRetention,
  daysSinceLastActivity,
  findReactivations,
} from "../retention";
import { makeActivatedRow, makeActivityDay, makeRow } from "./fixtures";

/** Fixed reference instant so silent-day arithmetic is exact. */
const NOW = new Date("2026-07-01T12:00:00Z");

/** ISO timestamp exactly `days` days before NOW. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

/** UTC day key, a deterministic dayKeyOf for cohort tests. */
const utcDayKey = (iso: string) => iso.slice(0, 10);

describe("daysSinceLastActivity", () => {
  it("is null when no activity source exists at all", () => {
    expect(daysSinceLastActivity(makeRow(), NOW)).toBeNull();
  });

  it("picks the most recent timestamp across all sources", () => {
    const row = makeRow({
      last_activity_at: daysAgo(10),
      last_mobile_seen_at: daysAgo(20),
      last_sign_in_at: daysAgo(3),
    });
    expect(daysSinceLastActivity(row, NOW)).toBe(3);
  });

  it("reads presence day keys as noon UTC of that day", () => {
    // 2026-06-30T12:00:00Z is exactly one day before NOW.
    const row = makeRow({
      last_presence_day: "2026-06-30",
      last_activity_at: daysAgo(5),
    });
    expect(daysSinceLastActivity(row, NOW)).toBe(1);
  });

  it("floors partial days", () => {
    expect(
      daysSinceLastActivity(makeRow({ last_activity_at: daysAgo(1.5) }), NOW),
    ).toBe(1);
  });
});

describe("classifyRetention (default thresholds)", () => {
  it("uses the documented defaults", () => {
    expect(DEFAULT_RETENTION_THRESHOLDS).toEqual({
      activeDays: 14,
      churnRiskDays: 21,
      dormantDays: 30,
      churnedDays: 90,
      reactivationGapDays: 30,
    });
  });

  it("is active at exactly activeDays of silence", () => {
    const row = makeActivatedRow({ last_activity_at: daysAgo(14) });
    expect(classifyRetention(row, NOW)).toBe("active");
  });

  it("stays active in the quiet zone between activeDays and churnRiskDays", () => {
    expect(
      classifyRetention(
        makeActivatedRow({ last_activity_at: daysAgo(15) }),
        NOW,
      ),
    ).toBe("active");
    expect(
      classifyRetention(
        makeActivatedRow({ last_activity_at: daysAgo(21) }),
        NOW,
      ),
    ).toBe("active");
  });

  it("is churn_risk strictly above churnRiskDays", () => {
    expect(
      classifyRetention(
        makeActivatedRow({ last_activity_at: daysAgo(22) }),
        NOW,
      ),
    ).toBe("churn_risk");
    expect(
      classifyRetention(
        makeActivatedRow({ last_activity_at: daysAgo(29) }),
        NOW,
      ),
    ).toBe("churn_risk");
  });

  it("is dormant at exactly dormantDays", () => {
    expect(
      classifyRetention(
        makeActivatedRow({ last_activity_at: daysAgo(30) }),
        NOW,
      ),
    ).toBe("dormant");
    expect(
      classifyRetention(
        makeActivatedRow({ last_activity_at: daysAgo(89) }),
        NOW,
      ),
    ).toBe("dormant");
  });

  it("is churned at exactly churnedDays", () => {
    expect(
      classifyRetention(
        makeActivatedRow({ last_activity_at: daysAgo(90) }),
        NOW,
      ),
    ).toBe("churned");
    expect(
      classifyRetention(
        makeActivatedRow({ last_activity_at: daysAgo(400) }),
        NOW,
      ),
    ).toBe("churned");
  });

  it("keeps never-activated artists in pre_activation regardless of silence", () => {
    expect(
      classifyRetention(makeRow({ last_activity_at: daysAgo(400) }), NOW),
    ).toBe("pre_activation");
    expect(
      classifyRetention(makeRow({ last_activity_at: daysAgo(0) }), NOW),
    ).toBe("pre_activation");
    // Onboarding done but no booking signal is still pre-activation.
    expect(
      classifyRetention(
        makeRow({ onboarding_completed: true, last_activity_at: daysAgo(1) }),
        NOW,
      ),
    ).toBe("pre_activation");
  });

  it("treats an activated artist with no recorded activity as dormant", () => {
    expect(classifyRetention(makeActivatedRow(), NOW)).toBe("dormant");
  });
});

describe("findReactivations", () => {
  it("detects a return after a gap of at least gapDays", () => {
    const result = findReactivations(
      [makeActivityDay("a", "2026-01-01"), makeActivityDay("a", "2026-02-15")],
      30,
    );
    expect(result.get("a")).toEqual(["2026-02-15"]);
  });

  it("counts a gap of exactly gapDays", () => {
    // 2026-01-01 to 2026-01-31 is exactly 30 days.
    const result = findReactivations(
      [makeActivityDay("a", "2026-01-01"), makeActivityDay("a", "2026-01-31")],
      30,
    );
    expect(result.get("a")).toEqual(["2026-01-31"]);
  });

  it("ignores gaps below gapDays", () => {
    const result = findReactivations(
      [makeActivityDay("a", "2026-01-01"), makeActivityDay("a", "2026-01-30")],
      30,
    );
    expect(result.size).toBe(0);
  });

  it("produces no false positives on consecutive days", () => {
    const result = findReactivations(
      [
        makeActivityDay("a", "2026-01-01"),
        makeActivityDay("a", "2026-01-02"),
        makeActivityDay("a", "2026-01-03"),
      ],
      30,
    );
    expect(result.size).toBe(0);
  });

  it("handles unsorted input and duplicate days", () => {
    const result = findReactivations(
      [
        makeActivityDay("a", "2026-02-15"),
        makeActivityDay("a", "2026-01-01"),
        makeActivityDay("a", "2026-02-15"),
      ],
      30,
    );
    expect(result.get("a")).toEqual(["2026-02-15"]);
  });

  it("tracks artists independently", () => {
    const result = findReactivations(
      [
        makeActivityDay("gap", "2026-01-01"),
        makeActivityDay("gap", "2026-03-01"),
        makeActivityDay("steady", "2026-01-01"),
        makeActivityDay("steady", "2026-01-05"),
      ],
      30,
    );
    expect(result.size).toBe(1);
    expect(result.get("gap")).toEqual(["2026-03-01"]);
  });

  it("records multiple reactivations for the same artist", () => {
    // Both gaps are 45 days.
    const result = findReactivations(
      [
        makeActivityDay("a", "2026-01-01"),
        makeActivityDay("a", "2026-02-15"),
        makeActivityDay("a", "2026-04-01"),
      ],
      30,
    );
    expect(result.get("a")).toEqual(["2026-02-15", "2026-04-01"]);
  });
});

describe("buildRetentionCohorts", () => {
  it("leaves future and partially elapsed checkpoints null, not zero", () => {
    const grid = buildRetentionCohorts({
      rows: [makeRow({ id: "a", profile_claimed_at: "2026-05-01T00:00:00Z" })],
      activityDays: [],
      cohortBy: "month",
      dayKeyOf: utcDayKey,
      // Day-1 window [05-02, 05-09) fully elapsed by today 05-08 (today's
      // activity day is observable). Day-7 window [05-08, 05-15) is only
      // partially elapsed: blank, not zero.
      todayKey: "2026-05-08",
    });
    expect(grid).toHaveLength(1);
    expect(grid[0].cohort).toBe("2026-05-01");
    expect(grid[0].size).toBe(1);
    expect(grid[0].cells.map((cell) => cell.checkpoint)).toEqual([
      1, 7, 14, 30, 60, 90,
    ]);
    expect(grid[0].cells.map((cell) => cell.pct)).toEqual([
      0,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(grid[0].cells.map((cell) => cell.retained)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    expect(grid[0].cells.map((cell) => cell.measurable)).toEqual([
      1, 0, 0, 0, 0, 0,
    ]);
  });

  it("blanks checkpoints whose window predates the activity lookback", () => {
    // Activity fetched only from 2026-05-05 onward: the day-1 window starts
    // 05-02 before the lookback, so it is unmeasurable (blank), never zero.
    const grid = buildRetentionCohorts({
      rows: [makeRow({ id: "a", profile_claimed_at: "2026-05-01T00:00:00Z" })],
      activityDays: [makeActivityDay("a", "2026-05-09")],
      cohortBy: "month",
      dayKeyOf: utcDayKey,
      todayKey: "2026-09-01",
      lookbackStartKey: "2026-05-05",
    });
    expect(grid[0].cells.map((cell) => cell.pct)).toEqual([
      null,
      100,
      0,
      0,
      0,
      0,
    ]);
  });

  it("counts activity only inside the 7-day window from each checkpoint", () => {
    const grid = buildRetentionCohorts({
      rows: [makeRow({ id: "a", profile_claimed_at: "2026-05-01T00:00:00Z" })],
      activityDays: [makeActivityDay("a", "2026-05-08")],
      cohortBy: "month",
      dayKeyOf: utcDayKey,
      todayKey: "2026-09-01",
    });
    // 05-08 falls in the day-1 window [05-02, 05-09) and the day-7 window
    // [05-08, 05-15), but no later window.
    expect(grid[0].cells.map((cell) => cell.pct)).toEqual([
      100, 100, 0, 0, 0, 0,
    ]);
  });

  it("treats the window end as exclusive", () => {
    const grid = buildRetentionCohorts({
      rows: [makeRow({ id: "a", profile_claimed_at: "2026-05-01T00:00:00Z" })],
      activityDays: [makeActivityDay("a", "2026-05-15")],
      cohortBy: "month",
      dayKeyOf: utcDayKey,
      todayKey: "2026-09-01",
    });
    // 05-15 is outside the day-7 window [05-08, 05-15) but inside the day-14
    // window [05-15, 05-22).
    expect(grid[0].cells.map((cell) => cell.pct)).toEqual([0, 0, 100, 0, 0, 0]);
  });

  it("buckets by week starting Monday", () => {
    const grid = buildRetentionCohorts({
      rows: [
        // Tuesday and Friday of the week starting Monday 2026-04-27.
        makeRow({ id: "a", profile_claimed_at: "2026-04-28T09:00:00Z" }),
        makeRow({ id: "b", profile_claimed_at: "2026-05-01T12:00:00Z" }),
        // Monday of the next week.
        makeRow({ id: "c", profile_claimed_at: "2026-05-04T08:00:00Z" }),
      ],
      activityDays: [],
      cohortBy: "week",
      dayKeyOf: utcDayKey,
      todayKey: "2026-09-01",
    });
    expect(grid.map((row) => [row.cohort, row.size])).toEqual([
      ["2026-04-27", 2],
      ["2026-05-04", 1],
    ]);
  });

  it("buckets by month", () => {
    const grid = buildRetentionCohorts({
      rows: [
        makeRow({ id: "a", profile_claimed_at: "2026-05-01T00:00:00Z" }),
        makeRow({ id: "b", profile_claimed_at: "2026-05-20T00:00:00Z" }),
        makeRow({ id: "c", profile_claimed_at: "2026-06-02T00:00:00Z" }),
      ],
      activityDays: [],
      cohortBy: "month",
      dayKeyOf: utcDayKey,
      todayKey: "2026-09-01",
    });
    expect(grid.map((row) => [row.cohort, row.size])).toEqual([
      ["2026-05-01", 2],
      ["2026-06-01", 1],
    ]);
  });

  it("filters to activated artists when onlyActivated is set", () => {
    const rows = [
      makeActivatedRow({ id: "a", profile_claimed_at: "2026-05-01T00:00:00Z" }),
      makeRow({ id: "b", profile_claimed_at: "2026-05-02T00:00:00Z" }),
    ];
    const base = {
      rows,
      activityDays: [],
      cohortBy: "month" as const,
      dayKeyOf: utcDayKey,
      todayKey: "2026-09-01",
    };
    expect(
      buildRetentionCohorts({ ...base, onlyActivated: true })[0].size,
    ).toBe(1);
    expect(buildRetentionCohorts(base)[0].size).toBe(2);
  });

  it("always excludes non-counted rows", () => {
    const grid = buildRetentionCohorts({
      rows: [
        makeRow({
          id: "t",
          is_tester: true,
          profile_claimed_at: "2026-05-01T00:00:00Z",
        }),
      ],
      activityDays: [],
      cohortBy: "month",
      dayKeyOf: utcDayKey,
      todayKey: "2026-09-01",
    });
    expect(grid).toEqual([]);
  });
});

describe("buildEngagementSummary", () => {
  it("dedupes artists within each day, week, and month bucket", () => {
    const summary = buildEngagementSummary([
      makeActivityDay("a", "2026-06-02"),
      makeActivityDay("a", "2026-06-02"), // duplicate row, same day
      makeActivityDay("a", "2026-06-03"),
      makeActivityDay("b", "2026-06-02"),
    ]);
    expect(summary.dau).toEqual([
      { day: "2026-06-02", count: 2 },
      { day: "2026-06-03", count: 1 },
    ]);
    // 2026-06-01 is the Monday of that week.
    expect(summary.wau).toEqual([{ week: "2026-06-01", count: 2 }]);
    expect(summary.mau).toEqual([{ month: "2026-06-01", count: 2 }]);
  });

  it("returns null stickiness with fewer than two weekly buckets", () => {
    const summary = buildEngagementSummary([
      makeActivityDay("a", "2026-06-02"),
      makeActivityDay("b", "2026-06-03"),
    ]);
    expect(summary.stickiness).toBeNull();
  });

  it("computes stickiness as the last full week over the trailing 28 days", () => {
    // Weeks starting Monday 2026-05-18, 2026-06-01, 2026-06-08. The last full
    // week is 06-01 ({a, b}); its trailing 28-day window [05-11, 06-08) also
    // contains e (05-20) but NOT c/d (06-09+). A calendar-month denominator
    // would wrongly include c and d (partial-month bias).
    const summary = buildEngagementSummary([
      makeActivityDay("e", "2026-05-20"),
      makeActivityDay("a", "2026-06-02"),
      makeActivityDay("b", "2026-06-03"),
      makeActivityDay("c", "2026-06-09"),
      makeActivityDay("d", "2026-06-10"),
    ]);
    expect(summary.stickiness).toBe(67); // 2 of 3, rounded
  });

  it("sorts activeDaysPerArtist by distinct days, descending", () => {
    const summary = buildEngagementSummary([
      makeActivityDay("light", "2026-06-02"),
      makeActivityDay("heavy", "2026-06-02"),
      makeActivityDay("heavy", "2026-06-02"), // duplicate day counts once
      makeActivityDay("heavy", "2026-06-03"),
      makeActivityDay("heavy", "2026-06-04"),
    ]);
    expect(summary.activeDaysPerArtist).toEqual([
      { artistId: "heavy", days: 3 },
      { artistId: "light", days: 1 },
    ]);
  });

  it("handles empty input", () => {
    const summary = buildEngagementSummary([]);
    expect(summary.dau).toEqual([]);
    expect(summary.wau).toEqual([]);
    expect(summary.mau).toEqual([]);
    expect(summary.stickiness).toBeNull();
    expect(summary.activeDaysPerArtist).toEqual([]);
  });
});
