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
}));
vi.mock("@/lib/legal/documents", () => ({ getLegalDoc: h.getLegalDoc }));

import {
  confirmBusinessCheckoutAction,
  startPlusConsumerCheckoutAction,
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

  it("still orders if the Terms read fails (binds Terms to unknown/null)", async () => {
    h.getLegalDoc.mockImplementation(() => {
      throw new Error("content not bundled");
    });
    const r = await confirmBusinessCheckoutAction({
      businessUseDeclared: true,
    });
    expect(r).toEqual({ url: "https://checkout.stripe/x" });
    const rows = h.insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    const terms = rows.find((x) => x.consent_type === "terms_acceptance")!;
    expect(terms.consent_version).toBe("unknown");
    expect(terms.consent_hash).toBeNull();
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
});
