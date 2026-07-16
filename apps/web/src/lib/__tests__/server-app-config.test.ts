import { describe, it, expect, afterEach, vi } from "vitest";
import {
  buildMobileAppConfig,
  getDisabledCapabilities,
  isCapabilityDisabled,
  resolveMinVersion,
} from "../server/app-config";
import {
  clientAppVersion,
  clientAtLeast,
  clientPlatform,
} from "../server/client-version";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDisabledCapabilities / isCapabilityDisabled", () => {
  it("fail-open: unset env disables nothing", () => {
    vi.stubEnv("DISABLED_CAPABILITIES", "");
    expect(getDisabledCapabilities()).toEqual([]);
    expect(isCapabilityDisabled("deposits")).toBe(false);
    expect(isCapabilityDisabled("instagram_import")).toBe(false);
  });

  it("parses the comma-separated list case-insensitively", () => {
    vi.stubEnv("DISABLED_CAPABILITIES", " Deposits ,instagram_import ");
    expect(isCapabilityDisabled("deposits")).toBe(true);
    expect(isCapabilityDisabled("instagram_import")).toBe(true);
  });

  it("a typo disables nothing (fail-open direction)", () => {
    vi.stubEnv("DISABLED_CAPABILITIES", "depositz");
    expect(isCapabilityDisabled("deposits")).toBe(false);
  });
});

describe("resolveMinVersion / buildMobileAppConfig", () => {
  it("disarmed by default: 0.0.0, nothing required, nothing disabled", () => {
    vi.stubEnv("MOBILE_MIN_VERSION", "");
    vi.stubEnv("MOBILE_MIN_VERSION_ANDROID", "");
    vi.stubEnv("MOBILE_RECOMMENDED_VERSION", "");
    vi.stubEnv("DISABLED_CAPABILITIES", "");
    const config = buildMobileAppConfig("android", "0.1.0");
    expect(config).toEqual({
      minVersion: "0.0.0",
      updateRequired: false,
      updateUrl: null,
      recommendedVersion: null,
      disabledCapabilities: [],
    });
  });

  it("per-platform min falls back to the shared min", () => {
    vi.stubEnv("MOBILE_MIN_VERSION", "0.2.0");
    vi.stubEnv("MOBILE_MIN_VERSION_ANDROID", "");
    vi.stubEnv("MOBILE_MIN_VERSION_IOS", "0.3.0");
    expect(resolveMinVersion("android")).toBe("0.2.0");
    expect(resolveMinVersion("ios")).toBe("0.3.0");
  });

  it("flags an older build as updateRequired and carries the kill list", () => {
    vi.stubEnv("MOBILE_MIN_VERSION_ANDROID", "0.2.0");
    vi.stubEnv("MOBILE_UPDATE_URL", "https://inklee.app/download");
    vi.stubEnv("MOBILE_RECOMMENDED_VERSION", "0.3.0");
    vi.stubEnv("DISABLED_CAPABILITIES", "deposits");
    const config = buildMobileAppConfig("android", "0.1.0");
    expect(config.updateRequired).toBe(true);
    expect(config.updateUrl).toBe("https://inklee.app/download");
    expect(config.recommendedVersion).toBe("0.3.0");
    expect(config.disabledCapabilities).toEqual(["deposits"]);
    expect(buildMobileAppConfig("android", "0.2.0").updateRequired).toBe(false);
  });
});

describe("client version negotiation", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://inklee.app/api/mobile/home", { headers });

  it("treats an absent/blank header as the oldest client", () => {
    expect(clientAppVersion(req({}))).toBe("0.0.0");
    expect(clientAppVersion(req({ "X-Inklee-App-Version": "  " }))).toBe(
      "0.0.0",
    );
    expect(clientAtLeast(req({}), "0.2.0")).toBe(false);
  });

  it("compares the sent version against the floor", () => {
    const at = (v: string) => req({ "X-Inklee-App-Version": v });
    expect(clientAtLeast(at("0.2.0"), "0.2.0")).toBe(true);
    expect(clientAtLeast(at("0.3.1"), "0.2.0")).toBe(true);
    expect(clientAtLeast(at("0.1.9"), "0.2.0")).toBe(false);
    // Malformed versions parse as 0 segments — i.e. oldest, most conservative.
    expect(clientAtLeast(at("garbage"), "0.2.0")).toBe(false);
  });

  it("reads the platform header, defaulting to unknown", () => {
    expect(clientPlatform(req({ "X-Inklee-Platform": "android" }))).toBe(
      "android",
    );
    expect(clientPlatform(req({ "X-Inklee-Platform": "IOS" }))).toBe("ios");
    expect(clientPlatform(req({}))).toBe("unknown");
  });
});
