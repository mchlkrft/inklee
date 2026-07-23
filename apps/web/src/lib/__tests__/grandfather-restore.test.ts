import { describe, it, expect } from "vitest";
import {
  restoreGrandfatherPackage,
  computeLegacyFreeV1Grant,
  LEGACY_FREE_V1,
} from "@/lib/entitlements";

describe("restoreGrandfatherPackage", () => {
  it("returns null for a non-grandfathered account (plain Free downgrade)", () => {
    expect(
      restoreGrandfatherPackage({ policyId: null, grantPackage: null }),
    ).toBeNull();
  });

  it("restores plan_source + the package on downgrade", () => {
    const r = restoreGrandfatherPackage({
      policyId: "legacy_free_v1",
      grantPackage: {
        features: { custom_templates: true },
        limits: { custom_fields: 12, active_trips: 3 },
      },
    });
    expect(r).not.toBeNull();
    expect(r!.planSource).toBe("grandfathered");
    expect(r!.entitlementOverrides).toEqual({ custom_templates: true });
    expect(r!.limitOverrides).toEqual({ custom_fields: 12, active_trips: 3 });
  });

  it("grandfathered with an empty/absent package restores to grandfathered + empty overrides", () => {
    const r = restoreGrandfatherPackage({
      policyId: "legacy_free_v1",
      grantPackage: null,
    });
    expect(r!.planSource).toBe("grandfathered");
    expect(r!.entitlementOverrides).toEqual({});
    expect(r!.limitOverrides).toEqual({});
  });

  it("merges live admin overrides over the package (admin decisions win)", () => {
    const r = restoreGrandfatherPackage({
      policyId: "legacy_free_v1",
      grantPackage: {
        features: { custom_templates: true },
        limits: { custom_fields: 5 },
      },
      // admin added deposits, suppressed custom_templates, and raised the cap
      entitlementOverrides: { deposits: true, custom_templates: false },
      limitOverrides: { custom_fields: 12 },
    });
    expect(r!.entitlementOverrides).toEqual({
      custom_templates: false, // admin suppression preserved (live wins)
      deposits: true, // admin grant preserved
    });
    expect(r!.limitOverrides).toEqual({ custom_fields: 12 }); // admin cap wins
  });

  it("restores a package key genuinely cleared while on Plus", () => {
    const r = restoreGrandfatherPackage({
      policyId: "legacy_free_v1",
      grantPackage: { features: { custom_templates: true }, limits: {} },
      entitlementOverrides: {}, // custom_templates was cleared while on Plus
      limitOverrides: {},
    });
    expect(r!.entitlementOverrides).toEqual({ custom_templates: true });
  });

  it("does not mutate the source package (returns copies)", () => {
    const pkg = { features: { custom_templates: true }, limits: {} };
    const r = restoreGrandfatherPackage({ policyId: "p", grantPackage: pkg });
    r!.entitlementOverrides.branding = true;
    expect(pkg.features).toEqual({ custom_templates: true });
  });
});

describe("computeLegacyFreeV1Grant", () => {
  it("always preserves custom-template editing for the cohort", () => {
    const g = computeLegacyFreeV1Grant({});
    expect(g.features).toEqual({ custom_templates: true });
    expect(LEGACY_FREE_V1).toBe("legacy_free_v1");
  });

  it("adds no limit override when every count is within the Free cap", () => {
    const g = computeLegacyFreeV1Grant({
      custom_fields: 3,
      active_trips: 2,
      studio_library: 5,
    });
    expect(g.limits).toEqual({});
  });

  it("preserves only the counts that EXCEED the Free cap", () => {
    const g = computeLegacyFreeV1Grant({
      custom_fields: 7, // > 3
      active_trips: 1, // <= 3
      studio_library: 9, // > 5
    });
    expect(g.limits).toEqual({ custom_fields: 7, studio_library: 9 });
  });

  it("does not grant branding or analytics", () => {
    const g = computeLegacyFreeV1Grant({ custom_fields: 99 });
    expect(g.features).toEqual({ custom_templates: true });
    expect(g.features?.branding).toBeUndefined();
  });
});
