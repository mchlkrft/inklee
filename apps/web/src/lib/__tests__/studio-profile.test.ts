import { describe, expect, it } from "vitest";
import {
  ADDRESS_VISIBILITY_MODES,
  GUEST_SPOT_STATUSES,
  MIN_STUDIO_CATEGORIES,
  MIN_STUDIO_PHOTOS,
  STUDIO_STANDARD_CATEGORIES,
  computeStudioCompleteness,
  validateCustomCategory,
  validateStudioProfileInput,
  type StudioProfileInput,
  type StudioSnapshot,
} from "@inklee/shared/studio-profile";

const validInput: StudioProfileInput = {
  name: "Black Needle Studio",
  description: "A calm private studio.",
  vibe: "Quiet, focused, good coffee.",
  address: "Torstrasse 12",
  city: "Berlin",
  country: "Germany",
  postalCode: "10119",
  addressVisibility: "exact",
  guestSpotStatus: "accepting",
};

describe("validateStudioProfileInput", () => {
  it("accepts a valid profile", () => {
    expect(validateStudioProfileInput(validInput)).toBeNull();
  });

  it("requires a name and bounds lengths", () => {
    expect(validateStudioProfileInput({ ...validInput, name: "  " })).toMatch(
      /name is required/i,
    );
    expect(
      validateStudioProfileInput({ ...validInput, name: "x".repeat(121) }),
    ).toMatch(/at most/);
    expect(
      validateStudioProfileInput({
        ...validInput,
        description: "x".repeat(2001),
      }),
    ).toMatch(/Description/);
  });

  it("rejects bad visibility and guest spot status", () => {
    expect(
      validateStudioProfileInput({ ...validInput, addressVisibility: "gps" }),
    ).toMatch(/visibility/);
    expect(
      validateStudioProfileInput({ ...validInput, guestSpotStatus: "maybe" }),
    ).toMatch(/guest spot status/);
  });

  it("vocabularies match the 0078 CHECK lists", () => {
    expect(ADDRESS_VISIBILITY_MODES).toEqual(["exact", "approximate"]);
    expect(GUEST_SPOT_STATUSES).toEqual([
      "not_accepting",
      "accepting",
      "invitation_only",
    ]);
    expect(STUDIO_STANDARD_CATEGORIES).toContain("private_studio");
    expect(STUDIO_STANDARD_CATEGORIES).not.toContain("blackwork");
  });
});

describe("validateCustomCategory", () => {
  it("requires a name and bounds length", () => {
    expect(validateCustomCategory("  ")).toMatch(/needs a name/);
    expect(validateCustomCategory("x".repeat(41))).toMatch(/at most/);
    expect(validateCustomCategory("Left-handed friendly")).toBeNull();
  });
});

describe("computeStudioCompleteness", () => {
  const full: StudioSnapshot = {
    hasLogo: true,
    photoCount: MIN_STUDIO_PHOTOS,
    hasDescription: true,
    hasAddress: true,
    categoryCount: MIN_STUDIO_CATEGORIES,
    hasVibe: true,
  };

  it("a fully complete studio scores 100 and is publish-ready", () => {
    const result = computeStudioCompleteness(full);
    expect(result.score).toBe(100);
    expect(result.publishReady).toBe(true);
    expect(result.publishBlockers).toEqual([]);
  });

  it("missing required items block publishing but vibe does not", () => {
    const noVibe = computeStudioCompleteness({ ...full, hasVibe: false });
    expect(noVibe.publishReady).toBe(true);
    expect(noVibe.score).toBeLessThan(100);

    const noLogo = computeStudioCompleteness({ ...full, hasLogo: false });
    expect(noLogo.publishReady).toBe(false);
    expect(noLogo.publishBlockers.join(" ")).toMatch(/Logo/);
  });

  it("counts below the photo and category minimums block publishing", () => {
    const thin = computeStudioCompleteness({
      ...full,
      photoCount: MIN_STUDIO_PHOTOS - 1,
      categoryCount: MIN_STUDIO_CATEGORIES - 1,
    });
    expect(thin.publishReady).toBe(false);
    expect(thin.publishBlockers).toHaveLength(2);
  });

  it("an empty studio scores 0 and blocks on every required item", () => {
    const empty = computeStudioCompleteness({
      hasLogo: false,
      photoCount: 0,
      hasDescription: false,
      hasAddress: false,
      categoryCount: 0,
      hasVibe: false,
    });
    expect(empty.score).toBe(0);
    expect(empty.publishBlockers).toHaveLength(5);
  });
});
