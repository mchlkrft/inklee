import { requireAdmin } from "@/lib/admin-guard";
import {
  GROWTH_SETTINGS_DEFAULTS,
  loadGrowthSettings,
  type GrowthSettings,
} from "@/lib/growth/settings";
import { SectionHeading } from "@/components/admin/growth/metric-card";
import SettingsForm from "./settings-form";

/** Label + plain-language description per editable setting. Values themselves
 *  come from loadGrowthSettings (stored overrides merged over defaults). */
const SETTING_ROWS: {
  key: keyof GrowthSettings;
  label: string;
  description: string;
  inputType: "text" | "number";
}[] = [
  {
    key: "reporting_timezone",
    label: "Reporting timezone",
    description:
      "All cockpit dates, buckets, and day boundaries are computed in this timezone (IANA name, for example Europe/Berlin).",
    inputType: "text",
  },
  {
    key: "active_days",
    label: "Active days",
    description:
      "Meaningful activity within this many days counts an artist as active.",
    inputType: "number",
  },
  {
    key: "churn_risk_days",
    label: "Churn risk days",
    description:
      "An activated artist silent for more than this many days counts as at churn risk.",
    inputType: "number",
  },
  {
    key: "dormant_days",
    label: "Dormant days",
    description:
      "An artist silent for at least this many days counts as dormant.",
    inputType: "number",
  },
  {
    key: "churned_days",
    label: "Churned days",
    description:
      "An artist silent for at least this many days counts as churned.",
    inputType: "number",
  },
  {
    key: "reactivation_gap_days",
    label: "Reactivation gap days",
    description:
      "Activity after a silent gap of at least this many days counts as a reactivation.",
    inputType: "number",
  },
  {
    key: "email_attribution_window_days",
    label: "Email attribution window days",
    description:
      "Outcomes within this many days of a lifecycle email send count as associated conversions (associations, not proof of cause).",
    inputType: "number",
  },
  {
    key: "min_sample_size",
    label: "Minimum sample size",
    description:
      "Rates and percentages resting on fewer data points than this carry an explicit small-sample warning.",
    inputType: "number",
  },
  {
    key: "insight_change_threshold_pct",
    label: "Insight change threshold (percent)",
    description:
      "A metric must move by at least this percent versus the previous period to surface as an insight.",
    inputType: "number",
  },
];

export default async function GrowthSettingsPage() {
  await requireAdmin();
  const settings = await loadGrowthSettings();

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <SectionHeading>Thresholds and definitions</SectionHeading>
        <div className="divide-y divide-border rounded-md border border-border">
          {SETTING_ROWS.map((row) => (
            <div
              key={row.key}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="sm:max-w-md">
                <p className="text-sm font-medium text-foreground">
                  {row.label}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.description}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Current:{" "}
                  <span className="tabular-nums text-foreground">
                    {String(settings[row.key])}
                  </span>{" "}
                  · Default: {String(GROWTH_SETTINGS_DEFAULTS[row.key])}
                </p>
              </div>
              <SettingsForm
                settingKey={row.key}
                currentValue={settings[row.key]}
                inputType={row.inputType}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading>Exclusions</SectionHeading>
        <div className="rounded-md border border-border p-5">
          <p className="text-sm text-foreground">
            Some accounts are always excluded from cockpit numbers.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-muted-foreground">
            <li>
              Tester accounts (profiles.is_tester) and accounts whose email is
              listed in ADMIN_EMAILS are always excluded from metrics and from
              event recording.
            </li>
            <li>Suspended and deleted accounts are excluded from counts.</li>
            <li>
              These are code-level rules, not settings; they cannot be changed
              on this page.
            </li>
          </ul>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Threshold changes apply immediately to all cockpit views and do not
        rewrite the daily snapshots.
      </p>
    </div>
  );
}
