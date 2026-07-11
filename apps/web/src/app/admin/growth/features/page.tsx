import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  getFeatureAdoptionData,
  type FeatureAdoptionEntry,
} from "@/lib/growth-queries";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  SectionHeading,
} from "@/components/admin/growth/metric-card";

/**
 * Feature keys the user explorer can filter by (mirrors FEATURE_PREDICATES in
 * growth-queries.ts). Keys outside this set (booking_page) render as plain
 * text instead of a link.
 */
const EXPLORER_FEATURE_KEYS = new Set([
  "slots",
  "flash",
  "guest_spots",
  "waitlist",
  "deposits",
  "instagram",
  "custom_form",
  "email_templates",
  "mobile_app",
  "support",
  "books_open",
]);

/** "–" is the standing placeholder for a value with no denominator. */
function pctCell(value: number | null): string {
  return value === null ? "–" : `${value}%`;
}

function FirstUseCell({ entry }: { entry: FeatureAdoptionEntry }) {
  if (entry.firstUseUnknown) {
    return (
      <span
        title="First-use timestamps do not exist for this feature's historical data."
        className="cursor-help text-muted-foreground"
      >
        Not recorded
      </span>
    );
  }
  if (entry.medianDaysToFirstUse === null) return <>–</>;
  return <>{entry.medianDaysToFirstUse}</>;
}

export default async function GrowthFeaturesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
  });

  const params = await searchParams;
  const context = await getGrowthContext(params);
  const data = await getFeatureAdoptionData(context);

  // Keep the selected range in cross-section links so the cockpit stays on
  // one time window while navigating.
  const rangeQuery = new URLSearchParams();
  if (params.range) rangeQuery.set("range", params.range);
  if (params.from) rangeQuery.set("from", params.from);
  if (params.to) rangeQuery.set("to", params.to);
  const rangeSuffix = rangeQuery.toString() ? `&${rangeQuery.toString()}` : "";
  const featureHref = (key: string) =>
    `/admin/growth/users?feature=${encodeURIComponent(key)}${rangeSuffix}`;
  const definitionsHref = `/admin/growth/definitions${
    rangeQuery.toString() ? `?${rangeQuery.toString()}` : ""
  }`;

  const hasData = data.features.some((entry) => entry.eligible > 0);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <RangePicker />
        <p className="text-xs text-muted-foreground">
          Feature adoption is measured across all artists over all time, the
          selected range does not filter this table yet.
        </p>
      </div>

      <div className="rounded-md border border-brand-mustard/40 bg-brand-mustard/10 px-4 py-3">
        <p className="text-sm text-foreground">{data.associationNote}</p>
      </div>

      {!hasData ? (
        <EmptyState text="No artists to measure yet." />
      ) : (
        <section className="space-y-3">
          <SectionHeading>Feature matrix</SectionHeading>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Feature</th>
                  <th className="px-3 py-2 text-right font-medium">Eligible</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Configured
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Used</th>
                  <th className="px-3 py-2 text-right font-medium">Repeat</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Adoption %
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Median days to first use
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Active % among users
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Active % among non-users
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.features.map((entry) => (
                  <tr key={entry.key} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">
                      {EXPLORER_FEATURE_KEYS.has(entry.key) ? (
                        <Link
                          href={featureHref(entry.key)}
                          className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                        >
                          {entry.label}
                        </Link>
                      ) : (
                        entry.label
                      )}
                      {entry.smallSample && (
                        <span
                          title="Fewer users than the minimum sample size; read the percentage columns as anecdotal."
                          className="ml-2 inline-block cursor-help whitespace-nowrap rounded-full bg-muted px-1.5 py-0.5 align-middle text-[10px] text-muted-foreground"
                        >
                          Small sample
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {entry.eligible}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {entry.configured}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {entry.used}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {entry.repeat}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pctCell(entry.adoptionPct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <FirstUseCell entry={entry} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pctCell(entry.adopterActivePct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pctCell(entry.nonAdopterActivePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            How &quot;used&quot; is defined for each feature lives on the{" "}
            <Link
              href={definitionsHref}
              className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
            >
              definitions tab
            </Link>
            .
          </p>
        </section>
      )}
    </div>
  );
}
