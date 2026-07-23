import { describe, it, expect, vi, beforeEach } from "vitest";

// from(t).select(cols).eq(k,v).maybeSingle()
const maybeSingle = vi.fn();
const chain: { eq: ReturnType<typeof vi.fn>; maybeSingle: typeof maybeSingle } =
  { eq: vi.fn(() => chain), maybeSingle };
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { from: () => ({ select: () => chain }) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { getAccountOverrides } from "@/lib/entitlements-server";

beforeEach(() => maybeSingle.mockReset());

describe("getAccountOverrides reader (0105 columns)", () => {
  it("returns defaults when no row exists", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const o = await getAccountOverrides("a1");
    expect(o.planTier).toBe("free");
    expect(o.limitOverrides).toEqual({});
    expect(o.policyId ?? null).toBeNull();
  });

  it("maps the new billing + grandfather columns", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        plan_tier: "plus",
        plan_source: "grandfathered",
        plan_expires_at: null,
        entitlement_overrides: { custom_templates: true },
        limit_overrides: { custom_fields: 12 },
        subscription_status: "active",
        current_period_end: "2026-09-01T00:00:00Z",
        cancel_at_period_end: true,
        policy_id: "legacy_free_v1",
        granted_at: "2026-07-23T00:00:00Z",
        cutover_ts: "2026-07-23T00:00:00Z",
        grant_expires_at: null,
        grant_reason: "cutover",
        grant_package: {
          features: { custom_templates: true },
          limits: { custom_fields: 12 },
        },
        fee_sponsored: false,
        fee_sponsor_expires_at: null,
        fee_sponsor_cap_cents: null,
        fee_sponsored_used_cents: 0,
        admin_notes: null,
      },
      error: null,
    });
    const o = await getAccountOverrides("a2");
    expect(o.planSource).toBe("grandfathered");
    expect(o.limitOverrides).toEqual({ custom_fields: 12 });
    expect(o.subscriptionStatus).toBe("active");
    expect(o.cancelAtPeriodEnd).toBe(true);
    expect(o.policyId).toBe("legacy_free_v1");
    expect(o.grantPackage).toEqual({
      features: { custom_templates: true },
      limits: { custom_fields: 12 },
    });
  });

  it("throws on a read error (money-path: never resolves to free silently)", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "db down" },
    });
    await expect(getAccountOverrides("a3")).rejects.toThrow(/db down/);
  });
});
