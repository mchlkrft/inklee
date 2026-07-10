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

  it("keeps iconBg tri-state: absent = omitted, sent = sanitized", () => {
    const omitted = normalizeTripInput({ title: "Trip" });
    expect(omitted.ok).toBe(true);
    if (omitted.ok) {
      expect("iconBg" in omitted.value).toBe(false);
    }

    const set = normalizeTripInput({ title: "Trip", iconBg: "#E5E1D5" });
    expect(set.ok).toBe(true);
    if (set.ok) {
      // Case-insensitive palette match, lowercased on the way in.
      expect(set.value.iconBg).toBe("#e5e1d5");
    }

    const offPalette = normalizeTripInput({ title: "Trip", iconBg: "#123456" });
    expect(offPalette.ok).toBe(true);
    if (offPalette.ok) {
      // Off-palette degrades to null (default bone), never fails the save.
      expect(offPalette.value.iconBg).toBeNull();
    }
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

  // BUG-4 regression: the app posts the icon color as camelCase `iconColor`,
  // but the schema field is snake_case `icon_color`. Before the mapping fix,
  // z.object silently stripped `iconColor` and the chosen color never persisted.
  it("maps the app's camelCase iconColor onto the schema's icon_color", () => {
    const r = normalizeStudioInput({
      name: "Ink Lab",
      icon: "panther",
      iconColor: "#e9b22b",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.icon).toBe("panther");
      expect(r.value.icon_color).toBe("#e9b22b");
    }
  });

  it("leaves icon_color undefined when the client omits it (tri-state)", () => {
    const r = normalizeStudioInput({ name: "Ink Lab" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.icon_color).toBeUndefined();
    }
  });

  it("clears icon_color when the app explicitly sends iconColor: null", () => {
    const r = normalizeStudioInput({ name: "Ink Lab", iconColor: null });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.icon_color).toBeNull();
    }
  });

  it("maps the app's camelCase iconBg onto the schema's icon_bg (tri-state)", () => {
    const set = normalizeStudioInput({ name: "Ink Lab", iconBg: "#1e1e1e" });
    expect(set.ok).toBe(true);
    if (set.ok) {
      expect(set.value.icon_bg).toBe("#1e1e1e");
    }

    const omitted = normalizeStudioInput({ name: "Ink Lab" });
    expect(omitted.ok).toBe(true);
    if (omitted.ok) {
      expect(omitted.value.icon_bg).toBeUndefined();
    }

    const cleared = normalizeStudioInput({ name: "Ink Lab", iconBg: null });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.value.icon_bg).toBeNull();
    }
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
