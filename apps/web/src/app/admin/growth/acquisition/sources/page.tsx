import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  waBreakdown,
  waCampaigns,
  type WaBreakdownRow,
} from "@/lib/public-analytics/queries";
import type { Channel } from "@/lib/public-analytics/channels";
import { rate } from "@/lib/growth/metrics";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  SectionHeading,
} from "@/components/admin/growth/metric-card";
import AcquisitionNav, { acquisitionRangeSuffix } from "../acquisition-nav";

/** "–" is the standing placeholder for a rate with no denominator. */
function pctCell(value: number | null): string {
  return value === null ? "–" : `${value}%`;
}

const NO_TRAFFIC_TEXT = "No public traffic recorded in this period.";

/** Display labels for the channel vocabulary in channels.ts; unknown values
 *  (e.g. "(none)") fall through unchanged. */
const CHANNEL_LABELS: Record<Channel, string> = {
  direct: "Direct",
  organic_search: "Organic search",
  paid_search: "Paid search",
  organic_social: "Organic social",
  paid_social: "Paid social",
  email: "Email",
  referral: "Referral",
  other: "Other",
};

function channelLabel(value: string): string {
  return (CHANNEL_LABELS as Record<string, string>)[value] ?? value;
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryLabel(code: string): string {
  if (!/^[a-z]{2}$/i.test(code)) return code;
  const upper = code.toUpperCase();
  try {
    const name = regionNames.of(upper);
    return name && name !== upper ? `${name} (${upper})` : upper;
  } catch {
    return code;
  }
}

function deviceLabel(value: string): string {
  if (!/^[a-z]/.test(value)) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ExportLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="text-xs text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground"
    >
      Download CSV
    </a>
  );
}

/** Shared breakdown table: dimension, visitors, then optional visits,
 *  signup completions, and an optional completions-out-of-visits rate. */
function BreakdownTable({
  dimensionHeader,
  rows,
  showVisits = false,
  showConversion = false,
  formatDimension = (value: string) => value,
}: {
  dimensionHeader: string;
  rows: WaBreakdownRow[];
  showVisits?: boolean;
  showConversion?: boolean;
  formatDimension?: (value: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">
              {dimensionHeader}
            </th>
            <th className="px-3 py-2 text-right font-medium">Visitors</th>
            {showVisits && (
              <th className="px-3 py-2 text-right font-medium">Visits</th>
            )}
            <th className="px-3 py-2 text-right font-medium">
              Signup completions
            </th>
            {showConversion && (
              <th className="px-3 py-2 text-right font-medium">Conversion</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dimension_value} className="border-t border-border">
              <td className="px-3 py-2 text-foreground">
                <span className="break-all">
                  {formatDimension(row.dimension_value)}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.visitors}
              </td>
              {showVisits && (
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.visits}
                </td>
              )}
              <td className="px-3 py-2 text-right tabular-nums">
                {row.signup_completions}
              </td>
              {showConversion && (
                <td className="px-3 py-2 text-right tabular-nums">
                  {pctCell(rate(row.signup_completions, row.visits))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AcquisitionSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
    details: { section: "acquisition_sources" },
  });

  const params = await searchParams;
  const context = await getGrowthContext(params);
  const [channels, referrers, countries, devices, campaigns] =
    await Promise.all([
      waBreakdown(context, "channel", 50),
      waBreakdown(context, "referrer_domain", 100),
      waBreakdown(context, "country_code", 100),
      waBreakdown(context, "device_type", 10),
      waCampaigns(context, 200),
    ]);

  const rangeSuffix = acquisitionRangeSuffix(params);
  const exportHref = (view: string) =>
    `/admin/growth/acquisition/export?view=${view}${
      rangeSuffix ? `&${rangeSuffix.slice(1)}` : ""
    }`;

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <AcquisitionNav active="sources" rangeSuffix={rangeSuffix} />
        <RangePicker />
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <SectionHeading>Channels</SectionHeading>
          <ExportLink href={exportHref("channels")} />
        </div>
        {channels.length > 0 ? (
          <>
            <BreakdownTable
              dimensionHeader="Channel"
              rows={channels}
              showVisits
              showConversion
              formatDimension={channelLabel}
            />
            <p className="text-xs text-muted-foreground">
              Conversion is signup completions out of visits. Organic search
              here counts first-party visits, not Google clicks; see Search
              Console (delayed, source dates) on the Search tab.
            </p>
          </>
        ) : (
          <EmptyState text={NO_TRAFFIC_TEXT} />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <SectionHeading>Referrers</SectionHeading>
          <ExportLink href={exportHref("referrers")} />
        </div>
        {referrers.length > 0 ? (
          <>
            <BreakdownTable
              dimensionHeader="Referrer domain"
              rows={referrers}
              showConversion
            />
            <p className="text-xs text-muted-foreground">
              (none) marks visits that arrived without a referrer.
            </p>
          </>
        ) : (
          <EmptyState text={NO_TRAFFIC_TEXT} />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <SectionHeading>Campaigns</SectionHeading>
          <ExportLink href={exportHref("campaigns")} />
        </div>
        {campaigns.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">
                    UTM source
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    UTM medium
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    UTM campaign
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Visitors</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Signup starts
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Signup completions
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Conversion
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((row) => (
                  <tr
                    key={`${row.utm_source}|${row.utm_medium}|${row.utm_campaign}`}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-2 text-foreground">
                      <span className="break-all">{row.utm_source}</span>
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      <span className="break-all">{row.utm_medium}</span>
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      <span className="break-all">{row.utm_campaign}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.visitors}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.signup_starts}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.signup_completions}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pctCell(rate(row.signup_completions, row.visits))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="No campaign-tagged traffic in this period." />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <SectionHeading>Geography</SectionHeading>
          <ExportLink href={exportHref("geo")} />
        </div>
        {countries.length > 0 ? (
          <BreakdownTable
            dimensionHeader="Country"
            rows={countries}
            formatDimension={countryLabel}
          />
        ) : (
          <EmptyState text={NO_TRAFFIC_TEXT} />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <SectionHeading>Devices</SectionHeading>
          <ExportLink href={exportHref("devices")} />
        </div>
        {devices.length > 0 ? (
          <BreakdownTable
            dimensionHeader="Device"
            rows={devices}
            showConversion
            formatDimension={deviceLabel}
          />
        ) : (
          <EmptyState text={NO_TRAFFIC_TEXT} />
        )}
      </section>
    </div>
  );
}
