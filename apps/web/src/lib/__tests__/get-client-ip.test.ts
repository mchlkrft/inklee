import { describe, it, expect } from "vitest";
import { getClientIp } from "../get-client-ip";

function headersWith(forwardedFor: string | null) {
  return {
    get: (name: string) => (name === "x-forwarded-for" ? forwardedFor : null),
  };
}

describe("getClientIp", () => {
  it("returns the leftmost IP from a comma-separated chain, trimmed", () => {
    expect(getClientIp(headersWith("1.2.3.4, 10.0.0.1, 172.16.0.1"))).toBe(
      "1.2.3.4",
    );
    expect(getClientIp(headersWith("  5.6.7.8  "))).toBe("5.6.7.8");
  });

  it("returns 'unknown' when the header is absent or empty", () => {
    expect(getClientIp(headersWith(null))).toBe("unknown");
    expect(getClientIp(headersWith(""))).toBe("unknown");
  });
});
