import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { isAutomatedSeedImportEnabled } from "@/lib/features";
import {
  listCoverageRuns,
  listCoverageTasks,
  type CoverageTaskListRow,
} from "@/lib/server/seed-coverage";
import CoverageControls, { CoverageRunForm } from "./coverage-controls";

export const metadata = { title: "Admin · Country coverage" };

const STATUS_LABELS: Record<string, string> = {
  created: "Created",
  planning: "Planning",
  planned: "Planned",
  discovering: "Discovering",
  processing_candidates: "Processing candidates",
  paused: "Paused",
  paused_budget: "Paused (budget window)",
  paused_rate_limit: "Paused (rate limit)",
  blocked: "Blocked",
  verifying_coverage: "Verifying coverage",
  completed: "Completed",
  completed_with_gaps: "Completed with gaps",
  failed: "Failed",
  cancelled: "Cancelled",
};

function groupByState(tasks: CoverageTaskListRow[]) {
  const groups = new Map<string, CoverageTaskListRow[]>();
  for (const t of tasks) {
    const key = t.stateName ?? "Unknown state";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export default async function AdminCoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  await requireAdmin();
  const enabled = isAutomatedSeedImportEnabled();
  const { run: selectedRunId } = await searchParams;
  const runs = enabled ? await listCoverageRuns() : [];
  const selected = runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null;
  const tasks = selected ? await listCoverageTasks(selected.id) : [];

  const counts = (status: string) =>
    tasks.filter((t) => t.status === status).length;
  const report = (selected?.counters?.report ?? null) as Record<
    string,
    unknown
  > | null;
  const projection = (selected?.counters?.projection ?? null) as Record<
    string,
    unknown
  > | null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>{" "}
          /{" "}
          <Link href="/admin/map/seeding" className="hover:text-foreground">
            Seeding
          </Link>{" "}
          / Country coverage
        </p>
        <h1 className="text-xl font-semibold text-foreground">
          Country coverage
        </h1>
        <p className="text-sm text-muted-foreground">
          Autonomous area-by-area discovery feeding the automated seed pipeline.
          The manual lanes and the candidate queue are untouched.
        </p>
      </div>

      {!enabled ? (
        <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
          Automated seed import is disabled. Set AUTOMATED_SEED_IMPORT_ENABLED
          to use the coverage orchestrator.
        </p>
      ) : (
        <>
          <CoverageRunForm />

          <section className="rounded-2xl border border-border p-4">
            <h2 className="text-sm font-semibold text-foreground">Runs</h2>
            {runs.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                No runs yet. Import the geography first (node
                scripts/germany-geo-import.cjs --post), then start a planning
                run.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {runs.map((r) => (
                  <li key={r.id} className="text-xs">
                    <Link
                      href={`/admin/map/seeding/coverage?run=${r.id}`}
                      className={
                        r.id === selected?.id
                          ? "font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }
                    >
                      {r.countryCode} {r.scope}/{r.mode} ·{" "}
                      {STATUS_LABELS[r.status] ?? r.status} ·{" "}
                      {new Date(r.createdAt).toLocaleString()}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selected ? (
            <section className="space-y-3 rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {selected.countryCode} {selected.scope} ({selected.mode})
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABELS[selected.status] ?? selected.status} · policy{" "}
                    {selected.policyVersion} · dataset {selected.datasetVersion}
                  </p>
                </div>
                <CoverageControls
                  runId={selected.id}
                  status={selected.status}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-md bg-muted/40 p-2">
                  <span className="block text-muted-foreground">Units</span>
                  <span className="text-foreground">{tasks.length}</span>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <span className="block text-muted-foreground">Complete</span>
                  <span className="text-foreground">
                    {counts("complete")} + {counts("complete_no_results")} empty
                  </span>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <span className="block text-muted-foreground">
                    Open / retry
                  </span>
                  <span className="text-foreground">
                    {counts("queued") + counts("discovering")} /{" "}
                    {counts("retry_required")}
                  </span>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <span className="block text-muted-foreground">
                    Partial / blocked
                  </span>
                  <span className="text-foreground">
                    {counts("partial")} / {counts("blocked")}
                  </span>
                </div>
              </div>

              {selected.pilotSelection?.length ? (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Pilot selection:
                  </span>{" "}
                  {(
                    selected.pilotSelection as Array<{
                      externalId: string;
                      reason: string;
                    }>
                  )
                    .map((p) => `${p.externalId} (${p.reason})`)
                    .join(" · ")}
                </div>
              ) : null}

              {projection ? (
                <p className="text-xs text-muted-foreground">
                  Projection: {String(projection.units)} units,{" "}
                  {String(projection.projectedSearchRequests)} search requests
                  over ~{String(projection.projectedSearchDays)} budget days.
                </p>
              ) : null}
              {report ? (
                <p className="text-xs text-muted-foreground">
                  Coverage: units{" "}
                  {Math.round(Number(report.unitCompletionRate) * 100)}% ·
                  population{" "}
                  {Math.round(Number(report.populationCoverageRate) * 100)}% ·
                  area {Math.round(Number(report.areaCoverageRate) * 100)}% ·
                  providers{" "}
                  {Math.round(Number(report.providerCompletionRate) * 100)}%
                </p>
              ) : null}
              {selected.gaps?.total ? (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    Gaps ({selected.gaps.total}
                    {selected.gaps.truncated
                      ? `, first ${selected.gaps.list.length} shown`
                      : ""}
                    )
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    {selected.gaps.list.slice(0, 100).map((g) => (
                      <li key={g.externalId}>
                        {g.externalId} {g.name} → {g.status}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Geographic progress ({tasks.length} units)
                </summary>
                <div className="mt-2 space-y-2">
                  {groupByState(tasks).map(([state, stateTasks]) => (
                    <details
                      key={state}
                      className="rounded-md border border-border p-2"
                    >
                      <summary className="cursor-pointer text-xs text-foreground">
                        {state}:{" "}
                        {
                          stateTasks.filter((t) =>
                            ["complete", "complete_no_results"].includes(
                              t.status,
                            ),
                          ).length
                        }
                        /{stateTasks.length} done
                      </summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {stateTasks.map((t) => (
                          <li key={t.id}>
                            {t.unitExternalId} {t.unitName} [{t.strategy}] →{" "}
                            {t.status}
                            {t.rawCount
                              ? ` · ${t.rawCount} raw / ${t.novelCount} novel`
                              : ""}
                            {t.errorClass ? ` · ${t.errorClass}` : ""}
                            {t.lastError ? ` · ${t.lastError}` : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              </details>

              {selected.seedAreaId ? (
                <p className="text-xs text-muted-foreground">
                  Candidates land in the standard queue:{" "}
                  <Link
                    href={`/admin/map/seeding/${selected.seedAreaId}`}
                    className="text-foreground underline"
                  >
                    open the handoff area
                  </Link>
                  .
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
