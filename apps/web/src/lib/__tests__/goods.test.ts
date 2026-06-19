import { describe, it, expect } from "vitest";
import {
  parsePriceInput,
  parseOptionalPriceInput,
  normalizePriceNumber,
  formatPrice,
  toPriceNumber,
  isProductCategory,
  isProductStatus,
  MAX_PRICE,
} from "../goods";

describe("parsePriceInput", () => {
  it("parses a valid price and rounds to 2dp", () => {
    expect(parsePriceInput("25")).toEqual({ value: 25 });
    expect(parsePriceInput("19.999")).toEqual({ value: 20 });
    expect(parsePriceInput(" 12.50 ")).toEqual({ value: 12.5 });
  });

  it("errors on blank, negative, non-numeric, or over-max", () => {
    expect("error" in parsePriceInput("")).toBe(true);
    expect("error" in parsePriceInput("   ")).toBe(true);
    expect("error" in parsePriceInput("-5")).toBe(true);
    expect("error" in parsePriceInput("abc")).toBe(true);
    expect("error" in parsePriceInput(String(MAX_PRICE + 1))).toBe(true);
  });

  it("treats a comma as the decimal separator (EU), dots/spaces as grouping", () => {
    expect(parsePriceInput("1,50")).toEqual({ value: 1.5 });
    expect(parsePriceInput("1.234,56")).toEqual({ value: 1234.56 });
    expect(parsePriceInput("1 234,50")).toEqual({ value: 1234.5 });
  });
});

describe("normalizePriceNumber", () => {
  it("rounds to 2dp and enforces the bounds on an already-numeric value", () => {
    expect(normalizePriceNumber(19.999)).toEqual({ value: 20 });
    expect(normalizePriceNumber(12.5)).toEqual({ value: 12.5 });
    expect("error" in normalizePriceNumber(-1)).toBe(true);
    expect("error" in normalizePriceNumber(MAX_PRICE + 1)).toBe(true);
    expect("error" in normalizePriceNumber(NaN)).toBe(true);
  });
});

describe("parseOptionalPriceInput", () => {
  it("returns null for blank input", () => {
    expect(parseOptionalPriceInput("")).toEqual({ value: null });
    expect(parseOptionalPriceInput(null)).toEqual({ value: null });
    expect(parseOptionalPriceInput("  ")).toEqual({ value: null });
  });

  it("parses a value when present and errors on invalid", () => {
    expect(parseOptionalPriceInput("30")).toEqual({ value: 30 });
    expect("error" in parseOptionalPriceInput("-1")).toBe(true);
  });
});

describe("formatPrice", () => {
  it("formats with an uppercase currency code and 2dp", () => {
    expect(formatPrice(25)).toBe("EUR 25.00");
    expect(formatPrice(12.5, "usd")).toBe("USD 12.50");
  });
});

describe("toPriceNumber", () => {
  it("coerces numeric strings and numbers, defaults to 0", () => {
    expect(toPriceNumber("25.00")).toBe(25);
    expect(toPriceNumber(30)).toBe(30);
    expect(toPriceNumber(null)).toBe(0);
    expect(toPriceNumber("nope")).toBe(0);
  });
});

describe("isProductCategory / isProductStatus", () => {
  it("validates known values", () => {
    expect(isProductCategory("shirt")).toBe(true);
    expect(isProductCategory("flash_sheet")).toBe(true);
    expect(isProductCategory("bogus")).toBe(false);
    expect(isProductCategory(null)).toBe(false);
    expect(isProductStatus("sold_out")).toBe(true);
    expect(isProductStatus("active")).toBe(true);
    expect(isProductStatus("nope")).toBe(false);
  });
});
