import { describe, it, expect } from "vitest";
import {
  countDatesInRange,
  countPatternSlots,
  expandPatternDates,
  validateSlotPattern,
  WEEKDAY_LABELS,
} from "@inklee/shared/slot-pattern";

const WINDOW = { start: "10:00", end: "11:00" };

describe("validateSlotPattern", () => {
  it("accepts a dates-mode pattern", () => {
    const r = validateSlotPattern({
      windows: [WINDOW],
      applyMode: "dates",
      dates: ["2026-07-01", "2026-07-02"],
    });
    expect(r).toEqual({
      ok: true,
      value: {
        windows: [WINDOW],
        applyMode: "dates",
        dates: ["2026-07-01", "2026-07-02"],
      },
    });
  });

  it("accepts a weekdays-mode pattern", () => {
    const r = validateSlotPattern({
      windows: [WINDOW, { start: "13:30", end: "15:00" }],
      applyMode: "weekdays",
      weekdays: [0, 4],
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects missing/empty windows", () => {
    expect(
      validateSlotPattern({ applyMode: "dates", dates: ["2026-07-01"] }),
    ).toEqual({ ok: false, error: "At least one time window is required." });
    expect(
      validateSlotPattern({
        windows: [],
        applyMode: "dates",
        dates: ["2026-07-01"],
      }),
    ).toEqual({ ok: false, error: "At least one time window is required." });
  });

  it("rejects a window whose end is not after its start", () => {
    for (const w of [
      { start: "10:00", end: "10:00" },
      { start: "12:00", end: "09:00" },
    ]) {
      expect(
        validateSlotPattern({
          windows: [w],
          applyMode: "dates",
          dates: ["2026-07-01"],
        }),
      ).toEqual({
        ok: false,
        error: "Each window must have a start time before its end time.",
      });
    }
  });

  it("rejects regex-valid but out-of-range times and impossible dates", () => {
    for (const w of [
      { start: "25:00", end: "26:00" },
      { start: "10:00", end: "23:60" },
    ]) {
      expect(
        validateSlotPattern({
          windows: [w],
          applyMode: "dates",
          dates: ["2026-07-01"],
        }),
      ).toEqual({ ok: false, error: "Invalid window data." });
    }
    // Month out of range and a calendar rollover (Feb 30 -> Mar 2 in Date).
    for (const bad of ["2026-13-01", "2026-02-30"]) {
      expect(
        validateSlotPattern({
          windows: [WINDOW],
          applyMode: "dates",
          dates: [bad],
        }),
      ).toEqual({ ok: false, error: "Invalid date data." });
      expect(
        validateSlotPattern({
          windows: [WINDOW],
          applyMode: "weekdays",
          weekdays: [0],
          fromDate: bad,
          toDate: "2026-07-31",
        }),
      ).toEqual({ ok: false, error: "Date range is required." });
    }
  });

  it("rejects malformed times, dates, weekdays and apply modes", () => {
    expect(
      validateSlotPattern({
        windows: [{ start: "10am", end: "11:00" }],
        applyMode: "dates",
        dates: ["2026-07-01"],
      }),
    ).toEqual({ ok: false, error: "Invalid window data." });
    expect(
      validateSlotPattern({
        windows: [WINDOW],
        applyMode: "dates",
        dates: ["July 1"],
      }),
    ).toEqual({ ok: false, error: "Invalid date data." });
    expect(
      validateSlotPattern({
        windows: [WINDOW],
        applyMode: "dates",
        dates: [],
      }),
    ).toEqual({ ok: false, error: "Add at least one date." });
    expect(
      validateSlotPattern({
        windows: [WINDOW],
        applyMode: "weekdays",
        weekdays: [7],
        fromDate: "2026-07-01",
        toDate: "2026-07-31",
      }),
    ).toEqual({ ok: false, error: "Invalid weekday data." });
    expect(
      validateSlotPattern({
        windows: [WINDOW],
        applyMode: "weekdays",
        weekdays: [0],
        fromDate: "2026-07-01",
      }),
    ).toEqual({ ok: false, error: "Date range is required." });
    expect(
      validateSlotPattern({ windows: [WINDOW], applyMode: "single" }),
    ).toEqual({ ok: false, error: "Invalid apply mode." });
  });
});

describe("expandPatternDates", () => {
  it("expands weekdays Monday-first across an inclusive range", () => {
    // 2026-07-01 is a Wednesday. Mondays (index 0) in July 2026: 6, 13, 20, 27.
    const dates = expandPatternDates({
      windows: [WINDOW],
      applyMode: "weekdays",
      weekdays: [0],
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
    });
    expect(dates).toEqual([
      "2026-07-06",
      "2026-07-13",
      "2026-07-20",
      "2026-07-27",
    ]);
  });

  it("includes range endpoints and handles month boundaries", () => {
    // 2026-08-31 is a Monday; 2026-09-01 a Tuesday.
    const dates = expandPatternDates({
      windows: [WINDOW],
      applyMode: "weekdays",
      weekdays: [0, 1],
      fromDate: "2026-08-31",
      toDate: "2026-09-01",
    });
    expect(dates).toEqual(["2026-08-31", "2026-09-01"]);
  });

  it("returns dates verbatim in dates mode", () => {
    expect(
      expandPatternDates({
        windows: [],
        applyMode: "dates",
        dates: ["2026-07-02", "2026-07-01"],
      }),
    ).toEqual(["2026-07-02", "2026-07-01"]);
  });
});

describe("preview counts match the expansion", () => {
  it("countDatesInRange equals expandPatternDates length", () => {
    expect(countDatesInRange("2026-07-01", "2026-07-31", [0, 5, 6])).toBe(
      expandPatternDates({
        windows: [],
        applyMode: "weekdays",
        weekdays: [0, 5, 6],
        fromDate: "2026-07-01",
        toDate: "2026-07-31",
      }).length,
    );
    expect(countDatesInRange("2026-07-31", "2026-07-01", [0])).toBe(0);
    expect(countDatesInRange("2026-07-01", "2026-07-31", [])).toBe(0);
  });

  it("countPatternSlots = windows x dates", () => {
    expect(
      countPatternSlots({
        windows: [WINDOW, { start: "13:00", end: "14:00" }],
        applyMode: "dates",
        dates: ["2026-07-01", "2026-07-02", "2026-07-03"],
      }),
    ).toBe(6);
  });
});

describe("WEEKDAY_LABELS", () => {
  it("is Monday-first with 7 entries", () => {
    expect(WEEKDAY_LABELS).toHaveLength(7);
    expect(WEEKDAY_LABELS[0]).toBe("Mo");
    expect(WEEKDAY_LABELS[6]).toBe("Su");
  });
});
