import { requireAdmin } from "@/lib/admin-guard";
import {
  GROWTH_SETTINGS_DEFAULTS,
  loadGrowthSettings,
  type GrowthSettings,
} from "@/lib/growth/settings";
import { getWaDiagnostics } from "@/lib/public-analytics/queries";
import { SectionHeading } from "@/components/admin/growth/metric-card";
import InternalExclusionToggle from "@/components/admin/growth/internal-exclusion-toggle";
import SettingsForm from "./settings-form";

/** ISO timestamp to a compact UTC label (the diagnostics day is a UTC day). */
function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

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
  const diagnostics = await getWaDiagnostics();

  const rejectionRows = diagnostics.rejectionsToday
    ? [
        {
          label: "Bot filtered",
          count: diagnostics.rejectionsToday.bot_rejected,
        },
        {
          label: "Invalid payload",
          count: diagnostics.rejectionsToday.invalid_payload,
        },
        {
          label: "Internal browser",
          count: diagnostics.rejectionsToday.internal_rejected,
        },
        {
          label: "Unsupported hostname",
          count: diagnostics.rejectionsToday.unsupported_hostname,
        },
      ]
    : null;

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

      <section className="space-y-3">
        <SectionHeading>Public analytics</SectionHeading>
        <InternalExclusionToggle />

        <div className="rounded-md border border-border p-5 space-y-4">
          <p className="text-sm font-medium text-foreground">
            Collector diagnostics
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">
                Collector configured
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                {diagnostics.collectorConfigured
                  ? "Yes"
                  : "No (WA_VISITOR_HASH_SECRET is not set)"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Last event received
              </p>
              <p className="mt-0.5 text-sm tabular-nums text-foreground">
                {diagnostics.lastEventAt
                  ? formatUtc(diagnostics.lastEventAt)
                  : "No events received yet."}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Events today (UTC day)
              </p>
              <p className="mt-0.5 text-sm tabular-nums text-foreground">
                {diagnostics.eventsToday}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Rejections today (UTC day), by reason
            </p>
            {rejectionRows ? (
              <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
                {rejectionRows.map((row) => (
                  <li key={row.label} className="text-sm text-muted-foreground">
                    {row.label}:{" "}
                    <span className="tabular-nums text-foreground">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                No rejections recorded today.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-border p-5">
          <p className="text-sm text-foreground">
            The collector never stores raw IP addresses, full user agents, full
            referrer URLs, form content, or persistent identifiers.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Visitors are counted through a daily-rotating anonymous hash,
            referrers are reduced to their domain, and query strings are
            stripped from paths. The full behaviour and the public event
            registry are documented in docs/public-analytics.md.
          </p>
        </div>
      </section>
    </div>
  );
}
