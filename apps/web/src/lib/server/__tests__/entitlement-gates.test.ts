import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_OVERRIDES, type AccountOverrides } from "@/lib/entitlements";

// Control the dark-launch kill switch deterministically.
const disabled = vi.fn((_c: string) => false);
vi.mock("@/lib/server/app-config", () => ({
  isCapabilityDisabled: (c: string) => disabled(c),
}));

import {
  brandingRemoved,
  canEditTemplates,
  canSeeAdvancedAnalytics,
  capState,
} from "@/lib/server/entitlement-gates";

const withFeatures = (feats: Record<string, boolean>): AccountOverrides => ({
  ...DEFAULT_OVERRIDES,
  entitlementOverrides: feats,
});

beforeEach(() => {
  disabled.mockReset();
  disabled.mockReturnValue(false); // default: nothing paused => enforced
});

describe("brandingRemoved (grant shape)", () => {
  it("enforced + entitled => footer removed", () => {
    expect(brandingRemoved(withFeatures({ branding: true }))).toBe(true);
  });
  it("enforced + not entitled => footer stays", () => {
    expect(brandingRemoved(withFeatures({ branding: false }))).toBe(false);
  });
  it("paused => footer stays even for an entitled account (inert)", () => {
    disabled.mockReturnValue(true);
    expect(brandingRemoved(withFeatures({ branding: true }))).toBe(false);
  });
});

describe("canEditTemplates / canSeeAdvancedAnalytics (restriction shape)", () => {
  it("enforced + not entitled => blocked (cannot edit / no advanced)", () => {
    expect(canEditTemplates(withFeatures({ custom_templates: false }))).toBe(
      false,
    );
    expect(canSeeAdvancedAnalytics(withFeatures({ analytics: false }))).toBe(
      false,
    );
  });
  it("enforced + entitled => allowed", () => {
    expect(canEditTemplates(withFeatures({ custom_templates: true }))).toBe(
      true,
    );
    expect(canSeeAdvancedAnalytics(withFeatures({ analytics: true }))).toBe(
      true,
    );
  });
  it("paused => allowed for everyone (inert)", () => {
    disabled.mockReturnValue(true);
    expect(canEditTemplates(withFeatures({ custom_templates: false }))).toBe(
      true,
    );
    expect(canSeeAdvancedAnalytics(withFeatures({ analytics: false }))).toBe(
      true,
    );
  });
});

describe("capState (numeric cap, block-new)", () => {
  it("enforced + at the free cap => blocked", () => {
    const s = capState(DEFAULT_OVERRIDES, "custom_fields", 3); // free cap 3
    expect(s.blocked).toBe(true);
    expect(s.cap).toBe(3);
  });
  it("enforced + under the cap => not blocked", () => {
    expect(capState(DEFAULT_OVERRIDES, "custom_fields", 2).blocked).toBe(false);
  });
  it("paused => never blocked, even over the cap (inert)", () => {
    disabled.mockReturnValue(true);
    expect(capState(DEFAULT_OVERRIDES, "custom_fields", 99).blocked).toBe(
      false,
    );
  });
  it("a per-account unlimited override never blocks", () => {
    const unlimited: AccountOverrides = {
      ...DEFAULT_OVERRIDES,
      limitOverrides: { custom_fields: null },
    };
    expect(capState(unlimited, "custom_fields", 999).blocked).toBe(false);
    expect(capState(unlimited, "custom_fields", 999).cap).toBeNull();
  });
});
