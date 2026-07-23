import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BillingActivationError } from "@/lib/billing";

// Mock the service-role client so the reader returns controlled approval rows.
const selectMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { from: () => ({ select: selectMock }) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import {
  assertLiveBillingAllowedFor,
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

  it("live mode: a read error fails closed (throws, never 'approved')", async () => {
    forceLiveMode();
    selectMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(assertLiveBillingAllowedFor("b2b")).rejects.toThrow(/boom/);
  });
});
