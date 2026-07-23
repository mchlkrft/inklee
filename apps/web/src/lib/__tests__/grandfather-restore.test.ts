import { describe, it, expect } from "vitest";
import { restoreGrandfatherPackage } from "@/lib/entitlements";

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
