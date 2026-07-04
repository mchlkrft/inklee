import { describe, it, expect } from "vitest";
import { compareVersions, isUpdateRequired } from "@inklee/shared/app-version";

describe("compareVersions", () => {
  it("orders by major.minor.patch", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(compareVersions("1.3.0", "1.2.9")).toBe(1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
  });

  it("zero-fills shorter versions", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1", "1.0.1")).toBe(-1);
  });

  it("ignores a pre-release / build suffix", () => {
    expect(compareVersions("1.2.3-beta.1", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3+build9", "1.2.3")).toBe(0);
  });

  it("treats non-numeric / empty segments as 0", () => {
    expect(compareVersions("", "0.0.0")).toBe(0);
    expect(compareVersions("x.y.z", "0.0.0")).toBe(0);
    expect(compareVersions("1.x.3", "1.0.3")).toBe(0);
  });
});

describe("isUpdateRequired", () => {
  it("is true only when current is strictly older than min", () => {
    expect(isUpdateRequired("1.0.0", "1.0.1")).toBe(true);
    expect(isUpdateRequired("1.0.1", "1.0.1")).toBe(false);
    expect(isUpdateRequired("1.1.0", "1.0.1")).toBe(false);
  });

  it("fail-open: an unset (0.0.0) minimum never requires an update", () => {
    expect(isUpdateRequired("0.1.0", "0.0.0")).toBe(false);
    expect(isUpdateRequired("1.2.3", "0.0.0")).toBe(false);
  });
});
