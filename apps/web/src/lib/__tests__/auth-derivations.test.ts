import { describe, it, expect } from "vitest";
import { isMfaEnabled } from "@inklee/shared/auth-derivations";

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
