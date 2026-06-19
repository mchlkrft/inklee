import { describe, it, expect } from "vitest";
import {
  validateTripMeta,
  rangesOverlap,
  legIsActive,
  TRIP_TITLE_MAX,
  TRIP_DESCRIPTION_MAX,
} from "@inklee/shared/trip-validation";

describe("validateTripMeta", () => {
  it("trims and accepts a valid trip", () => {
    expect(
      validateTripMeta({ title: "  Berlin  ", description: " guest spot " }),
    ).toEqual({
      ok: true,
      value: { title: "Berlin", description: "guest spot" },
    });
  });

  it("requires a title and caps title + description", () => {
    expect(validateTripMeta({ title: "  " })).toEqual({
      ok: false,
      error: "Title is required.",
    });
    expect(validateTripMeta({ title: "x".repeat(TRIP_TITLE_MAX + 1) }).ok).toBe(
      false,
    );
    expect(
      validateTripMeta({
        title: "x",
        description: "d".repeat(TRIP_DESCRIPTION_MAX + 1),
      }).ok,
    ).toBe(false);
  });

  it("collapses an empty description to null", () => {
    const r = validateTripMeta({ title: "x", description: "   " });
    expect(r.ok && r.value.description).toBe(null);
  });
});

describe("rangesOverlap", () => {
  it("detects overlapping date-key ranges", () => {
    expect(
      rangesOverlap([
        { startsOn: "2026-08-01", endsOn: "2026-08-05" },
        { startsOn: "2026-08-04", endsOn: "2026-08-09" },
      ]),
    ).toBe(true);
  });
  it("returns false for disjoint ranges", () => {
    expect(
      rangesOverlap([
        { startsOn: "2026-08-01", endsOn: "2026-08-05" },
        { startsOn: "2026-08-06", endsOn: "2026-08-09" },
      ]),
    ).toBe(false);
  });
});

describe("legIsActive", () => {
  it("is true only when today falls within the range (inclusive)", () => {
    expect(legIsActive("2026-08-01", "2026-08-05", "2026-08-03")).toBe(true);
    expect(legIsActive("2026-08-01", "2026-08-05", "2026-08-01")).toBe(true);
    expect(legIsActive("2026-08-01", "2026-08-05", "2026-08-05")).toBe(true);
    expect(legIsActive("2026-08-01", "2026-08-05", "2026-07-31")).toBe(false);
    expect(legIsActive("2026-08-01", "2026-08-05", "2026-08-06")).toBe(false);
  });
});
