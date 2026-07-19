import { describe, expect, it } from "vitest";
import {
  STUDIO_SIGNAL_DURATION_DAYS,
  STUDIO_SIGNAL_LABELS,
  STUDIO_SIGNAL_TYPES,
  isStudioSignalType,
  signalExpiry,
} from "@inklee/shared/studio-signals";

describe("studio signals vocabulary", () => {
  it("covers the eight scoped types with labels", () => {
    expect(STUDIO_SIGNAL_TYPES).toHaveLength(8);
    for (const t of STUDIO_SIGNAL_TYPES) {
      expect(STUDIO_SIGNAL_LABELS[t]).toBeTruthy();
      expect(isStudioSignalType(t)).toBe(true);
    }
  });

  it("rejects anything outside the vocabulary", () => {
    expect(isStudioSignalType("free_beer")).toBe(false);
    expect(isStudioSignalType("")).toBe(false);
  });

  it("expiry is the fixed silent window", () => {
    const from = new Date("2026-07-19T12:00:00Z");
    const expiry = signalExpiry(from);
    expect((expiry.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)).toBe(
      STUDIO_SIGNAL_DURATION_DAYS,
    );
  });
});
