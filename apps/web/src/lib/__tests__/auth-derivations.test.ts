import { describe, it, expect } from "vitest";
import {
  isMfaEnabled,
  deriveSignInIdentity,
} from "@inklee/shared/auth-derivations";

describe("isMfaEnabled", () => {
  it("is false for no factors", () => {
    expect(isMfaEnabled(null)).toBe(false);
    expect(isMfaEnabled(undefined)).toBe(false);
    expect(isMfaEnabled([])).toBe(false);
  });

  it("is true for a single verified TOTP factor", () => {
    expect(isMfaEnabled([{ factor_type: "totp", status: "verified" }])).toBe(
      true,
    );
  });

  it("is false for an unverified TOTP factor", () => {
    expect(isMfaEnabled([{ factor_type: "totp", status: "unverified" }])).toBe(
      false,
    );
  });

  // BUG-7: the verified factor is NOT first. Web's old factors.totp[0] check
  // missed this and read "Off" while mobile's .some() read "On".
  it("scans the whole list, not just the first factor", () => {
    expect(
      isMfaEnabled([
        { factor_type: "totp", status: "unverified" },
        { factor_type: "totp", status: "verified" },
      ]),
    ).toBe(true);
  });

  it("ignores non-TOTP factors", () => {
    expect(isMfaEnabled([{ factor_type: "phone", status: "verified" }])).toBe(
      false,
    );
  });
});

describe("deriveSignInIdentity", () => {
  it("treats null/empty identities as no-password OAuth-less", () => {
    expect(deriveSignInIdentity(null)).toEqual({
      hasPassword: false,
      oauthProvider: null,
    });
    expect(deriveSignInIdentity([])).toEqual({
      hasPassword: false,
      oauthProvider: null,
    });
  });

  it("reports a password account (oauthProvider null)", () => {
    expect(deriveSignInIdentity([{ provider: "email" }])).toEqual({
      hasPassword: true,
      oauthProvider: null,
    });
  });

  it("reports the OAuth provider for an OAuth-only account", () => {
    expect(deriveSignInIdentity([{ provider: "google" }])).toEqual({
      hasPassword: false,
      oauthProvider: "google",
    });
  });

  // An email+OAuth account is password-capable: prefer the password path,
  // exactly like web. (The old mobile app_metadata.provider check could read
  // "google" here and wrongly hide the password re-auth.)
  it("prefers password when both email and OAuth identities exist", () => {
    expect(
      deriveSignInIdentity([{ provider: "google" }, { provider: "email" }]),
    ).toEqual({ hasPassword: true, oauthProvider: null });
  });
});
