import { describe, it, expect } from "vitest";
import {
  normalizeStudioInput,
  normalizeTripInput,
  normalizeTripLegInput,
} from "../mobile-travel";

describe("normalizeTripInput", () => {
  it("accepts a valid trip and defaults showOnBookingForm to true", () => {
    const r = normalizeTripInput({ title: "  Berlin spring  " });
    expect(r).toEqual({
      ok: true,
      value: {
        title: "Berlin spring",
        description: null,
        showOnBookingForm: true,
      },
    });
  });

  it("honors an explicit showOnBookingForm:false and trims description", () => {
    const r = normalizeTripInput({
      title: "Trip",
      description: "  guest spot  ",
      showOnBookingForm: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.description).toBe("guest spot");
      expect(r.value.showOnBookingForm).toBe(false);
    }
  });

  it("rejects a missing title and a non-boolean visibility flag", () => {
    expect(normalizeTripInput({ title: " " }).ok).toBe(false);
    expect(
      normalizeTripInput({ title: "Trip", showOnBookingForm: "yes" }).ok,
    ).toBe(false);
  });
});

describe("normalizeStudioInput", () => {
  it("accepts a valid studio and defaults visibility to hidden", () => {
    const r = normalizeStudioInput({ name: "Old Town Tattoo", city: "Berlin" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("Old Town Tattoo");
      expect(r.value.visibility_mode).toBe("hidden");
      expect(r.value.is_primary).toBe(false);
    }
  });

  it("rejects a missing name and a bad visibility mode", () => {
    expect(normalizeStudioInput({ name: "" }).ok).toBe(false);
    expect(
      normalizeStudioInput({ name: "X", visibility_mode: "everywhere" }).ok,
    ).toBe(false);
  });
});

describe("normalizeTripLegInput", () => {
  it("accepts a valid date range and normalizes optional fields", () => {
    const r = normalizeTripLegInput({
      startsOn: "2026-08-01",
      endsOn: "2026-08-05",
      studioId: "  ",
      notes: "  walk-ins ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.studioId).toBeNull();
      expect(r.value.notes).toBe("walk-ins");
    }
  });

  it("rejects a malformed date and a start after the end", () => {
    expect(
      normalizeTripLegInput({ startsOn: "08/01/2026", endsOn: "2026-08-05" })
        .ok,
    ).toBe(false);
    expect(
      normalizeTripLegInput({ startsOn: "2026-08-10", endsOn: "2026-08-05" })
        .ok,
    ).toBe(false);
  });
});
