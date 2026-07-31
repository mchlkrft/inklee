import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  BUSINESS_DECLARATION_TEXT,
  BUSINESS_DECLARATION_HASH,
  IMMEDIATE_PERFORMANCE_TEXT,
  IMMEDIATE_PERFORMANCE_HASH,
} from "../billing-consent-copy";

describe("billing-consent-copy hashes", () => {
  it("BUSINESS_DECLARATION_HASH matches the text", () => {
    const computed = createHash("sha256")
      .update(BUSINESS_DECLARATION_TEXT)
      .digest("hex");
    expect(BUSINESS_DECLARATION_HASH).toBe(computed);
  });

  it("IMMEDIATE_PERFORMANCE_HASH matches the text", () => {
    const computed = createHash("sha256")
      .update(IMMEDIATE_PERFORMANCE_TEXT)
      .digest("hex");
    expect(IMMEDIATE_PERFORMANCE_HASH).toBe(computed);
  });
});
