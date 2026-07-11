/**
 * Growth cockpit settings: defaults live here in code; overrides live in the
 * growth_settings table (key/value jsonb, service-role only) and are edited on
 * /admin/growth/settings. parse/merge logic is pure and unit-tested; only
 * loadGrowthSettings/saveGrowthSetting touch the database.
 */

import "server-only";
import { cache } from "react";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/service";

export const growthSettingsSchema = z.object({
  /** All cockpit dates/buckets are reported in this timezone. */
  reporting_timezone: z.string().min(1),
  /** Meaningful activity within this many days = active. */
  active_days: z.number().int().min(1).max(365),
  /** Activated + silent for more than this = churn risk. */
  churn_risk_days: z.number().int().min(1).max(365),
  /** Silent for at least this = dormant. */
  dormant_days: z.number().int().min(1).max(730),
  /** Silent for at least this = churned. */
  churned_days: z.number().int().min(1).max(1095),
  /** Activity after a gap of at least this = reactivated. */
  reactivation_gap_days: z.number().int().min(1).max(365),
  /** Outcomes within this many days of an email send count as associated. */
  email_attribution_window_days: z.number().int().min(1).max(90),
  /** Below this sample size, rates carry an explicit warning. */
  min_sample_size: z.number().int().min(1).max(1000),
  /** Relative change (percent) that makes a metric movement an insight. */
  insight_change_threshold_pct: z.number().int().min(1).max(500),
});

export type GrowthSettings = z.infer<typeof growthSettingsSchema>;

export const GROWTH_SETTINGS_DEFAULTS: GrowthSettings = {
  reporting_timezone: "Europe/Berlin",
  active_days: 14,
  churn_risk_days: 21,
  dormant_days: 30,
  churned_days: 90,
  reactivation_gap_days: 30,
  email_attribution_window_days: 7,
  min_sample_size: 5,
  insight_change_threshold_pct: 20,
};

/** Pure: merge stored rows over defaults, dropping invalid values. */
export function mergeGrowthSettings(
  rows: { key: string; value: unknown }[],
): GrowthSettings {
  const merged: Record<string, unknown> = { ...GROWTH_SETTINGS_DEFAULTS };
  for (const row of rows) {
    // Object.hasOwn (not `in`): prototype-chain keys like "__proto__" or
    // "toString" must never pass the known-key guard.
    if (Object.hasOwn(GROWTH_SETTINGS_DEFAULTS, row.key)) {
      merged[row.key] = row.value;
    }
  }
  const parsed = growthSettingsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  // A single bad stored value must not take the cockpit down: fall back to
  // defaults for invalid keys only.
  const safe: Record<string, unknown> = { ...GROWTH_SETTINGS_DEFAULTS };
  for (const row of rows) {
    if (!Object.hasOwn(GROWTH_SETTINGS_DEFAULTS, row.key)) continue;
    const single = growthSettingsSchema.shape[
      row.key as keyof GrowthSettings
    ].safeParse(row.value);
    if (single.success) safe[row.key] = single.data;
  }
  return growthSettingsSchema.parse(safe);
}

/** Request-deduped settings load (React cache). */
export const loadGrowthSettings = cache(async (): Promise<GrowthSettings> => {
  const { data } = await serviceClient
    .from("growth_settings")
    .select("key, value");
  return mergeGrowthSettings(data ?? []);
});

/** Validated single-key write; returns an error string for the settings form. */
export async function saveGrowthSetting(
  key: string,
  value: unknown,
  adminId: string,
): Promise<string | null> {
  if (!Object.hasOwn(GROWTH_SETTINGS_DEFAULTS, key)) return "Unknown setting.";
  const single =
    growthSettingsSchema.shape[key as keyof GrowthSettings].safeParse(value);
  if (!single.success) return "Invalid value for this setting.";
  const { error } = await serviceClient.from("growth_settings").upsert({
    key,
    value: single.data,
    updated_at: new Date().toISOString(),
    updated_by: adminId,
  });
  return error ? "Could not save the setting." : null;
}
