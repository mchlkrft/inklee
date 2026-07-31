import { describe, it, expect, vi, beforeEach } from "vitest";

// confirmBusinessCheckoutAction: the C3 business-use declaration is a hard,
// server-authoritative precondition, and a valid order records BOTH the
// declaration and Terms acceptance BEFORE any Stripe object is created.

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  insert: vi.fn(),
  pricesList: vi.fn(),
  createCheckout: vi.fn(),
  getLegalDoc: vi.fn(),
  withdrawCore: vi.fn(),
  // The pre-consent gates (2026-07-28): per-contract-type launch key + the
  // group compliance gate, both asserted BEFORE the consent write.
  assertLaunch: vi.fn(),
  assertGroupGate: vi.fn(),
  // Mutable launch flags so tests can exercise both sides of the yearly gate.
  flags: { yearly: false },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: h.getUser } }),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { from: () => ({ insert: h.insert }) },
}));
vi.mock("@/lib/server/billing/client", () => ({
  requireStripe: () => ({ prices: { list: h.pricesList } }),
}));
vi.mock("@/lib/server/billing/subscription", () => ({
  createSubscriptionCheckout: (args: unknown) => h.createCheckout(args),
  // Mirrors the real mapping (subscription.ts) so the actions' price lookup
  // stays observable per interval.
  lookupKeyForInterval: (i: string) =>
    i === "yearly" ? "inklee_plus_yearly_eur" : "inklee_plus_monthly_eur",
}));
vi.mock("@/lib/plus-launch-config", () => ({
  PLUS_BUSINESS_TIER_ENABLED: false,
  PLUS_CONSUMER_LAUNCH_ENABLED: false,
  get PLUS_YEARLY_ENABLED() {
    return h.flags.yearly;
  },
}));
vi.mock("@/lib/legal/documents", () => ({ getLegalDoc: h.getLegalDoc }));
vi.mock("@/lib/server/billing/activation", () => ({
  assertSalesLaunchApproved: (t: unknown) => h.assertLaunch(t),
  assertLiveBillingAllowedFor: (g: unknown) => h.assertGroupGate(g),
}));
vi.mock("@/lib/server/billing/withdrawal", () => ({
  withdrawSubscriptionCore: (a: unknown) => h.withdrawCore(a),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "test-agent" }),
}));
vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: () => "127.0.0.1",
}));

import {
  confirmBusinessCheckoutAction,
  startPlusConsumerCheckoutAction,
  withdrawFromSubscriptionAction,
} from "../actions";
import { BillingActivationError } from "@/lib/billing";

beforeEach(() => {
  h.getUser.mockReset().mockResolvedValue({
    data: { user: { id: "artist_1", email: "a@b.co" } },
  });
  h.insert.mockReset().mockResolvedValue({ error: null });
  h.pricesList.mockReset().mockResolvedValue({ data: [{ id: "price_live" }] });
  h.createCheckout
    .mockReset()
    .mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe/x" });
  h.getLegalDoc
    .mockReset()
    .mockReturnValue({ version: "2026-07-23", versionHash: "hash_abc" });
  h.withdrawCore.mockReset();
  h.assertLaunch.mockReset().mockResolvedValue(undefined);
  h.assertGroupGate.mockReset().mockResolvedValue(undefined);
  h.flags.yearly = false;
});

