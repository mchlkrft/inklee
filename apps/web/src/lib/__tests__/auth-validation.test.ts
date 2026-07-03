import { describe, it, expect } from "vitest";
import {
  validatePassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES_HINT,
} from "@inklee/shared/auth-validation";

describe("validatePassword", () => {
  it("rejects a password under the minimum length", () => {
    expect(validatePassword("Xy1".repeat(2))).toBe(
      "Password must be at least 8 characters.",
    );
  });

  it("rejects a password without a lowercase letter", () => {
    expect(validatePassword("PASSWORD1")).toBe(
      "Password must include a lowercase letter.",
    );
  });

  it("rejects a password without an uppercase letter", () => {
    expect(validatePassword("password1")).toBe(
      "Password must include an uppercase letter.",
    );
  });

  it("rejects a password without a number", () => {
    expect(validatePassword("Passwordx")).toBe(
      "Password must include a number.",
    );
  });

  it("accepts a password meeting all rules at the minimum length", () => {
    const pw = "Aa1" + "x".repeat(PASSWORD_MIN_LENGTH - 3);
    expect(pw.length).toBe(PASSWORD_MIN_LENGTH);
    expect(validatePassword(pw)).toBe(null);
  });

  it("uses the supplied label (change-password surface)", () => {
    expect(validatePassword("short", { label: "New password" })).toBe(
      "New password must be at least 8 characters.",
    );
    expect(validatePassword("longenough1", { label: "New password" })).toBe(
      "New password must include an uppercase letter.",
    );
  });

  it("keeps the helper hint in sync with the rules", () => {
    expect(PASSWORD_RULES_HINT).toContain(String(PASSWORD_MIN_LENGTH));
    expect(PASSWORD_RULES_HINT).toContain("uppercase");
    expect(PASSWORD_RULES_HINT).toContain("lowercase");
    expect(PASSWORD_RULES_HINT).toContain("number");
  });
});
