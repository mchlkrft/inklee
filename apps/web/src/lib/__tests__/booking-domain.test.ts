import { describe, it, expect } from "vitest";
import {
  isBookingMode,
  normalizeBookingMode,
  BOOKING_MODES,
} from "@inklee/shared/booking-domain";

describe("isBookingMode (strict write-path validator)", () => {
  it("accepts exactly the two modes", () => {
    expect(isBookingMode("preferred_date")).toBe(true);
    expect(isBookingMode("fixed_slots")).toBe(true);
    expect(BOOKING_MODES).toEqual(["preferred_date", "fixed_slots"]);
  });

  it("rejects anything else (no coercion)", () => {
    expect(isBookingMode("slots")).toBe(false);
    expect(isBookingMode("walk_in")).toBe(false);
    expect(isBookingMode("")).toBe(false);
    expect(isBookingMode(null)).toBe(false);
    expect(isBookingMode(undefined)).toBe(false);
    expect(isBookingMode(1)).toBe(false);
  });
});

describe("normalizeBookingMode (coercing read/display helper, unchanged)", () => {
  it("coerces any non-fixed_slots value to preferred_date", () => {
    expect(normalizeBookingMode("fixed_slots")).toBe("fixed_slots");
    expect(normalizeBookingMode("anything")).toBe("preferred_date");
    expect(normalizeBookingMode(null)).toBe("preferred_date");
  });
});
