import { describe, it, expect } from "vitest";
import {
  CONNECT_COUNTRIES,
  DEFAULT_CONNECT_COUNTRY,
  isSupportedConnectCountry,
} from "../connect-countries";

describe("connect-countries", () => {
  it("uses ISO alpha-2 codes and unique entries", () => {
    const codes = CONNECT_COUNTRIES.map((c) => c.code);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("includes the default country", () => {
    expect(
      CONNECT_COUNTRIES.some((c) => c.code === DEFAULT_CONNECT_COUNTRY),
    ).toBe(true);
  });

  it("validates supported codes and rejects everything else", () => {
    expect(isSupportedConnectCountry("DE")).toBe(true);
    expect(isSupportedConnectCountry("EE")).toBe(true);
    expect(isSupportedConnectCountry("de")).toBe(false); // case-sensitive
    expect(isSupportedConnectCountry("ZZ")).toBe(false);
    expect(isSupportedConnectCountry(null)).toBe(false);
    expect(isSupportedConnectCountry(undefined)).toBe(false);
    expect(isSupportedConnectCountry(42)).toBe(false);
  });
});
