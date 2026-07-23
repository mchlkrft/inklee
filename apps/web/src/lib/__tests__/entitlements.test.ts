import { describe, it, expect } from "vitest";
import {
  canAccess,
  canSponsorFeeCents,
  daysUntilPlanExpiry,
  effectivePlanTier,
  isFeeSponsorshipActive,
  isKnownPlanTier,
  limitFor,
  sponsorshipOverspentCents,
  sponsorshipRemainingCents,
  withinLimit,
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

// A waiver is all-or-nothing once the PaymentIntent exists, so the decision has
// to be made against the fee actually being waived. Gating on "the budget still
// has something in it" is what let a cap be overshot by a whole fee.
describe("canSponsorFeeCents", () => {
  const sponsored = (o: Partial<AccountOverrides> = {}) =>
    base({ feeSponsored: true, ...o });

  it("covers a fee that fits inside the remaining budget", () => {
    expect(
      canSponsorFeeCents(
        sponsored({ feeSponsorCapCents: 1000, feeSponsoredUsedCents: 400 }),
        600,
      ),
    ).toBe(true);
  });

  it("refuses a fee larger than the remaining budget", () => {
    // 9.50 of a 10.00 cap already spent: a 3.00 fee would have been fully
    // sponsored before, overshooting by 2.50.
    expect(
      canSponsorFeeCents(
        sponsored({ feeSponsorCapCents: 1000, feeSponsoredUsedCents: 950 }),
        300,
      ),
    ).toBe(false);
  });

  it("allows a fee that exactly exhausts the budget", () => {
    expect(
      canSponsorFeeCents(
        sponsored({ feeSponsorCapCents: 1000, feeSponsoredUsedCents: 700 }),
        300,
      ),
    ).toBe(true);
  });

  it("treats an absent cap as unlimited", () => {
    expect(canSponsorFeeCents(sponsored(), 999_999)).toBe(true);
  });

  it("refuses when sponsorship is off, expired, or already exhausted", () => {
    expect(canSponsorFeeCents(base({ feeSponsored: false }), 100)).toBe(false);
    expect(
      canSponsorFeeCents(sponsored({ feeSponsorExpiresAt: past }), 100),
    ).toBe(false);
    expect(
      canSponsorFeeCents(
        sponsored({ feeSponsorCapCents: 1000, feeSponsoredUsedCents: 1000 }),
        1,
      ),
    ).toBe(false);
  });
});

describe("sponsorshipOverspentCents", () => {
  it("is 0 inside budget and 0 when uncapped", () => {
    expect(
      sponsorshipOverspentCents(
        base({ feeSponsorCapCents: 1000, feeSponsoredUsedCents: 400 }),
      ),
    ).toBe(0);
    expect(
      sponsorshipOverspentCents(base({ feeSponsoredUsedCents: 50_000 })),
    ).toBe(0);
  });

  it("reports the overshoot when concurrent settlements passed the cap", () => {
    expect(
      sponsorshipOverspentCents(
        base({ feeSponsorCapCents: 1000, feeSponsoredUsedCents: 1250 }),
      ),
    ).toBe(250);
  });
});

// BM-2.0: numeric limits, the tier-widening guard, and the scope-ready types.
// These add vocabulary the tier build needs; none of them change the existing
// boolean-feature or sponsorship behaviour above (asserted unchanged).
describe("limitFor / withinLimit", () => {
  it("returns the free-tier baseline cap by default", () => {
    expect(limitFor(base(), "custom_fields")).toBe(3);
    expect(limitFor(base(), "active_trips")).toBe(3);
    expect(limitFor(base(), "studio_library")).toBe(5);
  });

  it("returns the higher plus-tier cap on an active plus plan", () => {
    const o = base({ planTier: "plus" });
    expect(limitFor(o, "custom_fields")).toBe(10);
    expect(limitFor(o, "studio_library")).toBe(15);
  });

  it("falls back to the free cap when a plus comp has expired", () => {
    const o = base({ planTier: "plus", planExpiresAt: past });
    expect(limitFor(o, "custom_fields")).toBe(3);
  });

  it("lets a per-account override beat the tier baseline (incl. unlimited)", () => {
    expect(
      limitFor(
        base({ limitOverrides: { custom_fields: 50 } }),
        "custom_fields",
      ),
    ).toBe(50);
    // null override = unlimited for this account
    expect(
      limitFor(
        base({ limitOverrides: { custom_fields: null } }),
        "custom_fields",
      ),
    ).toBeNull();
  });

  it("withinLimit blocks at the cap and always passes an unlimited cap", () => {
    expect(withinLimit(base(), "custom_fields", 2)).toBe(true); // 2 < 3
    expect(withinLimit(base(), "custom_fields", 3)).toBe(false); // 3 not < 3
    expect(
      withinLimit(
        base({ limitOverrides: { custom_fields: null } }),
        "custom_fields",
        9999,
      ),
    ).toBe(true);
  });

  it("does not disturb the boolean feature resolution", () => {
    // A limit override must never leak into canAccess.
    const o = base({ planTier: "plus", limitOverrides: { custom_fields: 1 } });
    expect(canAccess(o, "deposits")).toBe(true);
  });
});

describe("isKnownPlanTier (widening guard)", () => {
  it("accepts the known tiers", () => {
    expect(isKnownPlanTier("free")).toBe(true);
    expect(isKnownPlanTier("plus")).toBe(true);
  });

  it("rejects an unknown/future tier value so callers can notice the widening", () => {
    expect(isKnownPlanTier("studio")).toBe(false);
    expect(isKnownPlanTier("")).toBe(false);
    expect(isKnownPlanTier(null)).toBe(false);
    expect(isKnownPlanTier(undefined)).toBe(false);
  });
});

describe("daysUntilPlanExpiry", () => {
  it("is null for an open-ended comp or a free account", () => {
    expect(daysUntilPlanExpiry(base({ planTier: "plus" }))).toBeNull();
    expect(
      daysUntilPlanExpiry(base({ planTier: "free", planExpiresAt: future })),
    ).toBeNull();
  });

  it("is negative once the comp has lapsed", () => {
    const days = daysUntilPlanExpiry(
      base({ planTier: "plus", planExpiresAt: past }),
    );
    expect(days).not.toBeNull();
    expect(days!).toBeLessThan(0);
  });

  it("counts whole days remaining on a live comp", () => {
    // Offset by an extra minute so the result cannot straddle a day boundary
    // between the two Date.now() reads.
    const in10Days = new Date(
      Date.now() + 10 * 86400000 + 60_000,
    ).toISOString();
    expect(
      daysUntilPlanExpiry(base({ planTier: "plus", planExpiresAt: in10Days })),
    ).toBe(10);
  });
});
