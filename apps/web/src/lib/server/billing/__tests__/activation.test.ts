import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BillingActivationError } from "@/lib/billing";

// Mock the service-role client so the reader returns controlled approval rows.
const selectMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { from: () => ({ select: selectMock }) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// Mock the artifact resolver so the gate wiring is tested with controlled
// current versions (the resolver itself is covered by artifacts.test.ts).
const artifactsMock = vi.fn(async () => ({}) as Record<string, string>);
vi.mock("@/lib/server/billing/artifacts", () => ({
  getCurrentBillingArtifacts: () => artifactsMock(),
}));

import {
  assertLiveBillingAllowedFor,
  assertSalesLaunchApproved,
  evaluateLiveBilling,
} from "@/lib/server/billing/activation";

const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_ENV = process.env.NODE_ENV;

function forceLiveMode() {
  // resolveBillingMode() reads only the key prefix + NODE_ENV; a fake sk_live_
  // string forces live mode without ever calling Stripe.
  process.env.STRIPE_SECRET_KEY = "sk_live_fake_for_mode_only";
}
function forceTestMode() {
  // Test mode requires a test key AND a non-production NODE_ENV.
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
}

const row = (key: string, group: string) => ({
  approval_key: key,
  approval_group: group,
  approved: true,
  bound_artifact: null,
});

beforeEach(() => {
  selectMock.mockReset();
  artifactsMock.mockReset();
  artifactsMock.mockResolvedValue({});
});
afterEach(() => {
  process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
  (process.env as { NODE_ENV?: string }).NODE_ENV = ORIGINAL_ENV;
});

describe("activation gate (server reader)", () => {
  it("test mode: allowed without even reading the DB", async () => {
    forceTestMode();
    const r = await evaluateLiveBilling("b2c");
    expect(r.allowed).toBe(true);
    expect(selectMock).not.toHaveBeenCalled();
    await expect(assertLiveBillingAllowedFor("b2c")).resolves.toBeUndefined();
  });

  it("live mode + empty approvals: throws (the gate is shut)", async () => {
    forceLiveMode();
    selectMock.mockResolvedValue({ data: [], error: null });
    await expect(assertLiveBillingAllowedFor("b2b")).rejects.toBeInstanceOf(
      BillingActivationError,
    );
  });

  it("live mode + full technical+b2b approvals: allowed", async () => {
    forceLiveMode();
    selectMock.mockResolvedValue({
      data: [
        row("schema_deployed", "technical"),
        row("webhook_tested", "technical"),
        row("reconciliation_tested", "technical"),
        row("isolation_tested", "technical"),
        row("tax_policy_approved", "b2b"),
        row("business_declaration_approved", "b2b"),
        row("terms_approved", "b2b"),
        row("invoice_config_approved", "b2b"),
        row("pricing_display_approved", "b2b"),
        row("stripe_prod_verified", "b2b"),
        row("refund_handling_tested", "b2b"),
      ],
      error: null,
    });
    const r = await evaluateLiveBilling("b2b");
    expect(r.allowed).toBe(true);
  });

  it("live mode: a stale artifact binding re-closes the gate", async () => {
    forceLiveMode();
    selectMock.mockResolvedValue({
      data: [
        row("schema_deployed", "technical"),
        row("webhook_tested", "technical"),
        row("reconciliation_tested", "technical"),
        row("isolation_tested", "technical"),
        // approved, but bound to an OLD tax-policy version
        {
          approval_key: "tax_policy_approved",
          approval_group: "b2b",
          approved: true,
          bound_artifact: "tax-v1",
        },
        row("business_declaration_approved", "b2b"),
        row("terms_approved", "b2b"),
        row("invoice_config_approved", "b2b"),
        row("pricing_display_approved", "b2b"),
        row("stripe_prod_verified", "b2b"),
        row("refund_handling_tested", "b2b"),
      ],
      error: null,
    });
    // The current tax policy has advanced to v2, so the v1-bound approval is stale.
    artifactsMock.mockResolvedValue({ tax_policy_approved: "tax-v2" });
    const r = await evaluateLiveBilling("b2b");
    expect(r.allowed).toBe(false);
    expect(r.missing).toContain("tax_policy_approved");
  });

  it("live mode: a read error fails closed (throws, never 'approved')", async () => {
    forceLiveMode();
    selectMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(assertLiveBillingAllowedFor("b2b")).rejects.toThrow(/boom/);
  });
});

describe("the launch decision is a DB approval, not a code constant", () => {
  // Founder direction 2026-07-28: "a hidden pricing button is not a billing
  // control". The full COMPLIANCE set (the 18 keys recorded 2026-07) must NOT
  // open consumer sales by itself; the founder's recorded
  // consumer_sales_launch_approved row is the go-live control. Nothing in this
  // test touches PLUS_CONSUMER_LAUNCH_ENABLED, which is exactly the point:
  // the constant does not appear anywhere in the money path.
  const FULL_COMPLIANCE_SET = [
    row("schema_deployed", "technical"),
    row("webhook_tested", "technical"),
    row("reconciliation_tested", "technical"),
    row("isolation_tested", "technical"),
    row("tax_policy_approved", "b2b"),
    row("business_declaration_approved", "b2b"),
    row("terms_approved", "b2b"),
    row("invoice_config_approved", "b2b"),
    row("pricing_display_approved", "b2b"),
    row("stripe_prod_verified", "b2b"),
    row("refund_handling_tested", "b2b"),
    row("consumer_classification_approved", "b2c"),
    row("consumer_withdrawal_copy_approved", "b2c"),
    row("withdrawal_function_operational", "b2c"),
    row("durable_confirmation_operational", "b2c"),
    row("proration_policy_approved", "b2c"),
    row("consumer_refund_creditnote_tested", "b2c"),
    row("consumer_pricing_display_approved", "b2c"),
  ];

  it("refuses consumer billing on the full compliance set alone (18/18 is not launch)", async () => {
    forceLiveMode();
    selectMock.mockResolvedValue({ data: FULL_COMPLIANCE_SET, error: null });
    await expect(assertLiveBillingAllowedFor("b2c")).rejects.toBeInstanceOf(
      BillingActivationError,
    );
    const r = await evaluateLiveBilling("b2c");
    expect(r.allowed).toBe(false);
    expect(r.missing).toContain("consumer_sales_launch_approved");
  });

  it("opens only once the founder's launch approval row is recorded", async () => {
    forceLiveMode();
    selectMock.mockResolvedValue({
      data: [
        ...FULL_COMPLIANCE_SET,
        row("consumer_sales_launch_approved", "b2c"),
      ],
      error: null,
    });
    await expect(assertLiveBillingAllowedFor("b2c")).resolves.toBeUndefined();
  });

  it("leaves the b2b group untouched (the launch key is consumer-only)", async () => {
    forceLiveMode();
    selectMock.mockResolvedValue({ data: FULL_COMPLIANCE_SET, error: null });
    const r = await evaluateLiveBilling("b2b");
    expect(r.allowed).toBe(true);
  });

  // The per-contract-type sales assertion (2026-07-28 audit findings 2-3): the
  // BUSINESS path had no launch control at all — b2b compliance is 7/7 open and
  // PLUS_BUSINESS_TIER_ENABLED is client-side rendering only — so a direct POST
  // could open a live business checkout for a tier deferred under D1.
  describe("assertSalesLaunchApproved", () => {
    it("refuses business sales on full compliance (no standalone key)", async () => {
      forceLiveMode();
      selectMock.mockResolvedValue({ data: FULL_COMPLIANCE_SET, error: null });
      await expect(
        assertSalesLaunchApproved("business"),
      ).rejects.toBeInstanceOf(BillingActivationError);
    });

    it("refuses consumer sales without the launch key", async () => {
      forceLiveMode();
      selectMock.mockResolvedValue({ data: FULL_COMPLIANCE_SET, error: null });
      await expect(
        assertSalesLaunchApproved("consumer"),
      ).rejects.toBeInstanceOf(BillingActivationError);
    });

    it("passes each contract type only on ITS OWN recorded key", async () => {
      forceLiveMode();
      selectMock.mockResolvedValue({
        data: [
          ...FULL_COMPLIANCE_SET,
          row("consumer_sales_launch_approved", "b2c"),
        ],
        error: null,
      });
      await expect(
        assertSalesLaunchApproved("consumer"),
      ).resolves.toBeUndefined();
      // The consumer key must NOT open business sales.
      await expect(
        assertSalesLaunchApproved("business"),
      ).rejects.toBeInstanceOf(BillingActivationError);
    });

    it("fails closed when the approvals read errors", async () => {
      forceLiveMode();
      selectMock.mockResolvedValue({ data: null, error: { message: "boom" } });
      await expect(assertSalesLaunchApproved("consumer")).rejects.toThrow(
        /boom/,
      );
    });

    it("is a no-op in test mode (dogfooding keeps working)", async () => {
      forceTestMode();
      await expect(
        assertSalesLaunchApproved("business"),
      ).resolves.toBeUndefined();
      expect(selectMock).not.toHaveBeenCalled();
    });
  });
});
