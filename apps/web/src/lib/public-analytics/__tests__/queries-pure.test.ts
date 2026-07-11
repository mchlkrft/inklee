// Pure helpers of the public-analytics query layer: GSC page-URL
// normalization and the GSC source-date window derivation. queries.ts is
// server-only (aliased to a no-op in vitest.config.ts); the service client
// and the growth-queries context loader are mocked so importing the module
// never touches supabase or Next request APIs. Only pure exports are called.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({ serviceClient: {} }));
vi.mock("@/lib/growth-queries", () => ({ getGrowthContext: vi.fn() }));

import { gscPageToPath, gscWindowFor } from "../queries";

describe("gscPageToPath", () => {
  it("normalizes a full URL to its path", () => {
    expect(gscPageToPath("https://inklee.app/guides/tattoo-deposits")).toBe(
      "/guides/tattoo-deposits",
    );
  });

  it("trims a trailing slash", () => {
    expect(gscPageToPath("https://inklee.app/guides/tattoo-deposits/")).toBe(
      "/guides/tattoo-deposits",
    );
  });

  it("collapses repeated slashes", () => {
    expect(gscPageToPath("https://inklee.app//guides///deposits/")).toBe(
      "/guides/deposits",
    );
  });

  it("keeps the root path as /", () => {
    expect(gscPageToPath("https://inklee.app/")).toBe("/");
    expect(gscPageToPath("https://inklee.app")).toBe("/");
  });

  it("drops query strings and fragments", () => {
    expect(gscPageToPath("https://inklee.app/map?utm_source=x#top")).toBe(
      "/map",
    );
  });

  it("returns null for an invalid URL", () => {
    expect(gscPageToPath("not-a-url")).toBeNull();
    expect(gscPageToPath("/relative/path")).toBeNull();
    expect(gscPageToPath("")).toBeNull();
  });
});

describe("gscWindowFor", () => {
  type Context = Parameters<typeof gscWindowFor>[0];

  // Minimal fake context: gscWindowFor only reads the reporting timezone and
  // the range boundaries. range.to is exclusive (start of the next day),
  // matching resolveGrowthRange.
  function contextFor(fromIso: string, toExclusiveIso: string): Context {
    return {
      settings: { reporting_timezone: "UTC" },
      range: { from: new Date(fromIso), to: new Date(toExclusiveIso) },
    } as unknown as Context;
  }

  it("returns null when no GSC data has been synced yet", () => {
    const context = contextFor("2026-07-01T00:00:00Z", "2026-07-08T00:00:00Z");
    expect(gscWindowFor(context, null)).toBeNull();
  });

  it("clamps toDay to the latest synced source date", () => {
    const context = contextFor("2026-07-01T00:00:00Z", "2026-07-08T00:00:00Z");
    expect(gscWindowFor(context, "2026-07-05")).toEqual({
      fromDay: "2026-07-01",
      toDay: "2026-07-05",
      previousFromDay: "2026-06-26",
      previousToDay: "2026-06-30",
    });
  });

  it("uses the range end when the latest source date is newer", () => {
    const context = contextFor("2026-07-01T00:00:00Z", "2026-07-08T00:00:00Z");
    expect(gscWindowFor(context, "2026-07-20")).toEqual({
      fromDay: "2026-07-01",
      toDay: "2026-07-07",
      previousFromDay: "2026-06-24",
      previousToDay: "2026-06-30",
    });
  });

  it("returns null when the clamp empties the window (fromDay > toDay)", () => {
    const context = contextFor("2026-07-06T00:00:00Z", "2026-07-10T00:00:00Z");
    expect(gscWindowFor(context, "2026-07-01")).toBeNull();
  });

  it("builds an adjacent, equal-length previous window", () => {
    const context = contextFor("2026-07-01T00:00:00Z", "2026-07-08T00:00:00Z");
    const window = gscWindowFor(context, "2026-07-05");
    expect(window).not.toBeNull();
    if (!window) return;

    const day = 86_400_000;
    const spanDays =
      (new Date(`${window.toDay}T00:00:00Z`).getTime() -
        new Date(`${window.fromDay}T00:00:00Z`).getTime()) /
        day +
      1;
    const previousSpanDays =
      (new Date(`${window.previousToDay}T00:00:00Z`).getTime() -
        new Date(`${window.previousFromDay}T00:00:00Z`).getTime()) /
        day +
      1;
    expect(previousSpanDays).toBe(spanDays);
    // Adjacent: the previous window ends the day before the current starts.
    expect(
      new Date(`${window.fromDay}T00:00:00Z`).getTime() -
        new Date(`${window.previousToDay}T00:00:00Z`).getTime(),
    ).toBe(day);
  });

  it("handles a single-day window", () => {
    const context = contextFor("2026-07-01T00:00:00Z", "2026-07-02T00:00:00Z");
    expect(gscWindowFor(context, "2026-07-05")).toEqual({
      fromDay: "2026-07-01",
      toDay: "2026-07-01",
      previousFromDay: "2026-06-30",
      previousToDay: "2026-06-30",
    });
  });
});
