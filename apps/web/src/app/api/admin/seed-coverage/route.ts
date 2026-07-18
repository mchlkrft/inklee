import { NextResponse } from "next/server";
import { isAutomatedSeedImportEnabled } from "@/lib/features";
import {
  cancelCoverageRun,
  coverageWorkerTick,
  createCoverageRun,
  importCoverageDataset,
  ingestStructuredDiscoveries,
  listCoverageRuns,
  listCoverageTasks,
  pauseCoverageRun,
  resumeCoverageRun,
  retryCoverageFailures,
} from "@/lib/server/seed-coverage";
import type { RawDiscovery } from "@inklee/shared/seed-coverage";
import type { CoverageUnitInput } from "@inklee/shared/seed-coverage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * CLI-equivalent trigger for the coverage orchestrator
 * (scripts/seed-coverage.cjs posts here). CRON_SECRET bearer auth, and the
 * whole lane stays behind AUTOMATED_SEED_IMPORT_ENABLED. External payloads
 * are size-capped and re-validated server-side; nothing here executes code
 * or touches the filesystem.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAutomatedSeedImportEnabled()) {
    return NextResponse.json(
      { error: "Automated seed import is disabled." },
      { status: 403 },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const action = body.action;

  if (action === "import-dataset") {
    if (
      typeof body.countryCode !== "string" ||
      typeof body.source !== "string" ||
      typeof body.sourceVersion !== "string" ||
      !Array.isArray(body.units) ||
      body.units.length === 0 ||
      body.units.length > 15000
    )
      return NextResponse.json(
        {
          error:
            "import-dataset needs countryCode, source, sourceVersion, units[1..15000].",
        },
        { status: 400 },
      );
    const result = await importCoverageDataset({
      countryCode: body.countryCode,
      source: body.source,
      sourceVersion: body.sourceVersion,
      attribution:
        typeof body.attribution === "string" ? body.attribution : null,
      units: body.units as CoverageUnitInput[],
      createdBy: null,
    });
    return NextResponse.json(result, { status: result.error ? 422 : 200 });
  }

  if (action === "create-run") {
    if (
      typeof body.countryCode !== "string" ||
      typeof body.scope !== "string" ||
      typeof body.mode !== "string"
    )
      return NextResponse.json(
        { error: "create-run needs countryCode, scope, mode." },
        { status: 400 },
      );
    const result = await createCoverageRun({
      countryCode: body.countryCode,
      scope: body.scope as never,
      mode: body.mode as never,
      regionFilter:
        typeof body.regionFilter === "string" ? body.regionFilter : null,
      autoAdvance: body.autoAdvance === true,
      createdBy: null,
    });
    return NextResponse.json(result, { status: result.error ? 422 : 200 });
  }

  if (action === "ingest") {
    if (
      typeof body.runId !== "string" ||
      (body.provider !== "overture" && body.provider !== "osm") ||
      typeof body.label !== "string" ||
      !Array.isArray(body.rows) ||
      body.rows.length > 20000
    )
      return NextResponse.json(
        {
          error:
            "ingest needs runId, provider (overture|osm), label, rows[0..20000].",
        },
        { status: 400 },
      );
    const result = await ingestStructuredDiscoveries({
      runId: body.runId,
      provider: body.provider,
      extractionLabel: body.label,
      rows: body.rows as RawDiscovery[],
      createdBy: null,
    });
    return NextResponse.json(result, { status: result.error ? 422 : 200 });
  }

  if (action === "tick") {
    const result = await coverageWorkerTick("cli-tick");
    return NextResponse.json(result);
  }

  if (
    action === "pause" ||
    action === "resume" ||
    action === "cancel" ||
    action === "retry"
  ) {
    if (typeof body.runId !== "string")
      return NextResponse.json(
        { error: `${action} needs runId.` },
        { status: 400 },
      );
    const result =
      action === "pause"
        ? await pauseCoverageRun(body.runId)
        : action === "resume"
          ? await resumeCoverageRun(body.runId)
          : action === "cancel"
            ? await cancelCoverageRun(body.runId)
            : await retryCoverageFailures(body.runId);
    return NextResponse.json(result, {
      status: "error" in result && result.error ? 422 : 200,
    });
  }

  if (action === "status") {
    const runs = await listCoverageRuns(
      typeof body.countryCode === "string" ? body.countryCode : undefined,
    );
    if (typeof body.runId === "string") {
      const tasks = await listCoverageTasks(
        body.runId,
        typeof body.statusFilter === "string" ? body.statusFilter : undefined,
      );
      return NextResponse.json({
        run: runs.find((r) => r.id === body.runId) ?? null,
        tasks,
      });
    }
    return NextResponse.json({ runs });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
