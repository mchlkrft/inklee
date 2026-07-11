// Pure date helpers of the GSC sync engine. sync.ts imports "server-only"
// (aliased to a no-op in vitest.config.ts) and the service client (build-safe
// env placeholders), so importing the pure exports here is safe; no supabase
// call happens in these tests. Both helpers do plain UTC millisecond math, so
// the results are independent of the host timezone.
import { describe, expect, it } from "vitest";
import { dateRange, latestFinalizedDate } from "../sync";

describe("latestFinalizedDate", () => {
  it("returns now minus the 3-day finalization lag, date only", () => {
    expect(latestFinalizedDate(new Date("2026-07-10T12:34:56Z"))).toBe(
      "2026-07-07",
    );
  });

  it("returns a bare YYYY-MM-DD key with no time component", () => {
    expect(latestFinalizedDate(new Date("2026-07-10T00:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("crosses a month boundary correctly", () => {
    expect(latestFinalizedDate(new Date("2026-07-02T00:00:00Z"))).toBe(
      "2026-06-29",
    );
  });

  it("crosses a year boundary correctly", () => {
    expect(latestFinalizedDate(new Date("2026-01-01T23:59:59Z"))).toBe(
      "2025-12-29",
    );
  });
});

describe("dateRange", () => {
  it("returns n descending dates ending at the end date", () => {
    expect(dateRange("2026-07-10", 3)).toEqual([
      "2026-07-10",
      "2026-07-09",
      "2026-07-08",
    ]);
  });

  it("does not shift across a month boundary", () => {
    expect(dateRange("2026-07-02", 5)).toEqual([
      "2026-07-02",
      "2026-07-01",
      "2026-06-30",
      "2026-06-29",
      "2026-06-28",
    ]);
  });

  it("does not shift across a year boundary", () => {
    expect(dateRange("2026-01-01", 2)).toEqual(["2026-01-01", "2025-12-31"]);
  });

  it("returns just the end date for a single day", () => {
    expect(dateRange("2026-07-10", 1)).toEqual(["2026-07-10"]);
  });

  it("returns an empty list for zero days", () => {
    expect(dateRange("2026-07-10", 0)).toEqual([]);
  });
});
