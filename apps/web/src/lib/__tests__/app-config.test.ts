import { describe, it, expect } from "vitest";
import {
  CAPABILITIES,
  DEFAULT_APP_CONFIG,
  isCapability,
  isCapabilityEnabled,
  isUpdateRecommended,
  parseAppConfig,
  parseDisabledCapabilitiesList,
} from "@inklee/shared/app-config";

describe("parseAppConfig", () => {
  it("parses a well-formed payload", () => {
    expect(
      parseAppConfig({
        minVersion: "0.2.0",
        updateRequired: true,
        updateUrl: "https://inklee.app/download",
        recommendedVersion: "0.3.0",
        disabledCapabilities: ["deposits"],
      }),
    ).toEqual({
      minVersion: "0.2.0",
      updateRequired: true,
      updateUrl: "https://inklee.app/download",
      recommendedVersion: "0.3.0",
      disabledCapabilities: ["deposits"],
    });
  });

  it("fail-open: null / non-object / array payloads parse to defaults", () => {
    expect(parseAppConfig(null)).toEqual(DEFAULT_APP_CONFIG);
    expect(parseAppConfig(undefined)).toEqual(DEFAULT_APP_CONFIG);
    expect(parseAppConfig("nope")).toEqual(DEFAULT_APP_CONFIG);
    expect(parseAppConfig(42)).toEqual(DEFAULT_APP_CONFIG);
    expect(parseAppConfig([])).toEqual(DEFAULT_APP_CONFIG);
  });

  it("coerces wrong-typed fields to their defaults, per field", () => {
    const parsed = parseAppConfig({
      minVersion: 123,
      updateRequired: "yes", // only literal true blocks
      updateUrl: 0,
      recommendedVersion: false,
      disabledCapabilities: "deposits", // not an array
    });
    expect(parsed).toEqual(DEFAULT_APP_CONFIG);
  });

  it("drops unknown keys and empty/whitespace strings", () => {
    const parsed = parseAppConfig({
      minVersion: "  ",
      updateUrl: "",
      surprise: { deep: true },
      disabledCapabilities: ["  deposits  ", "", 7, null, "future_thing"],
    });
    expect(parsed.minVersion).toBe("0.0.0");
    expect(parsed.updateUrl).toBeNull();
    expect(parsed.disabledCapabilities).toEqual(["deposits", "future_thing"]);
    expect("surprise" in parsed).toBe(false);
  });
});

describe("isCapabilityEnabled", () => {
  it("is enabled by default and disabled only when listed", () => {
    expect(isCapabilityEnabled(DEFAULT_APP_CONFIG, "deposits")).toBe(true);
    expect(
      isCapabilityEnabled({ disabledCapabilities: ["deposits"] }, "deposits"),
    ).toBe(false);
    expect(
      isCapabilityEnabled(
        { disabledCapabilities: ["deposits"] },
        "instagram_import",
      ),
    ).toBe(true);
  });

  it("ignores names this build doesn't know (newer-server skew)", () => {
    expect(
      isCapabilityEnabled(
        { disabledCapabilities: ["hologram_mode"] },
        "deposits",
      ),
    ).toBe(true);
  });
});

describe("isUpdateRecommended", () => {
  it("nudges only when strictly older than the recommendation", () => {
    expect(isUpdateRecommended("0.1.0", "0.2.0")).toBe(true);
    expect(isUpdateRecommended("0.2.0", "0.2.0")).toBe(false);
    expect(isUpdateRecommended("0.3.0", "0.2.0")).toBe(false);
  });

  it("never nudges when unset", () => {
    expect(isUpdateRecommended("0.1.0", null)).toBe(false);
  });
});

describe("parseDisabledCapabilitiesList", () => {
  it("splits, trims, lowercases and drops empties", () => {
    expect(
      parseDisabledCapabilitiesList(" Deposits , instagram_import ,, "),
    ).toEqual(["deposits", "instagram_import"]);
  });

  it("fail-open on unset", () => {
    expect(parseDisabledCapabilitiesList(undefined)).toEqual([]);
    expect(parseDisabledCapabilitiesList(null)).toEqual([]);
    expect(parseDisabledCapabilitiesList("")).toEqual([]);
  });

  it("keeps unknown names (a newer build may know them; a typo disables nothing)", () => {
    expect(parseDisabledCapabilitiesList("depositz")).toEqual(["depositz"]);
  });
});

describe("capability registry", () => {
  it("registers exactly the documented capabilities", () => {
    // Lockstep with docs/architecture/capability-registry.md. The four BM-2.0
    // entitlement capabilities are dark-launched (parked in DISABLED_CAPABILITIES).
    expect(CAPABILITIES).toEqual([
      "deposits",
      "instagram_import",
      "branding",
      "custom_templates",
      "analytics",
      "entitlement_caps",
    ]);
    expect(isCapability("deposits")).toBe(true);
    expect(isCapability("entitlement_caps")).toBe(true);
    expect(isCapability("hologram_mode")).toBe(false);
  });
});
