import { describe, it, expect } from "vitest";
import {
  deriveConnectStatus,
  deriveConnectRouting,
  isConnectAccountUnreachable,
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

describe("deriveConnectRouting", () => {
  it("routes charges only when status='active' AND charges_enabled=true AND id is set", () => {
    expect(
      deriveConnectRouting({
        stripe_account_id: "acct_1",
        stripe_account_status: "active",
        stripe_charges_enabled: true,
      }),
    ).toEqual({ stripeAccountId: "acct_1", routeCharges: true });
  });

  it("does not route when the account is restricted even if charges_enabled is true", () => {
    expect(
      deriveConnectRouting({
        stripe_account_id: "acct_1",
        stripe_account_status: "restricted",
        stripe_charges_enabled: true,
      }),
    ).toEqual({ stripeAccountId: "acct_1", routeCharges: false });
  });

  it("does not route when charges_enabled is false even if active", () => {
    expect(
      deriveConnectRouting({
        stripe_account_id: "acct_1",
        stripe_account_status: "active",
        stripe_charges_enabled: false,
      }),
    ).toEqual({ stripeAccountId: "acct_1", routeCharges: false });
  });

  it("returns id=null + routeCharges=false when no account on file", () => {
    expect(
      deriveConnectRouting({
        stripe_account_id: null,
        stripe_account_status: "unset",
        stripe_charges_enabled: false,
      }),
    ).toEqual({ stripeAccountId: null, routeCharges: false });
  });

  it("tolerates undefined inputs (defensive)", () => {
    expect(
      deriveConnectRouting({
        stripe_account_id: undefined,
        stripe_account_status: undefined,
        stripe_charges_enabled: undefined,
      }),
    ).toEqual({ stripeAccountId: null, routeCharges: false });
  });
});

// This predicate decides whether a Stripe error is allowed to downgrade an
// artist's stored payout state. A false positive during a Stripe incident would
// knock every artist out of card deposits at once, so the negative cases below
// matter more than the positive ones.
describe("isConnectAccountUnreachable", () => {
  it("detects the 403 raised when an account id belongs to the other key mode", () => {
    expect(
      isConnectAccountUnreachable({
        type: "StripePermissionError",
        statusCode: 403,
        message:
          "The provided key 'sk_live_***' does not have access to account 'acct_1TepeQHRzRukdnOm' (or that account does not exist). Application access may have been revoked.",
      }),
    ).toBe(true);
  });

  it("detects an invalid destination account", () => {
    expect(
      isConnectAccountUnreachable({
        type: "StripeInvalidRequestError",
        statusCode: 400,
        code: "account_invalid",
        message: "The account is invalid.",
      }),
    ).toBe(true);
  });

  it("detects resource_missing when it points at an account parameter", () => {
    expect(
      isConnectAccountUnreachable({
        type: "StripeInvalidRequestError",
        statusCode: 400,
        code: "resource_missing",
        param: "transfer_data[destination]",
        message: "No such destination account: acct_1TepeQHRzRukdnOm",
      }),
    ).toBe(true);
    expect(
      isConnectAccountUnreachable({
        code: "resource_missing",
        param: "on_behalf_of",
        message: "No such account",
      }),
    ).toBe(true);
  });

  it("ignores resource_missing that points at some other id", () => {
    expect(
      isConnectAccountUnreachable({
        type: "StripeInvalidRequestError",
        statusCode: 404,
        code: "resource_missing",
        param: "payment_method",
        message: "No such payment_method: pm_123",
      }),
    ).toBe(false);
  });

  it("never downgrades on transient failures", () => {
    expect(
      isConnectAccountUnreachable({
        type: "StripeRateLimitError",
        statusCode: 429,
        message: "Too many requests",
      }),
    ).toBe(false);
    expect(
      isConnectAccountUnreachable({
        type: "StripeAPIError",
        statusCode: 500,
        message: "Stripe is temporarily unavailable",
      }),
    ).toBe(false);
    expect(
      isConnectAccountUnreachable({
        type: "StripeConnectionError",
        message: "socket hang up",
      }),
    ).toBe(false);
    expect(
      isConnectAccountUnreachable({
        type: "StripeCardError",
        statusCode: 402,
        code: "card_declined",
        message: "Your card was declined.",
      }),
    ).toBe(false);
  });

  it("tolerates non-error inputs", () => {
    expect(isConnectAccountUnreachable(null)).toBe(false);
    expect(isConnectAccountUnreachable(undefined)).toBe(false);
    expect(isConnectAccountUnreachable("403")).toBe(false);
    expect(isConnectAccountUnreachable({})).toBe(false);
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
