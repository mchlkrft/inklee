import { describe, it, expect } from "vitest";
import {
  validatePassword,
  PASSWORD_MIN_LENGTH,
} from "@inklee/shared/auth-validation";

describe("validatePassword", () => {
  it("rejects a password under the minimum length", () => {
    expect(validatePassword("x".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(
      "Password must be at least 8 characters.",
    );
  });

  it("accepts a password at the minimum length", () => {
    expect(validatePassword("x".repeat(PASSWORD_MIN_LENGTH))).toBe(null);
  });

  it("uses the supplied label (change-password surface)", () => {
    expect(validatePassword("short", { label: "New password" })).toBe(
      "New password must be at least 8 characters.",
    );
  });
});
