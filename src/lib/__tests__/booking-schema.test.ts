import { describe, it, expect } from "vitest";
import { formatSize, SIZE_LABELS } from "../booking-schema";

describe("formatSize", () => {
  it("renders a known size key as label + hint", () => {
    expect(formatSize("forearm")).toBe("Forearm · ~ 15-20 cm");
    expect(formatSize("palm-sized")).toBe("Palm-sized · ~ 5 cm");
  });

  it("covers every defined size", () => {
    for (const key of Object.keys(SIZE_LABELS)) {
      const { label, hint } = SIZE_LABELS[key as keyof typeof SIZE_LABELS];
      expect(formatSize(key)).toBe(`${label} · ${hint}`);
    }
  });

  it("returns empty string for empty/nullish values", () => {
    expect(formatSize("")).toBe("");
    expect(formatSize(null)).toBe("");
    expect(formatSize(undefined)).toBe("");
  });

  it("falls back to the raw value for unknown/legacy keys", () => {
    expect(formatSize("custom-thing")).toBe("custom-thing");
  });
});