describe("confirmBusinessCheckoutAction", () => {
  it("rejects and records nothing when business use is not declared", async () => {
    const r = await confirmBusinessCheckoutAction({
      businessUseDeclared: false,
    });
    expect(r).toEqual({
      message: "Please confirm you are purchasing as a business to continue.",
    });
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("records the declaration + Terms acceptance, then starts checkout", async () => {
    const r = await confirmBusinessCheckoutAction({
      businessUseDeclared: true,
    });
    expect(r).toEqual({ url: "https://checkout.stripe/x" });

    // Consent recorded before checkout, both rows, bound to the current terms.
    expect(h.insert).toHaveBeenCalledTimes(1);
    const rows = h.insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    const decl = rows.find(
      (x) => x.consent_type === "business_use_declaration",
    )!;
    const terms = rows.find((x) => x.consent_type === "terms_acceptance")!;
    expect(decl.artist_id).toBe("artist_1");
    expect(decl.consent_version).toBe("c3-business-declaration-2026-07-23");
    expect(terms.consent_version).toBe("2026-07-23");
    expect(terms.consent_hash).toBe("hash_abc");
    expect(h.createCheckout).toHaveBeenCalledTimes(1);
    expect(h.createCheckout.mock.calls[0][0]).toMatchObject({
      artistId: "artist_1",
      contractCustomerType: "business",
    });
  });

  it("returns coming-soon without recording when no live Price exists", async () => {
    h.pricesList.mockResolvedValue({ data: [] });
    const r = await confirmBusinessCheckoutAction({
      businessUseDeclared: true,
    });
    expect(r).toEqual({ message: "Plus isn't available yet." });
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("does not create checkout if the consent write fails", async () => {
    h.insert.mockResolvedValue({ error: { message: "db down" } });
    const r = await confirmBusinessCheckoutAction({
      businessUseDeclared: true,
    });
    expect(r).toEqual({ message: "Something went wrong. Please try again." });
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("degrades to coming-soon when the activation gate blocks (the prod dark-launch path)", async () => {
    // In prod (always live-mode) the gate is closed until every key is recorded,
    // so createSubscriptionCheckout throws BillingActivationError. The buyer sees
    // a graceful message, not an error, even though consent was already recorded.
    h.createCheckout.mockRejectedValue(
      new BillingActivationError("b2b", ["terms_approved"], "gate closed"),
    );
    const r = await confirmBusinessCheckoutAction({
      businessUseDeclared: true,
    });
    expect(r).toEqual({
      message: "Plus isn't available yet. We're finishing the last checks.",
    });
  });

  it("REFUSES the order when the Terms read fails (no unknown-version acceptance)", async () => {
    // Inverted 2026-07-28 (founder legal-artifact-integrity direction): the
    // acceptance row is the buyer's contract evidence, so an order must never
    // record consent_version "unknown". The earlier posture ordered anyway.
    h.getLegalDoc.mockImplementation(() => {
      throw new Error("content not bundled");
    });
    const r = await confirmBusinessCheckoutAction({
      businessUseDeclared: true,
    });
    expect(r).toEqual({
      message: "Plus isn't available right now. Please try again shortly.",
    });
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("refuses BEFORE the consent write when business sales are not launched", async () => {
    // The launch key is per contract type and asserted first: a refused call
    // leaves no terms_acceptance row for a purchase that never existed.
    h.assertLaunch.mockRejectedValue(
      new BillingActivationError(
        "b2b",
        ["business_sales_launch_approved"],
        "not launched",
      ),
    );
    const r = await confirmBusinessCheckoutAction({
      businessUseDeclared: true,
    });
    expect(r).toEqual({
      message: "Plus isn't available yet. We're finishing the last checks.",
    });
    expect(h.assertLaunch).toHaveBeenCalledWith("business");
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });
});

describe("startPlusConsumerCheckoutAction (v1 consumer-first)", () => {
  it("records only Terms acceptance (no declaration) and checks out as consumer", async () => {
    const r = await startPlusConsumerCheckoutAction();
    expect(r).toEqual({ url: "https://checkout.stripe/x" });

    expect(h.insert).toHaveBeenCalledTimes(1);
    const rows = h.insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].consent_type).toBe("terms_acceptance");
    expect(rows[0].artist_id).toBe("artist_1");
    // No business-use declaration on the consumer path.
    expect(
      rows.some((x) => x.consent_type === "business_use_declaration"),
    ).toBe(false);
    expect(h.createCheckout.mock.calls[0][0]).toMatchObject({
      artistId: "artist_1",
      contractCustomerType: "consumer",
    });
  });

  it("records the immediate-performance request when the buyer opts in", async () => {
    const r = await startPlusConsumerCheckoutAction({
      immediatePerformanceRequested: true,
    });
    expect(r).toEqual({ url: "https://checkout.stripe/x" });
    const rows = h.insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    const ip = rows.find(
      (x) => x.consent_type === "immediate_performance_request",
    )!;
    expect(ip).toBeTruthy();
    expect(ip.consent_version).toBe("p3-immediate-performance-2026-07-24");
    expect(rows.some((x) => x.consent_type === "terms_acceptance")).toBe(true);
  });

  it("does NOT record an immediate-performance request when omitted (full-refund path)", async () => {
    await startPlusConsumerCheckoutAction({});
    const rows = h.insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(
      rows.some((x) => x.consent_type === "immediate_performance_request"),
    ).toBe(false);
  });

  it("returns coming-soon without recording when no live Price exists", async () => {
    h.pricesList.mockResolvedValue({ data: [] });
    const r = await startPlusConsumerCheckoutAction();
    expect(r).toEqual({ message: "Plus isn't available yet." });
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("degrades to coming-soon when the activation gate blocks", async () => {
    h.createCheckout.mockRejectedValue(
      new BillingActivationError(
        "b2c",
        ["consumer_withdrawal_copy_approved"],
        "gate closed",
      ),
    );
    const r = await startPlusConsumerCheckoutAction();
    expect(r).toEqual({
      message: "Plus isn't available yet. We're finishing the last checks.",
    });
  });

  it("refuses BEFORE the consent write when consumer sales are not launched", async () => {
    h.assertLaunch.mockRejectedValue(
      new BillingActivationError(
        "b2c",
        ["consumer_sales_launch_approved"],
        "not launched",
      ),
    );
    const r = await startPlusConsumerCheckoutAction();
    expect(r).toEqual({
      message: "Plus isn't available yet. We're finishing the last checks.",
    });
    expect(h.assertLaunch).toHaveBeenCalledWith("consumer");
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("refuses yearly while PLUS_YEARLY_ENABLED is off, recording nothing", async () => {
    const r = await startPlusConsumerCheckoutAction({
      billingInterval: "yearly",
    });
    expect(r).toEqual({ message: "Yearly billing isn't available yet." });
    expect(h.pricesList).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("defaults to the monthly lookup key and stamps the monthly interval", async () => {
    await startPlusConsumerCheckoutAction();
    expect(h.pricesList.mock.calls[0][0]).toMatchObject({
      lookup_keys: ["inklee_plus_monthly_eur"],
    });
    expect(h.createCheckout.mock.calls[0][0]).toMatchObject({
      billingInterval: "monthly",
    });
  });

  it("normalizes an unknown interval value to monthly (untrusted input)", async () => {
    await startPlusConsumerCheckoutAction({
      billingInterval: "weekly" as never,
    });
    expect(h.pricesList.mock.calls[0][0]).toMatchObject({
      lookup_keys: ["inklee_plus_monthly_eur"],
    });
    expect(h.createCheckout.mock.calls[0][0]).toMatchObject({
      billingInterval: "monthly",
    });
  });

  it("with the yearly flag on, resolves the yearly Price and stamps the yearly interval", async () => {
    h.flags.yearly = true;
    const r = await startPlusConsumerCheckoutAction({
      billingInterval: "yearly",
    });
    expect(r).toEqual({ url: "https://checkout.stripe/x" });
    expect(h.pricesList.mock.calls[0][0]).toMatchObject({
      lookup_keys: ["inklee_plus_yearly_eur"],
    });
    expect(h.createCheckout.mock.calls[0][0]).toMatchObject({
      contractCustomerType: "consumer",
      billingInterval: "yearly",
    });
  });
});

describe("withdrawFromSubscriptionAction", () => {
  it("requires an explicit confirmation before doing anything", async () => {
    const r = await withdrawFromSubscriptionAction({ confirmed: false });
    expect(r).toEqual({
      message: "Please confirm your withdrawal to continue.",
    });
    expect(h.withdrawCore).not.toHaveBeenCalled();
  });

  it("confirms with the refund amount on a completed withdrawal", async () => {
    h.withdrawCore.mockResolvedValue({
      status: "completed",
      refundMinor: 250,
      currency: "eur",
      caseId: "wc_1",
    });
    const r = await withdrawFromSubscriptionAction({ confirmed: true });
    expect(r.message).toContain("Your withdrawal is confirmed");
    expect(r.message).toContain("2.50 EUR");
  });

  it("reports when there is no active subscription", async () => {
    h.withdrawCore.mockResolvedValue({ status: "no_subscription" });
    const r = await withdrawFromSubscriptionAction({ confirmed: true });
    expect(r.message).toContain("no active paid subscription");
  });

  it("passes through the not-available reason (offers cancellation)", async () => {
    h.withdrawCore.mockResolvedValue({
      status: "not_available",
      reason: "The 14-day withdrawal period has ended. You can cancel instead.",
    });
    const r = await withdrawFromSubscriptionAction({ confirmed: true });
    expect(r.message).toContain("withdrawal period has ended");
  });
});
