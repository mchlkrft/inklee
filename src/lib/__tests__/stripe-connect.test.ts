import { describe, it, expect } from "vitest";
import {
  deriveConnectStatus,
  isConnectStatus,
  type ConnectAccountSnapshot,
} from "../stripe-connect";

describe("deriveConnectStatus", () => {
  it("returns 'unset' when no account is passed", () => {
    expect(deriveConnectStatus(null)).toBe("unset");
    expect(deriveConnectStatus(undefined)).toBe("unset");
  });

  it("returns 'pending' before details_submitted is true", () => {
    const account: ConnectAccountSnapshot = {
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    };
    expect(deriveConnectStatus(account)).toBe("pending");
  });

  it("returns 'active' when charges + payouts are enabled and no requirements are blocking", () => {
    const account: ConnectAccountSnapshot = {
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: { past_due: [], currently_due: [] },
    };
    expect(deriveConnectStatus(account)).toBe("active");
  });

  it("returns 'restricted' when there are past-due requirements even if charges are enabled", () => {
    const account: ConnectAccountSnapshot = {
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: { past_due: ["tax_id_provided"] },
    };
    expect(deriveConnectStatus(account)).toBe("restricted");
  });

  it("returns 'restricted' when charges_enabled is false but the account is past onboarding", () => {
    const account: ConnectAccountSnapshot = {
      charges_enabled: false,
      payouts_enabled: true,
      details_submitted: true,
    };
    expect(deriveConnectStatus(account)).toBe("restricted");
  });

  it("returns 'restricted' when payouts_enabled is false but charges work", () => {
    const account: ConnectAccountSnapshot = {
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
    };
    expect(deriveConnectStatus(account)).toBe("restricted");
  });

  it("returns 'disabled' when Stripe set disabled_reason on the account", () => {
    const account: ConnectAccountSnapshot = {
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      disabled_reason: "rejected.fraud",
    };
    expect(deriveConnectStatus(account)).toBe("disabled");
  });

  it("returns 'disabled' when requirements.disabled_reason starts with 'rejected'", () => {
    const account: ConnectAccountSnapshot = {
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      requirements: { disabled_reason: "rejected.terms_of_service" },
    };
    expect(deriveConnectStatus(account)).toBe("disabled");
  });

  it("treats a non-rejecting requirements.disabled_reason as just 'restricted'", () => {
    // Stripe sometimes sets disabled_reason like 'requirements.past_due'
    // alongside past_due entries — the row is restricted, not disabled.
    const account: ConnectAccountSnapshot = {
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      requirements: {
        disabled_reason: "requirements.past_due",
        past_due: ["tax_id_provided"],
      },
    };
    expect(deriveConnectStatus(account)).toBe("restricted");
  });
});

describe("isConnectStatus", () => {
  it("accepts every member of the union", () => {
    for (const s of ["unset", "pending", "active", "restricted", "disabled"]) {
      expect(isConnectStatus(s)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isConnectStatus("")).toBe(false);
    expect(isConnectStatus("ACTIVE")).toBe(false);
    expect(isConnectStatus(null)).toBe(false);
    expect(isConnectStatus(undefined)).toBe(false);
    expect(isConnectStatus(42)).toBe(false);
  });
});
