// settings.ts imports "server-only" (aliased to a no-op in vitest.config.ts)
// and the service client (build-safe env placeholders), so importing the pure
// exports here is safe; only mergeGrowthSettings and the schema are tested.
import { describe, expect, it } from "vitest";
import {
  GROWTH_SETTINGS_DEFAULTS,
  growthSettingsSchema,
  mergeGrowthSettings,
} from "../settings";

describe("mergeGrowthSettings", () => {
  it("returns the defaults on empty input", () => {
    expect(mergeGrowthSettings([])).toEqual(GROWTH_SETTINGS_DEFAULTS);
  });

  it("applies valid overrides over the defaults", () => {
    const merged = mergeGrowthSettings([
      { key: "active_days", value: 7 },
      { key: "reporting_timezone", value: "UTC" },
    ]);
    expect(merged.active_days).toBe(7);
    expect(merged.reporting_timezone).toBe("UTC");
    // Untouched keys keep their defaults.
    expect(merged.min_sample_size).toBe(
      GROWTH_SETTINGS_DEFAULTS.min_sample_size,
    );
    expect(merged.churned_days).toBe(GROWTH_SETTINGS_DEFAULTS.churned_days);
  });

  it("drops an invalid single value while keeping other valid overrides", () => {
    const merged = mergeGrowthSettings([
      { key: "active_days", value: 0 }, // below the schema minimum of 1
      { key: "min_sample_size", value: 10 },
    ]);
    expect(merged.active_days).toBe(GROWTH_SETTINGS_DEFAULTS.active_days);
    expect(merged.min_sample_size).toBe(10);
  });

  it("drops values of the wrong type", () => {
    const merged = mergeGrowthSettings([
      { key: "active_days", value: "seven" },
      { key: "reporting_timezone", value: 42 },
    ]);
    expect(merged).toEqual(GROWTH_SETTINGS_DEFAULTS);
  });

  it("drops non-integer and out-of-range numbers", () => {
    const merged = mergeGrowthSettings([
      { key: "active_days", value: 7.5 },
      { key: "churned_days", value: 5000 }, // above the schema maximum
      { key: "insight_change_threshold_pct", value: 50 },
    ]);
    expect(merged.active_days).toBe(GROWTH_SETTINGS_DEFAULTS.active_days);
    expect(merged.churned_days).toBe(GROWTH_SETTINGS_DEFAULTS.churned_days);
    expect(merged.insight_change_threshold_pct).toBe(50);
  });

  it("drops null stored values back to the default", () => {
    const merged = mergeGrowthSettings([{ key: "dormant_days", value: null }]);
    expect(merged.dormant_days).toBe(GROWTH_SETTINGS_DEFAULTS.dormant_days);
  });

  it("ignores unknown keys entirely", () => {
    const merged = mergeGrowthSettings([
      { key: "evil_key", value: 123 },
      { key: "__proto__", value: { polluted: true } },
    ]);
    expect(merged).toEqual(GROWTH_SETTINGS_DEFAULTS);
    expect("evil_key" in merged).toBe(false);
  });

  it("handles a mix of valid, invalid and unknown rows in one pass", () => {
    const merged = mergeGrowthSettings([
      { key: "email_attribution_window_days", value: 14 },
      { key: "churn_risk_days", value: -1 },
      { key: "not_a_setting", value: "ignored" },
      { key: "reactivation_gap_days", value: 45 },
    ]);
    expect(merged.email_attribution_window_days).toBe(14);
    expect(merged.churn_risk_days).toBe(
      GROWTH_SETTINGS_DEFAULTS.churn_risk_days,
    );
    expect(merged.reactivation_gap_days).toBe(45);
    expect("not_a_setting" in merged).toBe(false);
  });

  it("does not mutate the defaults object", () => {
    const before = { ...GROWTH_SETTINGS_DEFAULTS };
    mergeGrowthSettings([{ key: "active_days", value: 99 }]);
    expect(GROWTH_SETTINGS_DEFAULTS).toEqual(before);
  });
});

describe("growthSettingsSchema", () => {
  it("accepts the defaults", () => {
    expect(
      growthSettingsSchema.safeParse(GROWTH_SETTINGS_DEFAULTS).success,
    ).toBe(true);
  });

  it("rejects an object with an out-of-range value", () => {
    expect(
      growthSettingsSchema.safeParse({
        ...GROWTH_SETTINGS_DEFAULTS,
        min_sample_size: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects an empty timezone", () => {
    expect(
      growthSettingsSchema.safeParse({
        ...GROWTH_SETTINGS_DEFAULTS,
        reporting_timezone: "",
      }).success,
    ).toBe(false);
  });
});
