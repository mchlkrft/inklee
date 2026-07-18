import { describe, expect, it } from "vitest";
import {
  ADDRESS_VISIBILITY_MODES,
  CLAIMANT_ROLES,
  CLAIMANT_ROLE_LABELS,
  GUEST_SPOT_STATUSES,
  MAX_STUDIO_PHOTOS,
  MIN_STUDIO_CATEGORIES,
  MIN_STUDIO_PHOTOS,
  STUDIO_STANDARD_CATEGORIES,
  HOUSE_RULE_CONTENT_MAX,
  HOUSE_RULE_KEYS,
  HOUSE_RULE_LABELS,
  WELCOME_PACK_FIELDS,
  WELCOME_PACK_FIELD_LABELS,
  WELCOME_PACK_FIELD_MAX,
  approximateDisplayPosition,
  isOwnedWelcomePackFilePath,
  validateWelcomePackInput,
  welcomePackFileStoragePath,
  computeStudioCompleteness,
  isOwnedStudioMediaPath,
  sortHouseRules,
  studioLogoStoragePath,
  studioPhotoStoragePath,
  validateCustomCategory,
  validateHouseRules,
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

  it("claimant roles pin the 0075 CHECK values with labels for each", () => {
    expect(CLAIMANT_ROLES).toEqual([
      "artist",
      "receptionist",
      "manager",
      "business_owner",
    ]);
    for (const role of CLAIMANT_ROLES) {
      expect(CLAIMANT_ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });
});

describe("validateCustomCategory", () => {
  it("requires a name and bounds length", () => {
    expect(validateCustomCategory("  ")).toMatch(/needs a name/);
    expect(validateCustomCategory("x".repeat(41))).toMatch(/at most/);
    expect(validateCustomCategory("Left-handed friendly")).toBeNull();
  });
});

describe("studio media paths", () => {
  const studioId = "88888888-0000-0000-0000-000000000001";

  it("builds the expected paths", () => {
    expect(studioLogoStoragePath(studioId)).toBe(`${studioId}/logo.webp`);
    expect(studioPhotoStoragePath(studioId, "abc")).toBe(
      `${studioId}/photos/abc.webp`,
    );
  });

  it("the ownership guard accepts only the studio's own well-formed paths", () => {
    expect(isOwnedStudioMediaPath(studioId, `${studioId}/logo.webp`)).toBe(
      true,
    );
    expect(
      isOwnedStudioMediaPath(studioId, `${studioId}/photos/abc.webp`),
    ).toBe(true);
  });

  it("the ownership guard rejects traversal, foreign, and malformed paths", () => {
    expect(isOwnedStudioMediaPath(studioId, "other-studio/logo.webp")).toBe(
      false,
    );
    expect(
      isOwnedStudioMediaPath(studioId, `${studioId}/photos/../../x.webp`),
    ).toBe(false);
    expect(
      isOwnedStudioMediaPath(studioId, `${studioId}/photos/a/b.webp`),
    ).toBe(false);
    expect(isOwnedStudioMediaPath(studioId, `${studioId}/photos/`)).toBe(false);
    expect(isOwnedStudioMediaPath(studioId, `${studioId}/photos/evil`)).toBe(
      false,
    );
    expect(isOwnedStudioMediaPath(studioId, `${studioId}/photos/.webp`)).toBe(
      false,
    );
    expect(isOwnedStudioMediaPath(studioId, `${studioId}\\photos\\a`)).toBe(
      false,
    );
    expect(isOwnedStudioMediaPath(studioId, "")).toBe(false);
    expect(isOwnedStudioMediaPath("", `${studioId}/logo.webp`)).toBe(false);
  });

  it("the photo cap sits above the publish minimum", () => {
    expect(MAX_STUDIO_PHOTOS).toBeGreaterThan(MIN_STUDIO_PHOTOS);
  });
});

describe("house rules", () => {
  it("every key has a label", () => {
    for (const key of HOUSE_RULE_KEYS) {
      expect(HOUSE_RULE_LABELS[key]).toBeTruthy();
    }
  });

  it("accepts a valid rule set and an empty set", () => {
    expect(validateHouseRules([])).toBeNull();
    expect(
      validateHouseRules([
        { key: "deposit_policy", content: "50 percent up front." },
        { key: "cleaning", content: "Leave the station as you found it." },
      ]),
    ).toBeNull();
  });

  it("rejects unknown keys, duplicates, empty and oversized content", () => {
    expect(validateHouseRules([{ key: "made_up", content: "x" }])).toMatch(
      /list/,
    );
    expect(
      validateHouseRules([
        { key: "cleaning", content: "a" },
        { key: "cleaning", content: "b" },
      ]),
    ).toMatch(/once/);
    expect(validateHouseRules([{ key: "cleaning", content: "   " }])).toMatch(
      /remove/,
    );
    expect(
      validateHouseRules([
        { key: "cleaning", content: "a".repeat(HOUSE_RULE_CONTENT_MAX + 1) },
      ]),
    ).toMatch(/under/);
  });

  it("sorts rules into vocabulary order", () => {
    const sorted = sortHouseRules([
      { key: "walk_in_policy" },
      { key: "deposit_policy" },
      { key: "opening_hours" },
    ]);
    expect(sorted.map((r) => r.key)).toEqual([
      "deposit_policy",
      "opening_hours",
      "walk_in_policy",
    ]);
  });
});

describe("approximateDisplayPosition", () => {
  it("is deterministic and offsets 250 to 450 meters", () => {
    const a = approximateDisplayPosition("seed-1", 52.52, 13.405);
    const b = approximateDisplayPosition("seed-1", 52.52, 13.405);
    expect(a).toEqual(b);
    const latMeters = Math.abs(a.latitude - 52.52) * 111320;
    const lngMeters =
      Math.abs(a.longitude - 13.405) *
      111320 *
      Math.cos((52.52 * Math.PI) / 180);
    const distance = Math.hypot(latMeters, lngMeters);
    expect(distance).toBeGreaterThanOrEqual(240);
    expect(distance).toBeLessThanOrEqual(460);
  });

  it("different seeds land differently", () => {
    const a = approximateDisplayPosition("seed-1", 52.52, 13.405);
    const c = approximateDisplayPosition("seed-2", 52.52, 13.405);
    expect(a).not.toEqual(c);
  });
});

describe("welcome pack file paths", () => {
  const studioId = "99999999-0000-0000-0000-000000000001";

  it("builds the expected path", () => {
    expect(welcomePackFileStoragePath(studioId, "abc", "pdf")).toBe(
      `${studioId}/abc.pdf`,
    );
  });

  it("the guard accepts only the studio's own well-formed paths", () => {
    expect(isOwnedWelcomePackFilePath(studioId, `${studioId}/abc.pdf`)).toBe(
      true,
    );
    expect(isOwnedWelcomePackFilePath(studioId, "other/abc.pdf")).toBe(false);
    expect(isOwnedWelcomePackFilePath(studioId, `${studioId}/../x.pdf`)).toBe(
      false,
    );
    expect(isOwnedWelcomePackFilePath(studioId, `${studioId}\\abc.pdf`)).toBe(
      false,
    );
    expect(isOwnedWelcomePackFilePath(studioId, `${studioId}/a/b.pdf`)).toBe(
      false,
    );
    expect(isOwnedWelcomePackFilePath(studioId, `${studioId}/noext`)).toBe(
      false,
    );
    expect(isOwnedWelcomePackFilePath(studioId, "")).toBe(false);
    expect(isOwnedWelcomePackFilePath("", `${studioId}/abc.pdf`)).toBe(false);
  });
});

describe("welcome pack", () => {
  it("every field has a label", () => {
    for (const field of WELCOME_PACK_FIELDS) {
      expect(WELCOME_PACK_FIELD_LABELS[field]).toBeTruthy();
    }
  });

  it("accepts empty, partial, and full packs", () => {
    expect(validateWelcomePackInput({ includeHouseRules: true })).toBeNull();
    expect(
      validateWelcomePackInput({
        includeHouseRules: false,
        wifi: "StudioNet / inkforever",
        access_details: null,
      }),
    ).toBeNull();
  });

  it("rejects oversized and non-string fields", () => {
    expect(
      validateWelcomePackInput({
        includeHouseRules: true,
        wifi: "a".repeat(WELCOME_PACK_FIELD_MAX + 1),
      }),
    ).toMatch(/under/);
    expect(
      validateWelcomePackInput({
        includeHouseRules: true,
        wifi: 42 as unknown as string,
      }),
    ).toMatch(/text/);
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
    houseRuleCount: 1,
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
    // Blockers are action-phrased ("Add a logo"), not done-state labels.
    expect(noLogo.publishBlockers).toContain("Add a logo");
    expect(noLogo.items.find((i) => i.key === "logo")?.label).toBe(
      "Logo added",
    );
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
      houseRuleCount: 0,
    });
    expect(empty.score).toBe(0);
    expect(empty.publishBlockers).toHaveLength(5);
  });
});
