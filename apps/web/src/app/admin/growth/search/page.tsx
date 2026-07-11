import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getGrowthContext,
  getGscConnectionState,
  gscTotalsSeries,
  gscWindowFor,
  type GscTotalsRow,
} from "@/lib/public-analytics/queries";
import { compare } from "@/lib/growth/metrics";
import RangePicker from "@/components/admin/growth/range-picker";
import {
  EmptyState,
  MetricCard,
  SectionHeading,
} from "@/components/admin/growth/metric-card";
import { BarSeries } from "@/components/admin/growth/sparkline";
import SearchNav from "./search-nav";
import ConnectionPanel from "./connection-panel";

const DELAY_NOTE =
  "Search Console data is delayed (finalized source dates, typically 2 to 3 days behind). Google clicks are Google's measurement; they are never merged with first-party visits.";

/** "YYYY-MM-DD HH:MM UTC" from a stored timestamptz, or the placeholder. */
function formatTimestamp(iso: string | null): string {
  if (!iso) return "–";
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function daysInclusive(fromDay: string, toDay: string): number {
  return (
    Math.round(
      (new Date(`${toDay}T00:00:00Z`).getTime() -
        new Date(`${fromDay}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1
  );
}

/** Window sums. CTR and position are null (not 0) without impressions;
 *  position is the impression-weighted average, matching how Search Console
 *  aggregates multi-day windows. */
function sumWindow(rows: GscTotalsRow[]): {
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
} {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weightedPosition += row.average_position * row.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position: impressions > 0 ? weightedPosition / impressions : null,
  };
}

/** Percent change; null (delta hidden) when either side is missing or the
 *  previous value is 0, per the honest-comparisons rule. */
function relativeDelta(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** One-line notice for the ?gsc= flag set by the OAuth connect/callback routes. */
function GscNotice({ flag }: { flag?: string }) {
  if (!flag) return null;
  const good = flag === "connected" || flag === "select-property";
  let text: string;
  switch (flag) {
    case "connected":
      text = "Search Console connected.";
      break;
    case "select-property":
      text =
        "Search Console connected. Select a property below to start syncing.";
      break;
    case "state-mismatch":
      text =
        "The connection attempt could not be verified (state mismatch). Try connecting again.";
      break;
    case "exchange-failed":
      text =
        "Google did not accept the authorization code. Try connecting again.";
      break;
    case "not-configured":
      text =
        "Search Console credentials are missing on the server. Setup steps are in docs/public-analytics.md.";
      break;
    default:
      if (!flag.startsWith("error-")) return null;
      text = `Google returned an error: ${flag.slice("error-".length).slice(0, 80)}.`;
  }
  return (
    <p
      className={`rounded-md border px-3 py-2 text-xs ${
        good
          ? "border-brand-green/40 bg-brand-green/10 text-foreground"
          : "border-brand-red/40 bg-brand-red/10 text-foreground"
      }`}
    >
      {text}
    </p>
  );
}

function NotConfiguredCard() {
  return (
    <section className="rounded-md border border-border p-5 space-y-2">
      <SectionHeading>Search Console</SectionHeading>
      <p className="text-sm text-foreground">
        Search Console is not configured on this deployment.
      </p>
      <p className="text-sm text-muted-foreground">
        Set GOOGLE_SEARCH_CONSOLE_CLIENT_ID, GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET
        and GOOGLE_SEARCH_CONSOLE_TOKEN_ENCRYPTION_SECRET, then redeploy. Setup
        steps are in docs/public-analytics.md.
      </p>
    </section>
  );
}

export default async function GrowthSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    gsc?: string;
  }>;
}) {
  const adminId = await requireAdmin();
  void writeAudit({
    action: "admin_growth_accessed",
    actor: adminId,
    category: "admin",
    details: { section: "search" },
  });

  const params = await searchParams;
  const state = await getGscConnectionState();

  // --- Not connected: configuration and connect states. ---------------------
  if (!state.connected) {
    return (
      <div className="space-y-6">
        <SearchNav active="overview" params={params} />
        <GscNotice flag={params.gsc} />
        {state.configured ? (
          <section className="rounded-md border border-border p-5 space-y-3">
            <SectionHeading>Search Console</SectionHeading>
            <p className="text-sm text-muted-foreground">
              Connect the Google account that has Search Console access to the
              site. Only aggregated daily metrics are synced; the OAuth token is
              stored encrypted and never reaches the browser.
            </p>
            {/* Plain anchor, not next/link: this is an API route that performs
                a server-side OAuth redirect, not an in-app page navigation. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/admin/gsc/connect"
              className="inline-flex rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Connect Google Search Console
            </a>
          </section>
        ) : (
          <NotConfiguredCard />
        )}
        <p className="text-xs text-muted-foreground">{DELAY_NOTE}</p>
      </div>
    );
  }

  // --- Connected, no active property: pick one. ------------------------------
  if (!state.activeProperty) {
    return (
      <div className="space-y-6">
        <SearchNav active="overview" params={params} />
        <GscNotice flag={params.gsc} />
        {!state.configured && <NotConfiguredCard />}
        <section className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>Select a property</SectionHeading>
          {state.properties.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Choose which Search Console property the cockpit reads. Syncing
              starts once a property is active.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              The connected Google account has no Search Console properties.
              Grant it access in Search Console, or disconnect and connect a
              different account.
            </p>
          )}
          <ConnectionPanel
            properties={state.properties}
            hasActiveProperty={false}
          />
        </section>
        <p className="text-xs text-muted-foreground">{DELAY_NOTE}</p>
      </div>
    );
  }

  // --- Property active: KPIs, trends, sync status. ---------------------------
  const context = await getGrowthContext(params);
  const window = gscWindowFor(context, state.latestSourceDate);
  const [currentRows, previousRows] = window
    ? await Promise.all([
        gscTotalsSeries(state.activeProperty.id, window.fromDay, window.toDay),
        gscTotalsSeries(
          state.activeProperty.id,
          window.previousFromDay,
          window.previousToDay,
        ),
      ])
    : [[], []];

  const current = sumWindow(currentRows);
  const previous = sumWindow(previousRows);
  const clicksCmp = compare(current.clicks, previous.clicks);
  const impressionsCmp = compare(current.impressions, previous.impressions);
  const ctrDelta = relativeDelta(current.ctr, previous.ctr);
  const positionDelta = relativeDelta(current.position, previous.position);

  const backfillText = (() => {
    if (!state.backfill) return "No backfill started yet.";
    const total = daysInclusive(state.backfill.fromDate, state.backfill.toDate);
    if (state.backfill.status === "running") {
      return `Running: ${state.backfill.datesDone} of ${total} days.`;
    }
    return `Last backfill ${state.backfill.status}: ${state.backfill.datesDone} of ${total} days (${state.backfill.fromDate} to ${state.backfill.toDate}).`;
  })();

  const emptyText = !window
    ? state.latestSourceDate === null
      ? "No Search Console days synced yet. Run a sync or start a backfill below."
      : `The selected range starts after the latest synced day (${state.latestSourceDate}). Search Console data is delayed.`
    : `No synced days between ${window.fromDay} and ${window.toDay}. A backfill can fill older dates.`;

  const hasData = window !== null && currentRows.length > 0;

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <SearchNav active="overview" params={params} />
        <GscNotice flag={params.gsc} />
        {!state.configured && <NotConfiguredCard />}
        <RangePicker />
        <p className="text-xs text-muted-foreground">{DELAY_NOTE}</p>
      </div>

      <section className="space-y-3">
        <SectionHeading>Search Console (delayed, source dates)</SectionHeading>
        {hasData && window ? (
          <>
            <p className="text-xs text-muted-foreground">
              Source dates {window.fromDay} to {window.toDay} for{" "}
              {state.activeProperty.siteUrl}. Deltas compare the{" "}
              {daysInclusive(window.fromDay, window.toDay)} source days
              immediately before.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <MetricCard
                label="Google clicks"
                value={current.clicks}
                deltaPct={clicksCmp.deltaPct}
              />
              <MetricCard
                label="Impressions"
                value={current.impressions}
                deltaPct={impressionsCmp.deltaPct}
              />
              <MetricCard
                label="CTR"
                value={
                  current.ctr !== null
                    ? `${(current.ctr * 100).toFixed(1)}%`
                    : "–"
                }
                deltaPct={ctrDelta}
              />
              <MetricCard
                label="Average position"
                value={
                  current.position !== null ? current.position.toFixed(1) : "–"
                }
                deltaPct={positionDelta}
                deltaInverted
                sub={
                  previous.position !== null
                    ? `previous ${previous.position.toFixed(1)}`
                    : "lower is better"
                }
              />
              <MetricCard
                label="Latest source date"
                value={state.latestSourceDate ?? "–"}
                sub="most recent synced day"
              />
            </div>
          </>
        ) : (
          <EmptyState text={emptyText} />
        )}
      </section>

      {hasData && (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-md border border-border p-5 space-y-3">
            <SectionHeading>Google clicks per source date</SectionHeading>
            <BarSeries
              values={currentRows.map((row) => row.clicks)}
              labels={currentRows.map((row) => row.source_date)}
            />
          </div>
          <div className="rounded-md border border-border p-5 space-y-3">
            <SectionHeading>Impressions per source date</SectionHeading>
            <BarSeries
              values={currentRows.map((row) => row.impressions)}
              labels={currentRows.map((row) => row.source_date)}
            />
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>Sync status</SectionHeading>
          <dl className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Last successful sync</dt>
              <dd className="text-right tabular-nums text-foreground">
                {formatTimestamp(state.lastSuccessfulSyncAt)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Last failed sync</dt>
              <dd className="text-right tabular-nums text-foreground">
                {formatTimestamp(state.lastFailedSyncAt)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">Last error</dt>
              <dd className="min-w-0 break-words text-right text-foreground">
                {state.lastError ?? "–"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">Backfill</dt>
              <dd className="min-w-0 text-right text-foreground">
                {backfillText}
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-md border border-border p-5 space-y-3">
          <SectionHeading>Connection</SectionHeading>
          <p className="text-xs text-muted-foreground">
            Connected {formatTimestamp(state.connectedAt)}. Active property:{" "}
            <span className="break-all text-foreground">
              {state.activeProperty.siteUrl}
            </span>
            .
          </p>
          <ConnectionPanel properties={state.properties} hasActiveProperty />
        </div>
      </section>
    </div>
  );
}
