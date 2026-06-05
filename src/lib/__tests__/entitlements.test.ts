import { describe, it, expect } from "vitest";
import {
  canAccess,
  effectivePlanTier,
  isFeeSponsorshipActive,
  sponsorshipRemainingCents,
  DEFAULT_OVERRIDES,
  type AccountOverrides,
} from "../entitlements";

const base = (o: Partial<AccountOverrides> = {}): AccountOverrides => ({
  ...DEFAULT_OVERRIDES,
  ...o,
});

const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

describe("entitlements", () => {
  it("free plan grants no gated features by default", () => {
    expect(canAccess(base(), "deposits")).toBe(false);
    expect(effectivePlanTier(base())).toBe("free");
  });

  it("active plus plan grants deposits", () => {
    const o = base({ planTier: "plus" });
    expect(effectivePlanTier(o)).toBe("plus");
    expect(canAccess(o, "deposits")).toBe(true);
  });

  it("an expired plus comp falls back to free", () => {
    const o = base({ planTier: "plus", planExpiresAt: past });
    expect(effectivePlanTier(o)).toBe("free");
    expect(canAccess(o, "deposits")).toBe(false);
  });

  it("a non-expired plus comp still grants", () => {
    const o = base({ planTier: "plus", planExpiresAt: future });
    expect(canAccess(o, "deposits")).toBe(true);
  });

  it("an explicit per-feature override beats the plan baseline", () => {
    // granted on a free plan
    expect(
      canAccess(base({ entitlementOverrides: { deposits: true } }), "deposits"),
    ).toBe(true);
    // revoked on a plus plan
    expect(
      canAccess(
        base({ planTier: "plus", entitlementOverrides: { deposits: false } }),
        "deposits",
      ),
    ).toBe(false);
  });

  it("fee sponsorship respects on/off, expiry, and the spend cap", () => {
    expect(isFeeSponsorshipActive(base({ feeSponsored: false }))).toBe(false);
    expect(isFeeSponsorshipActive(base({ feeSponsored: true }))).toBe(true);
    expect(
      isFeeSponsorshipActive(
        base({ feeSponsored: true, feeSponsorExpiresAt: past }),
      ),
    ).toBe(false);
    // used >= cap → inactive
    expect(
      isFeeSponsorshipActive(
        base({
          feeSponsored: true,
          feeSponsorCapCents: 1000,
          feeSponsoredUsedCents: 1000,
        }),
      ),
    ).toBe(false);
    // under cap → active
    expect(
      isFeeSponsorshipActive(
        base({
          feeSponsored: true,
          feeSponsorCapCents: 1000,
          feeSponsoredUsedCents: 400,
        }),
      ),
    ).toBe(true);
  });

  it("sponsorshipRemainingCents is null when uncapped, clamped at 0", () => {
    expect(sponsorshipRemainingCents(base({ feeSponsored: true }))).toBeNull();
    expect(
      sponsorshipRemainingCents(
        base({ feeSponsorCapCents: 1000, feeSponsoredUsedCents: 700 }),
      ),
    ).toBe(300);
    expect(
      sponsorshipRemainingCents(
        base({ feeSponsorCapCents: 1000, feeSponsoredUsedCents: 1500 }),
      ),
    ).toBe(0);
  });
});
