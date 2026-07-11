import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  getUserExplorerData,
  parseExplorerFilters,
} from "@/lib/growth-queries";
import { EmptyState } from "@/components/admin/growth/metric-card";
import FilterBar from "./filter-bar";

/** Compact cell labels for classifyStage values. */
const STAGE_LABELS: Record<string, string> = {
  claimed_not_completed: "Claimed, not completed",
  completed_no_requests: "Completed, no requests",
  requests_no_approval: "Requests, none approved",
  activated: "Activated",
};

const RETENTION_LABELS: Record<string, string> = {
  active: "Active",
  churn_risk: "Churn risk",
  dormant: "Dormant",
  churned: "Churned",
  pre_activation: "Pre-activation",
};

const RETENTION_CLASS: Record<string, string> = {
  active: "text-brand-green",
  churn_risk: "text-foreground",
  dormant: "text-muted-foreground",
  churned: "text-brand-red",
  pre_activation: "text-muted-foreground",
};

/** Query keys forwarded into pagination and export links (the full explorer
 *  state plus the cockpit-wide range selection). */
const PERSISTED_KEYS = [
  "range",
  "from",
  "to",
  "stage",
  "retention",
  "source",
  "platform",
  "feature",
  "search",
  "claimedFrom",
  "claimedTo",
  "testers",
] as const;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function GrowthUsersPage({
  searchParams,
}: {
  // Framework contract: values can repeat (?search=a&search=b).
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
  });

  const raw = await searchParams;
  // Normalize repeated keys to their first value once, up front.
  const params: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    params[key] = Array.isArray(value) ? value[0] : value;
  }
  const context = await getGrowthContext(params);
  const filters = parseExplorerFilters(params);
  const data = await getUserExplorerData(context, filters);

  const query = new URLSearchParams();
  for (const key of PERSISTED_KEYS) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  const queryString = query.toString();
  const exportHref = `/admin/growth/users/export${queryString ? `?${queryString}` : ""}`;
  const pageHref = (page: number) => {
    const next = new URLSearchParams(query);
    if (page > 1) next.set("page", String(page));
    const nextString = next.toString();
    return `/admin/growth/users${nextString ? `?${nextString}` : ""}`;
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-6">
      <FilterBar sourceOptions={data.sourceOptions} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data.total === 1
            ? "1 artist matches."
            : `${data.total} artists match.`}
        </p>
        <a
          href={exportHref}
          className="text-xs text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground"
        >
          Download CSV
        </a>
      </div>

      {data.total === 0 ? (
        <EmptyState text="No artists match these filters." />
      ) : data.rows.length === 0 ? (
        <EmptyState text="No artists on this page." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Artist</th>
                <th className="px-3 py-2 text-left font-medium">Claimed</th>
                <th className="px-3 py-2 text-left font-medium">Stage</th>
                <th className="px-3 py-2 text-left font-medium">Retention</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-right font-medium">Requests</th>
                <th className="px-3 py-2 text-right font-medium">Approved</th>
                <th className="px-3 py-2 text-right font-medium">
                  Deposits paid
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  Lifecycle emails
                </th>
                <th className="px-3 py-2 text-right font-medium">Support</th>
                <th className="px-3 py-2 text-right font-medium">
                  Last activity
                </th>
                <th className="px-3 py-2 text-left font-medium">Mobile</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/accounts/${row.id}`}
                      className="text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                    >
                      {row.displayName}
                    </Link>
                    {row.isTester && (
                      <span className="ml-2 inline-block rounded-full bg-brand-mustard/20 px-1.5 py-0.5 align-middle text-[10px] font-medium text-brand-charcoal">
                        Tester
                      </span>
                    )}
                    <p className="font-mono text-xs text-muted-foreground">
                      {row.slug}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {fmtDate(row.claimedAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">
                    {STAGE_LABELS[row.stage] ?? row.stage}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 ${RETENTION_CLASS[row.retention] ?? "text-foreground"}`}
                  >
                    {RETENTION_LABELS[row.retention] ?? row.retention}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <span className="break-all">
                      {row.source === "unknown" ? "Unknown" : row.source}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.totalRequests}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.approvedRequests}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.depositsPaid}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.lifecycleSends}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.supportTickets}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {row.lastActivityDaysAgo === null
                      ? "never"
                      : `${row.lastActivityDaysAgo}d ago`}
                  </td>
                  <td className="px-3 py-2">
                    {row.mobile ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Mobile
                      </span>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs">
          {data.page > 1 ? (
            <Link
              href={pageHref(data.page - 1)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Previous
            </Link>
          ) : (
            <span className="text-muted-foreground/40">← Previous</span>
          )}
          <span className="text-muted-foreground">
            Page {data.page} of {totalPages}
          </span>
          {data.page < totalPages ? (
            <Link
              href={pageHref(data.page + 1)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Next →
            </Link>
          ) : (
            <span className="text-muted-foreground/40">Next →</span>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Source is first-touch attribution, captured from the 2026-07 cockpit
        release onward; earlier accounts read unknown. Last activity uses
        recorded actions, sign-ins, and app presence; presence is recorded from
        the cockpit release onward.
      </p>
    </div>
  );
}
