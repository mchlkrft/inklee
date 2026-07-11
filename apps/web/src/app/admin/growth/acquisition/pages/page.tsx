import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  waBreakdown,
  type WaBreakdownRow,
} from "@/lib/public-analytics/queries";
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

function LandingPagesTable({ rows }: { rows: WaBreakdownRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Landing page</th>
            <th className="px-3 py-2 text-right font-medium">Visitors</th>
            <th className="px-3 py-2 text-right font-medium">Visits</th>
            <th className="px-3 py-2 text-right font-medium">Signup starts</th>
            <th className="px-3 py-2 text-right font-medium">
              Signup completions
            </th>
            <th className="px-3 py-2 text-right font-medium">Conversion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dimension_value} className="border-t border-border">
              <td className="px-3 py-2 text-foreground">
                <span className="break-all">{row.dimension_value}</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.visitors}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.visits}
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
  );
}

function HostnamesTable({ rows }: { rows: WaBreakdownRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Hostname</th>
            <th className="px-3 py-2 text-right font-medium">Visitors</th>
            <th className="px-3 py-2 text-right font-medium">Visits</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dimension_value} className="border-t border-border">
              <td className="px-3 py-2 text-foreground">
                <span className="break-all">{row.dimension_value}</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.visitors}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.visits}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AcquisitionPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
    details: { section: "acquisition_pages" },
  });

  const params = await searchParams;
  const context = await getGrowthContext(params);
  const [landingPages, hostnames] = await Promise.all([
    waBreakdown(context, "landing_path", 200),
    waBreakdown(context, "hostname", 50),
  ]);

  const rangeSuffix = acquisitionRangeSuffix(params);
  const exportHref = `/admin/growth/acquisition/export?view=pages${
    rangeSuffix ? `&${rangeSuffix.slice(1)}` : ""
  }`;

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <AcquisitionNav active="pages" rangeSuffix={rangeSuffix} />
        <RangePicker />
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <SectionHeading>Landing pages</SectionHeading>
          <ExportLink href={exportHref} />
        </div>
        {landingPages.length > 0 ? (
          <>
            <LandingPagesTable rows={landingPages} />
            <p className="text-xs text-muted-foreground">
              First-party visits, each attributed to its landing page.
              Conversion is signup completions out of visits. Google clicks are
              a different measurement; see Search Console (delayed, source
              dates) on the Search tab.
            </p>
          </>
        ) : (
          <EmptyState text={NO_TRAFFIC_TEXT} />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading>Hostnames</SectionHeading>
        {hostnames.length > 0 ? (
          <>
            <HostnamesTable rows={hostnames} />
            <p className="text-xs text-muted-foreground">
              Subdomain hosts under inkl.ee are public artist booking pages (hub
              pages sit under l.inkl.ee); inklee.app is the marketing and
              product site.
            </p>
          </>
        ) : (
          <EmptyState text={NO_TRAFFIC_TEXT} />
        )}
      </section>
    </div>
  );
}
