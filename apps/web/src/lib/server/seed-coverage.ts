import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";
import { isAutomatedSeedImportEnabled } from "@/lib/features";
import {
  COVERAGE_DONE_STATUSES,
  DE_COVERAGE_POLICY,
  assignDiscoveryToUnit,
  computeCoverageReport,
  discoveryIdentityKey,
  generateQueries,
  getCoveragePolicy,
  haversineKm,
  isSaturated,
  mergeDiscoveries,
  normalizedDomain,
  planCoverage,
  retryDelayMs,
  selectPilotUnits,
  type CompletionTaskRow,
  type CoveragePolicy,
  type CoverageRunMode,
  type CoverageRunScope,
  type CoverageStrategy,
  type CoverageUnitInput,
  type MergedDiscovery,
  type RawDiscovery,
} from "@inklee/shared/seed-coverage";
import {
  SEED_PIPELINE_VERSION,
  SEED_RULESET_VERSION,
} from "@inklee/shared/seed-filtering";
import {
  braveGlobalHeadroom,
  braveLedgerSearch,
  pageAll,
  recordExternalExtraction,
  stampUsageYield,
} from "@/lib/server/map-seeding";
import { runCountrySeed } from "@/lib/server/seed-automation";

// Country coverage orchestrator server core.
// Owns coverage PLANNING and DISCOVERY plus the handoff into the 0087
// candidate pipeline. It never creates map locations itself: accepted
// candidates import through runCountrySeed -> createMapLocationCore, review
// candidates land in the existing manual queue, and claimed profiles stay
// untouchable by construction. SoT: docs/product/inklee-2-country-coverage.md.

const OSM_ATTRIBUTION = "OpenStreetMap contributors (ODbL)";
const OVERTURE_ATTRIBUTION = "Overture Maps (CDLA-Permissive-2.0)";

// ---------------------------------------------------------------------------
// Row shapes.

export type CoverageUnitRow = {
  id: string;
  countryCode: string;
  level: string;
  externalId: string;
  name: string;
  aliases: string[];
  stateCode: string | null;
  stateName: string | null;
  districtName: string | null;
  population: number | null;
  areaKm2: number | null;
  centroid: { latitude: number; longitude: number } | null;
  strategy: string | null;
  priorityScore: number;
  clusterExternalId: string | null;
  memberExternalIds: string[];
  sourceVersion: string;
};

function shapeUnit(r: Record<string, unknown>): CoverageUnitRow {
  const lat = r.centroid_lat === null ? null : Number(r.centroid_lat);
  const lng = r.centroid_lng === null ? null : Number(r.centroid_lng);
  return {
    id: r.id as string,
    countryCode: r.country_code as string,
    level: r.level as string,
    externalId: r.external_id as string,
    name: r.name as string,
    aliases: (r.aliases as string[]) ?? [],
    stateCode: (r.state_code as string | null) ?? null,
    stateName: (r.state_name as string | null) ?? null,
    districtName: (r.district_name as string | null) ?? null,
    population: r.population === null ? null : Number(r.population),
    areaKm2: r.area_km2 === null ? null : Number(r.area_km2),
    centroid:
      lat !== null &&
      lng !== null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
        ? { latitude: lat, longitude: lng }
        : null,
    strategy: (r.strategy as string | null) ?? null,
    priorityScore: Number(r.priority_score ?? 0),
    clusterExternalId: (r.cluster_external_id as string | null) ?? null,
    memberExternalIds: (r.member_external_ids as string[]) ?? [],
    sourceVersion: r.source_version as string,
  };
}

async function loadUnits(countryCode: string): Promise<CoverageUnitRow[]> {
  const rows = await pageAll<Record<string, unknown>>(
    (from, to) =>
      serviceClient
        .from("map_coverage_units")
        .select("*")
        .eq("country_code", countryCode)
        .order("id", { ascending: true })
        .range(from, to),
    20000,
  );
  return rows.map(shapeUnit);
}

// ---------------------------------------------------------------------------
// Dataset import: plan strategies + clusters and upsert units in place
// (identity = country/level/external id, so refreshes never orphan history).

export async function importCoverageDataset(input: {
  countryCode: string;
  source: string;
  sourceVersion: string;
  attribution: string | null;
  units: CoverageUnitInput[];
  createdBy: string | null;
}): Promise<{ error?: string; unitCount?: number; clusterCount?: number }> {
  const policy = getCoveragePolicy(input.countryCode);
  if (!policy)
    return { error: `No coverage policy for "${input.countryCode}".` };
  if (!input.units.length) return { error: "The dataset has no units." };
  if (input.units.length > 15000)
    return { error: "The dataset is implausibly large; refusing." };

  const { units, clusters } = planCoverage(input.units, policy);

  const municipalityRows = units.map((u) => ({
    country_code: input.countryCode,
    level: "municipality",
    external_id: u.externalId,
    parent_external_id: u.districtCode ?? null,
    name: u.name,
    aliases: u.aliases ?? [],
    state_code: u.stateCode,
    state_name: u.stateName,
    district_code: u.districtCode ?? null,
    district_name: u.districtName ?? null,
    population: u.population ?? null,
    area_km2: u.areaKm2 ?? null,
    centroid_lat: u.centroid?.latitude ?? null,
    centroid_lng: u.centroid?.longitude ?? null,
    postal_code: u.postalCode ?? null,
    settlement_class: u.settlementClass ?? null,
    strategy: u.strategy,
    priority_score: u.priorityScore,
    cluster_external_id: u.clusterExternalId,
    source_version: input.sourceVersion,
    updated_at: new Date().toISOString(),
  }));
  const clusterRows = clusters.map((c) => ({
    country_code: input.countryCode,
    level: "cluster",
    external_id: c.externalId,
    parent_external_id: null,
    name: c.name,
    aliases: [],
    state_code: c.stateCode,
    state_name: c.stateName,
    population: c.population,
    area_km2: c.areaKm2,
    centroid_lat: c.centroid.latitude,
    centroid_lng: c.centroid.longitude,
    strategy: c.strategy,
    priority_score: c.priorityScore,
    member_external_ids: c.memberExternalIds,
    source_version: input.sourceVersion,
    updated_at: new Date().toISOString(),
  }));

  const all = [...municipalityRows, ...clusterRows];
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await serviceClient
      .from("map_coverage_units")
      .upsert(all.slice(i, i + 500), {
        onConflict: "country_code,level,external_id",
      });
    if (error)
      return {
        error: `Unit upsert failed at chunk ${i / 500}: ${error.message}`,
      };
  }

  const { error: dsError } = await serviceClient
    .from("map_coverage_datasets")
    .upsert(
      {
        country_code: input.countryCode,
        source: input.source,
        source_version: input.sourceVersion,
        unit_count: all.length,
        attribution: input.attribution,
        created_by: input.createdBy,
      },
      { onConflict: "country_code,source,source_version" },
    );
  if (dsError) return { error: `Dataset record failed: ${dsError.message}` };

  await writeAudit({
    action: "coverage_dataset_imported",
    actor: input.createdBy ?? "seed-coverage",
    category: input.createdBy ? "admin" : "system",
    details: {
      country: input.countryCode,
      source: input.source,
      version: input.sourceVersion,
      units: municipalityRows.length,
      clusters: clusterRows.length,
    },
  });
  return {
    unitCount: municipalityRows.length,
    clusterCount: clusterRows.length,
  };
}

// ---------------------------------------------------------------------------
// Run creation. Planning runs project and complete; discovery/import runs
// queue tasks for the worker.

type RunConfig = {
  policyVersion: string;
  budgets: CoveragePolicy["budgets"];
  completion: CoveragePolicy["completion"];
  autoAdvance: boolean;
};

export async function createCoverageRun(input: {
  countryCode: string;
  scope: CoverageRunScope;
  mode: CoverageRunMode;
  regionFilter?: string | null;
  autoAdvance?: boolean;
  createdBy: string | null;
}): Promise<{ error?: string; runId?: string; projection?: unknown }> {
  if (!isAutomatedSeedImportEnabled())
    return {
      error:
        "Automated seed import is disabled. Set AUTOMATED_SEED_IMPORT_ENABLED to run coverage.",
    };
  const policy = getCoveragePolicy(input.countryCode);
  if (!policy)
    return { error: `No coverage policy for "${input.countryCode}".` };

  const allUnits = await loadUnits(input.countryCode);
  const municipalities = allUnits.filter((u) => u.level === "municipality");
  const clusters = allUnits.filter((u) => u.level === "cluster");
  if (!municipalities.length)
    return {
      error:
        "No coverage units imported yet. Run the geography import first (seed-coverage plan).",
    };
  const datasetVersion = municipalities[0].sourceVersion;

  // Scope selection.
  let selected: CoverageUnitRow[] = [];
  let pilotSelection: Array<{ externalId: string; reason: string }> | null =
    null;
  if (input.scope === "pilot") {
    const planned = municipalities.map((u) => ({
      externalId: u.externalId,
      name: u.name,
      aliases: u.aliases,
      stateCode: u.stateCode ?? "",
      stateName: u.stateName ?? "",
      population: u.population,
      areaKm2: u.areaKm2,
      centroid: u.centroid,
      level: "municipality" as const,
      strategy: (u.strategy ?? "town_light") as CoverageStrategy,
      priorityScore: u.priorityScore,
      clusterExternalId: u.clusterExternalId,
    }));
    const plannedClusters = clusters.map((c) => ({
      externalId: c.externalId,
      level: "cluster" as const,
      name: c.name,
      stateCode: c.stateCode ?? "",
      stateName: c.stateName ?? "",
      memberExternalIds: c.memberExternalIds,
      population: c.population ?? 0,
      areaKm2: c.areaKm2 ?? 0,
      centroid: c.centroid ?? { latitude: 0, longitude: 0 },
      strategy: "rural_cluster" as const,
      priorityScore: c.priorityScore,
    }));
    pilotSelection = selectPilotUnits(planned, plannedClusters);
    const ids = new Set(pilotSelection.map((p) => p.externalId));
    selected = allUnits.filter((u) => ids.has(u.externalId));
    // Cluster members ride along so every municipality keeps its own status.
    for (const c of selected.filter((u) => u.level === "cluster")) {
      for (const m of allUnits.filter(
        (u) => u.clusterExternalId === c.externalId,
      )) {
        if (!ids.has(m.externalId)) {
          ids.add(m.externalId);
          selected.push(m);
        }
      }
    }
  } else if (input.scope === "regional") {
    if (!input.regionFilter)
      return { error: "Regional scope needs a regionFilter (state code)." };
    selected = allUnits.filter((u) => u.stateCode === input.regionFilter);
    if (!selected.length) return { error: "No units in that region." };
  } else if (input.scope === "gap_fill") {
    const doneUnitIds = new Set(
      (
        await pageAll<{ unit_id: string; status: string }>(
          (from, to) =>
            serviceClient
              .from("map_coverage_tasks")
              .select("unit_id, status")
              .in("status", [...COVERAGE_DONE_STATUSES])
              .order("id", { ascending: true })
              .range(from, to),
          50000,
        )
      ).map((t) => t.unit_id),
    );
    selected = allUnits.filter((u) => !doneUnitIds.has(u.id));
    if (!selected.length)
      return { error: "No gaps: every unit already completed in a prior run." };
  } else {
    selected = allUnits;
  }

  const config: RunConfig = {
    policyVersion: policy.version,
    budgets: policy.budgets,
    completion: policy.completion,
    autoAdvance: input.autoAdvance ?? false,
  };

  // Projection (used by planning mode and stored for every mode).
  const projection = projectRun(selected, policy);

  const { data: runRow, error: runErr } = await serviceClient
    .from("map_coverage_runs")
    .insert({
      country_code: input.countryCode,
      scope: input.scope,
      mode: input.mode,
      status: input.mode === "planning" ? "planning" : "created",
      region_filter: input.regionFilter ?? null,
      policy_version: policy.version,
      dataset_version: datasetVersion,
      ruleset_version: SEED_RULESET_VERSION,
      pipeline_version: SEED_PIPELINE_VERSION,
      config,
      pilot_selection: pilotSelection,
      counters: { projection },
      auto_advance: input.autoAdvance ?? false,
      created_by: input.createdBy,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runErr || !runRow) return { error: "Could not record the run." };
  const runId = runRow.id as string;

  if (input.mode === "planning") {
    await serviceClient
      .from("map_coverage_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return { runId, projection };
  }

  // Discovery/import: a handoff seed area + one task per selected unit.
  const withCentroid = selected.filter((u) => u.centroid);
  const meanLat =
    withCentroid.reduce((s, u) => s + (u.centroid?.latitude ?? 0), 0) /
    Math.max(1, withCentroid.length);
  const meanLng =
    withCentroid.reduce((s, u) => s + (u.centroid?.longitude ?? 0), 0) /
    Math.max(1, withCentroid.length);
  const radiusKm =
    Math.max(
      50,
      ...withCentroid.map((u) =>
        haversineKm(
          { latitude: meanLat, longitude: meanLng },
          u.centroid as { latitude: number; longitude: number },
        ),
      ),
    ) + 30;
  const { data: area, error: areaErr } = await serviceClient
    .from("map_seed_areas")
    .insert({
      label: `${input.countryCode} coverage ${input.scope} ${new Date().toISOString().slice(0, 10)}`,
      country: input.countryCode,
      center_lat: meanLat,
      center_lng: meanLng,
      // Display-only for the handoff; the 0082 schema caps radius at 500.
      radius_km: Math.min(500, Math.round(radiusKm)),
      created_by: input.createdBy,
      notes: `Coverage run ${runId}`,
    })
    .select("id")
    .single();
  if (areaErr || !area) {
    await serviceClient
      .from("map_coverage_runs")
      .update({
        status: "failed",
        error_summary: "Could not create the handoff area.",
      })
      .eq("id", runId);
    return { error: "Could not create the handoff seed area.", runId };
  }

  const tasks = selected.map((u) => ({
    run_id: runId,
    unit_id: u.id,
    status: "queued",
    strategy:
      u.level === "cluster"
        ? "rural_cluster"
        : u.clusterExternalId
          ? // Clustered municipalities: their paid searches run on the
            // cluster task; the member is completed from structured evidence
            // and spatial assignment.
            "structured_only"
          : (u.strategy ?? "town_light"),
    priority: u.priorityScore,
  }));
  for (let i = 0; i < tasks.length; i += 500) {
    const { error } = await serviceClient
      .from("map_coverage_tasks")
      .insert(tasks.slice(i, i + 500));
    if (error) {
      await serviceClient
        .from("map_coverage_runs")
        .update({
          status: "failed",
          error_summary: `Task creation failed: ${error.message}`,
        })
        .eq("id", runId);
      return { error: `Task creation failed: ${error.message}`, runId };
    }
  }

  await serviceClient
    .from("map_coverage_runs")
    .update({
      status: "discovering",
      seed_area_id: area.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);
  await writeAudit({
    action: "coverage_run_created",
    actor: input.createdBy ?? "seed-coverage",
    category: input.createdBy ? "admin" : "system",
    details: {
      run_id: runId,
      country: input.countryCode,
      scope: input.scope,
      mode: input.mode,
      units: tasks.length,
    },
  });
  return { runId, projection };
}

function projectRun(selected: CoverageUnitRow[], policy: CoveragePolicy) {
  const byStrategy = new Map<string, number>();
  let searchRequests = 0;
  for (const u of selected) {
    const strategy =
      u.level === "cluster"
        ? "rural_cluster"
        : u.clusterExternalId
          ? "structured_only"
          : (u.strategy ?? "town_light");
    byStrategy.set(strategy, (byStrategy.get(strategy) ?? 0) + 1);
    searchRequests += (policy.queryBundles[strategy as CoverageStrategy] ?? [])
      .length;
  }
  return {
    units: selected.length,
    byStrategy: Object.fromEntries(byStrategy),
    projectedSearchRequests: searchRequests,
    projectedSearchDays: Math.ceil(
      searchRequests / Math.max(1, policy.budgets.maxDailySearchRequests),
    ),
    estimatedSearchCostUsd: 0,
    note: "Search requests ride the existing capped Brave plan; structured extraction is free.",
  };
}

// ---------------------------------------------------------------------------
// Structured ingest (Overture / OSM extractions prepared locally or in CI).

export async function ingestStructuredDiscoveries(input: {
  runId: string;
  provider: "overture" | "osm";
  extractionLabel: string;
  rows: RawDiscovery[];
  createdBy: string | null;
}): Promise<{
  error?: string;
  inserted?: number;
  merged?: number;
  assigned?: number;
}> {
  if (!isAutomatedSeedImportEnabled())
    return { error: "Automated seed import is disabled." };
  const { data: run } = await serviceClient
    .from("map_coverage_runs")
    .select("id, country_code, status, mode")
    .eq("id", input.runId)
    .maybeSingle();
  if (!run) return { error: "Run not found." };
  if (
    !["created", "discovering", "processing_candidates"].includes(
      run.status as string,
    )
  )
    return { error: `Run is ${run.status}; ingest needs an active run.` };
  if (input.rows.length > 20000)
    return { error: "Extraction too large; split it." };

  const units = (await loadUnits(run.country_code as string)).filter(
    (u) => u.level === "municipality" && u.centroid,
  );
  const assignable = units.map((u) => ({
    externalId: u.externalId,
    name: u.name,
    aliases: u.aliases,
    areaKm2: u.areaKm2,
    centroid: u.centroid,
  }));
  const unitByExternal = new Map(units.map((u) => [u.externalId, u]));

  const merged = mergeDiscoveries(input.rows);
  let inserted = 0;
  let assigned = 0;
  for (const d of merged) {
    const assignment = assignDiscoveryToUnit(d, assignable);
    const unit = assignment.externalId
      ? unitByExternal.get(assignment.externalId)
      : undefined;
    if (unit) assigned += 1;
    const { error } = await serviceClient
      .from("map_coverage_discoveries")
      .insert({
        run_id: input.runId,
        unit_id: unit?.id ?? null,
        provider: input.provider,
        provider_result_id: d.providerResultId ?? null,
        name: d.name.slice(0, 200),
        category: d.category ?? null,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
        address: d.address?.slice(0, 300) ?? null,
        city: d.city?.slice(0, 120) ?? null,
        postal_code: d.postalCode?.slice(0, 20) ?? null,
        website_url: d.websiteUrl ?? null,
        social_url: d.socialUrl ?? null,
        phone: d.phone?.slice(0, 40) ?? null,
        email: d.email?.slice(0, 200) ?? null,
        source_url: d.sourceUrl ?? null,
        identity_key: d.identityKey,
        discovered_by: d.discoveredBy,
        assignment_method: assignment.method,
        assignment_confidence: assignment.confidence,
        retention_class:
          input.provider === "osm" ? "odbl_attribution" : "cdla_permissive",
      });
    if (!error) inserted += 1;
    // 23505 on (run, provider, provider id) = the same extraction re-ingested;
    // silently idempotent by design.
  }

  if (input.provider === "osm") {
    await recordExternalExtraction(
      { createdBy: input.createdBy, coverageRunId: input.runId },
      "osm_overpass",
      input.extractionLabel.slice(0, 200),
    );
  }
  await bumpCounters(input.runId, {
    [`${input.provider}RawIngested`]: input.rows.length,
    [`${input.provider}UniqueIngested`]: inserted,
  });
  await writeAudit({
    action: "coverage_structured_ingested",
    actor: input.createdBy ?? "seed-coverage",
    category: input.createdBy ? "admin" : "system",
    details: {
      run_id: input.runId,
      provider: input.provider,
      label: input.extractionLabel,
      raw: input.rows.length,
      unique: inserted,
      assigned,
    },
  });
  return { inserted, merged: input.rows.length - merged.length, assigned };
}

async function bumpCounters(
  runId: string,
  deltas: Record<string, number>,
): Promise<void> {
  const { data } = await serviceClient
    .from("map_coverage_runs")
    .select("counters")
    .eq("id", runId)
    .maybeSingle();
  const counters = (data?.counters as Record<string, unknown>) ?? {};
  for (const [k, v] of Object.entries(deltas)) {
    counters[k] = Number(counters[k] ?? 0) + v;
  }
  await serviceClient
    .from("map_coverage_runs")
    .update({ counters, updated_at: new Date().toISOString() })
    .eq("id", runId);
}

// ---------------------------------------------------------------------------
// Bounded website enrichment (SSRF-guarded, homepage metadata only).

function hostnameAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h || h === "localhost") return false;
  if (/^[\d.]+$/.test(h)) return false; // IPv4 literal
  if (h.includes(":")) return false; // IPv6 literal
  if (/\.(local|internal|lan|home|corp|intranet)$/.test(h)) return false;
  if (!h.includes(".")) return false;
  return true;
}

export async function fetchSiteEvidence(url: string): Promise<string | null> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  for (let hop = 0; hop < 3; hop++) {
    if (target.protocol !== "https:" || !hostnameAllowed(target.hostname))
      return null;
    let response: Response;
    try {
      response = await fetch(target.toString(), {
        redirect: "manual",
        headers: { "User-Agent": "InkleeSeedBot/1.0 (+https://inklee.app)" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      try {
        target = new URL(location, target);
      } catch {
        return null;
      }
      continue;
    }
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return null;
    let html = "";
    try {
      const reader = response.body?.getReader();
      if (!reader) return null;
      let bytes = 0;
      const decoder = new TextDecoder();
      while (bytes < 200_000) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      await reader.cancel().catch(() => undefined);
    } catch {
      // Stream error or the timeout firing mid-body: enrichment is
      // optional, never a crash.
      return null;
    }
    // Bounded head slice + bounded attribute scans: hostile HTML must not
    // trigger quadratic regex backtracking.
    const head = html.slice(0, 32_000);
    const title =
      head.match(/<title[^>]{0,100}>([^<]{1,300})<\/title>/i)?.[1] ?? "";
    const meta =
      head.match(
        /<meta[^>]{0,200}?name=["']description["'][^>]{0,200}?content=["']([^"']{1,400})["']/i,
      )?.[1] ??
      head.match(
        /<meta[^>]{0,200}?content=["']([^"']{1,400})["'][^>]{0,200}?name=["']description["']/i,
      )?.[1] ??
      "";
    const text = `${title} ${meta}`.replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 500) : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The worker tick: bounded, resumable, safe to run from cron repeatedly.

type RunRow = {
  id: string;
  country_code: string;
  scope: string;
  mode: string;
  status: string;
  config: RunConfig | null;
  seed_area_id: string | null;
  created_by: string | null;
  auto_advance: boolean;
};

const CLAIM_LEASE_MS = 15 * 60 * 1000;

export async function coverageWorkerTick(
  workerId: string,
): Promise<{ error?: string; summary?: Record<string, unknown> }> {
  if (!isAutomatedSeedImportEnabled())
    return { summary: { skipped: "flag_off" } };

  const { data: activeRuns } = await serviceClient
    .from("map_coverage_runs")
    .select(
      "id, country_code, scope, mode, status, config, seed_area_id, created_by, auto_advance",
    )
    .in("status", [
      "discovering",
      "processing_candidates",
      "verifying_coverage",
      "paused_budget",
      "paused_rate_limit",
    ])
    .order("created_at", { ascending: true })
    .limit(3);
  if (!activeRuns?.length) return { summary: { idle: true } };

  // Oldest first, but a budget-paused head run must not starve newer runs:
  // paused runs still get their free work (handoff) before we move on.
  for (const candidate of activeRuns as RunRow[]) {
    const result = await tickOneRun(candidate, workerId);
    if (result) return result;
  }
  return { summary: { idle: "all_paused" } };
}

async function tickOneRun(
  run: RunRow,
  workerId: string,
): Promise<{ error?: string; summary?: Record<string, unknown> } | null> {
  const policy = getCoveragePolicy(run.country_code) ?? DE_COVERAGE_POLICY;
  const budgets = run.config?.budgets ?? policy.budgets;

  // A crashed finalization reruns; finalizeRun is idempotent.
  if (run.status === "verifying_coverage") {
    await finalizeRun(run, await loadUnits(run.country_code));
    return { summary: { runId: run.id, finalized: true } };
  }

  // Budget/rate pauses auto-resume once BOTH the coverage share and the
  // global ledger have headroom again (the pause may have come from either).
  if (run.status === "paused_budget" || run.status === "paused_rate_limit") {
    const [usedToday, headroom] = await Promise.all([
      coverageSearchesToday(),
      braveGlobalHeadroom(),
    ]);
    const canSearch =
      usedToday < budgets.maxDailySearchRequests &&
      headroom !== null &&
      headroom.dayRemaining > 0 &&
      headroom.monthRemaining > 0;
    if (!canSearch) {
      // No search budget, but batching already-ingested discoveries costs
      // nothing paid; do that so structured work keeps flowing.
      const batches = await handOffBatches(run, budgets);
      if ((batches.batches as number) || (batches.manualLeads as number))
        return { summary: { runId: run.id, paused: run.status, batches } };
      return null; // let a newer run have the tick
    }
    await setRunStatus(run.id, "discovering");
    run.status = "discovering";
  }

  // Lease reclaim: tasks stranded in "discovering" by a killed worker come
  // back to the queue once their claim lease expires. The attempt counter
  // was already charged at claim time, so this never loops unbounded past
  // maxAttempts + lease cycles.
  await serviceClient
    .from("map_coverage_tasks")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("run_id", run.id)
    .eq("status", "discovering")
    .lt("claimed_at", new Date(Date.now() - CLAIM_LEASE_MS).toISOString());

  // "No candidates" is only a valid outcome after providers actually looked:
  // without a structured ingest, empty units may not complete as no-results.
  const { data: runCounters } = await serviceClient
    .from("map_coverage_runs")
    .select("counters")
    .eq("id", run.id)
    .maybeSingle();
  const counters = (runCounters?.counters as Record<string, unknown>) ?? {};
  const structuredIngested =
    Number(counters.overtureRawIngested ?? 0) > 0 ||
    Number(counters.osmRawIngested ?? 0) > 0;

  const claimed = await serviceClient.rpc("claim_coverage_tasks", {
    p_run: run.id,
    p_worker: workerId,
    p_max: budgets.maxTasksPerTick,
  });
  const tasks = (claimed.data as Array<Record<string, unknown>> | null) ?? [];

  const summary: Record<string, unknown> = {
    runId: run.id,
    claimed: tasks.length,
  };
  let pausedForBudget = false;

  const units = await loadUnits(run.country_code);
  const unitById = new Map(units.map((u) => [u.id, u]));

  for (const task of tasks) {
    if (pausedForBudget) {
      // Return unexecuted claims to the queue; the claim charged an attempt
      // no provider ever saw, so give it back (paused is not failed).
      await serviceClient
        .from("map_coverage_tasks")
        .update({
          status: "queued",
          attempt: Math.max(0, Number(task.attempt ?? 1) - 1),
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id as string)
        .eq("status", "discovering");
      continue;
    }
    const unit = unitById.get(task.unit_id as string);
    if (!unit) {
      await finishTask(task.id as string, "blocked", {
        error_class: "invalid_coverage_unit",
        last_error: "Unit missing from the dataset.",
      });
      continue;
    }
    const outcome = await executeCoverageTask(
      run,
      task,
      unit,
      units,
      policy,
      budgets,
      structuredIngested,
    );
    if (outcome === "paused_budget") pausedForBudget = true;
  }

  // Handoff: batch unprocessed discoveries into the 0087 pipeline.
  const batches = await handOffBatches(run, budgets);
  summary.batches = batches;

  if (pausedForBudget) {
    await setRunStatus(run.id, "paused_budget");
    summary.paused = "budget";
    return { summary };
  }

  // Completion: nothing left to claim AND nothing left to batch AND the
  // handoff reported no batch errors this tick. Pending discoveries must
  // never be stranded by an early finalize.
  const { count: openCount } = await serviceClient
    .from("map_coverage_tasks")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .in("status", [
      "queued",
      "retry_required",
      "discovering",
      "discovered",
      "processing",
    ]);
  const { count: pendingDiscoveries } = await serviceClient
    .from("map_coverage_discoveries")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .is("merged_into", null)
    .is("batch_run_id", null)
    .is("candidate_status", null);
  const batchErrors = Object.keys(batches).some((k) =>
    k.startsWith("batchError"),
  );
  if (
    (openCount ?? 0) === 0 &&
    (pendingDiscoveries ?? 0) === 0 &&
    !batchErrors
  ) {
    await finalizeRun(run, units);
    summary.finalized = true;
  }
  return { summary };
}

async function coverageSearchesToday(): Promise<number> {
  const dayKey = new Date().toISOString().slice(0, 10);
  const { count } = await serviceClient
    .from("map_seed_provider_usage")
    .select("id", { count: "exact", head: true })
    .eq("provider", "brave_search")
    .eq("day_key", dayKey)
    .eq("blocked", false)
    .not("coverage_run_id", "is", null);
  return count ?? 0;
}

async function coverageSearchesForRun(runId: string): Promise<number> {
  const { count } = await serviceClient
    .from("map_seed_provider_usage")
    .select("id", { count: "exact", head: true })
    .eq("provider", "brave_search")
    .eq("blocked", false)
    .eq("coverage_run_id", runId);
  return count ?? 0;
}

async function setRunStatus(runId: string, status: string): Promise<void> {
  await serviceClient
    .from("map_coverage_runs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", runId);
}

async function finishTask(
  taskId: string,
  status: string,
  extras: Record<string, unknown> = {},
): Promise<void> {
  await serviceClient
    .from("map_coverage_tasks")
    .update({
      status,
      last_scanned_at: new Date().toISOString(),
      completed_at: [
        "complete",
        "complete_no_results",
        "partial",
        "blocked",
      ].includes(status)
        ? new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
      ...extras,
    })
    .eq("id", taskId);
}

async function executeCoverageTask(
  run: RunRow,
  task: Record<string, unknown>,
  unit: CoverageUnitRow,
  allUnits: CoverageUnitRow[],
  policy: CoveragePolicy,
  budgets: CoveragePolicy["budgets"],
  structuredIngested: boolean,
): Promise<"done" | "paused_budget"> {
  const taskId = task.id as string;
  const strategy = task.strategy as CoverageStrategy;
  const providerState =
    (task.provider_state as Record<string, unknown> | null) ?? {};
  const attempt = Number(task.attempt ?? 1);

  // Structured evidence: discoveries already spatially assigned to this unit
  // (or its members for clusters).
  const memberIds =
    unit.level === "cluster"
      ? allUnits
          .filter((u) => u.clusterExternalId === unit.externalId)
          .map((u) => u.id)
      : [];
  const scopeIds = [unit.id, ...memberIds];
  const { count: structuredCount } = await serviceClient
    .from("map_coverage_discoveries")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .in("unit_id", scopeIds)
    .in("provider", ["overture", "osm"]);

  const bundle = policy.queryBundles[strategy] ?? [];
  const braveState =
    (providerState.brave_search as {
      executed?: string[];
      novel?: number[];
    } | null) ?? {};
  const executed = new Set(braveState.executed ?? []);
  const novelHistory = [...(braveState.novel ?? [])];
  let raw = Number(task.raw_count ?? 0);
  let novel = Number(task.novel_count ?? 0);
  let errorClass: string | null = null;
  let lastError: string | null = null;

  // Adaptive reduction, recorded: structured yield already proves the unit,
  // so paid queries shrink to a single confirmation pass.
  let queries = generateQueries(
    { name: unit.name, aliases: unit.aliases, stateName: unit.stateName },
    strategy,
    policy,
    executed,
    {
      disambiguateWithState: allUnits.some(
        (u) => u.externalId !== unit.externalId && u.name === unit.name,
      ),
    },
  );
  if ((structuredCount ?? 0) >= 3 && queries.length > 1) {
    queries = queries.slice(0, 1);
    providerState.adaptation = `Reduced to 1 query: ${structuredCount} structured discoveries already cover this unit.`;
  }

  // Checkpoint-and-pause helper: paused is not failed, so the attempt the
  // claim charged is restored and the executed-set checkpoint is saved.
  const pauseCheckpoint = async (): Promise<"paused_budget"> => {
    providerState.brave_search = {
      executed: [...executed],
      novel: novelHistory,
    };
    await serviceClient
      .from("map_coverage_tasks")
      .update({
        status: "queued",
        attempt: Math.max(0, attempt - 1),
        provider_state: providerState,
        raw_count: raw,
        novel_count: novel,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    return "paused_budget";
  };

  for (const q of queries) {
    if (isSaturated(novelHistory, policy)) {
      providerState.saturated = true;
      break;
    }
    // Budget walls, checked before any billable request: the coverage daily
    // share, the run-total cap, and the GLOBAL ledger headroom shared with
    // the manual lane (a blocked ledger insert would burn a ledger row and
    // never pause, flapping forever).
    const [usedToday, usedRun, headroom] = await Promise.all([
      coverageSearchesToday(),
      coverageSearchesForRun(run.id),
      braveGlobalHeadroom(),
    ]);
    if (usedRun >= budgets.maxRunSearchRequests) {
      // The run-total ceiling is not a window that reopens: the unit ends
      // partial and the founder decides (raise the policy or accept gaps).
      errorClass = "budget_exhausted";
      lastError = `Run search ceiling reached (${usedRun}/${budgets.maxRunSearchRequests}).`;
      break;
    }
    if (
      usedToday >= budgets.maxDailySearchRequests ||
      headroom === null ||
      headroom.dayRemaining <= 0 ||
      headroom.monthRemaining <= 0
    ) {
      return pauseCheckpoint();
    }
    const outcome = await braveLedgerSearch(
      {
        createdBy: run.created_by,
        coverageRunId: run.id,
        coverageUnitId: unit.id,
      },
      q.query,
    );
    if (outcome.error) {
      errorClass = outcome.errorClass ?? "transient_provider_error";
      lastError = outcome.error;
      if (outcome.errorClass === "budget_exhausted") {
        // Blocked before any request: the query stays eligible for the
        // retry (NOT marked executed).
        return pauseCheckpoint();
      }
      // The request counted (usageId) but failed: mark executed only in
      // that case so a retry re-runs queries that never reached Brave.
      if (outcome.usageId) executed.add(q.normalized);
      break;
    }
    executed.add(q.normalized);
    const leads = outcome.leads ?? [];
    let queryNovel = 0;
    for (let rank = 0; rank < leads.length; rank++) {
      const lead = leads[rank];
      const discovery: RawDiscovery = {
        provider: "brave_search",
        providerResultId: lead.url.toLowerCase().slice(0, 500),
        name: lead.title.slice(0, 200),
        sourceUrl: lead.url,
        websiteUrl: /instagram\.com\//i.test(lead.url) ? null : lead.url,
        socialUrl: /instagram\.com\//i.test(lead.url) ? lead.url : null,
        city: unit.name,
      };
      const identity = discoveryIdentityKey(discovery);
      const { data: existing } = await serviceClient
        .from("map_coverage_discoveries")
        .select("id")
        .eq("run_id", run.id)
        .eq("identity_key", identity)
        .limit(1)
        .maybeSingle();
      if (existing) continue;
      const { error } = await serviceClient
        .from("map_coverage_discoveries")
        .insert({
          run_id: run.id,
          task_id: taskId,
          unit_id: unit.id,
          provider: "brave_search",
          provider_result_id: discovery.providerResultId,
          name: discovery.name,
          source_url: lead.url,
          website_url: discovery.websiteUrl,
          social_url: discovery.socialUrl,
          city: unit.name,
          identity_key: identity,
          discovered_by: [
            {
              provider: "brave_search",
              providerResultId: discovery.providerResultId,
              sourceUrl: lead.url,
            },
          ],
          assignment_method: "city_name",
          assignment_confidence: "medium",
          payload_minimal: { query: q.query, rank },
          retention_class: "lead_only",
        });
      if (!error) {
        queryNovel += 1;
        raw += 1;
      }
    }
    novel += queryNovel;
    novelHistory.push(queryNovel);
    if (outcome.usageId)
      await stampUsageYield(outcome.usageId, leads.length, queryNovel);
  }

  providerState.brave_search = { executed: [...executed], novel: novelHistory };
  providerState.structured = { matched: structuredCount ?? 0 };

  raw += structuredCount ?? 0;

  if (errorClass) {
    const retryable = [
      "transient_provider_error",
      "rate_limited",
      "invalid_provider_response",
    ].includes(errorClass);
    if (retryable && attempt < budgets.maxAttempts) {
      await finishTask(taskId, "retry_required", {
        provider_state: providerState,
        raw_count: raw,
        novel_count: novel,
        error_class: errorClass,
        last_error: lastError,
        next_retry_at: new Date(
          Date.now() + retryDelayMs(attempt, Math.random()),
        ).toISOString(),
      });
    } else {
      // A failed search never masquerades as verified emptiness.
      await finishTask(taskId, retryable ? "partial" : "blocked", {
        provider_state: providerState,
        raw_count: raw,
        novel_count: novel,
        error_class: errorClass,
        last_error: lastError,
      });
    }
    return "done";
  }

  // Empty is only proven emptiness when the structured sources actually
  // looked; without an ingest the unit stays partial, never no-results.
  const status =
    raw > 0
      ? "complete"
      : structuredIngested
        ? "complete_no_results"
        : "partial";
  await finishTask(taskId, status, {
    provider_state: providerState,
    raw_count: raw,
    novel_count: novel,
    error_class: null,
    last_error:
      status === "partial"
        ? "No structured extraction ingested for this run; emptiness is unproven."
        : null,
    first_scanned_at:
      (task.first_scanned_at as string | null) ?? new Date().toISOString(),
  });

  // Cluster execution covers its members: each member keeps its own status
  // plus evidence of HOW it was covered.
  if (unit.level === "cluster" && memberIds.length) {
    for (const memberId of memberIds) {
      const { count: memberHits } = await serviceClient
        .from("map_coverage_discoveries")
        .select("id", { count: "exact", head: true })
        .eq("run_id", run.id)
        .eq("unit_id", memberId);
      await serviceClient
        .from("map_coverage_tasks")
        .update({
          status:
            (memberHits ?? 0) > 0
              ? "complete"
              : structuredIngested
                ? "complete_no_results"
                : "partial",
          covered_by_task_id: taskId,
          provider_state: {
            coveredBy: `cluster ${unit.externalId}`,
            structured: { matched: memberHits ?? 0 },
          },
          raw_count: memberHits ?? 0,
          last_scanned_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", run.id)
        .eq("unit_id", memberId)
        .in("status", ["queued", "discovering"]);
    }
  }
  return "done";
}

// ---------------------------------------------------------------------------
// Handoff into the 0087 pipeline. Structured discoveries (with coordinates)
// become candidate batches; coordinate-less web leads go to the manual queue
// exactly like the manual Brave lane always has.

async function handOffBatches(
  run: RunRow,
  budgets: CoveragePolicy["budgets"],
): Promise<Record<string, unknown>> {
  if (!run.seed_area_id) return { skipped: "no_area" };
  const pending = await pageAll<Record<string, unknown>>(
    (from, to) =>
      serviceClient
        .from("map_coverage_discoveries")
        .select("*")
        .eq("run_id", run.id)
        .is("merged_into", null)
        .is("batch_run_id", null)
        .is("candidate_status", null)
        .order("id", { ascending: true })
        .range(from, to),
    10000,
  );
  if (!pending.length) return { pending: 0 };

  const result: Record<string, unknown> = { pending: pending.length };
  let batches = 0;
  let handedToQueue = 0;
  const hasCoords = (d: Record<string, unknown>) =>
    d.latitude !== null &&
    d.longitude !== null &&
    Number.isFinite(Number(d.latitude)) &&
    Number.isFinite(Number(d.longitude));

  // Bounded website enrichment: structured discoveries with a site but no
  // category evidence get homepage metadata as extra filter text. Per-tick
  // AND per-day budgets; platform hosts are never fetched; every attempt is
  // marked so a null result is not refetched forever.
  const dayKey = new Date().toISOString().slice(0, 10);
  const { data: counterRow } = await serviceClient
    .from("map_coverage_runs")
    .select("counters")
    .eq("id", run.id)
    .maybeSingle();
  const runCounters = (counterRow?.counters as Record<string, unknown>) ?? {};
  let enrichedToday =
    runCounters.enrichmentDay === dayKey
      ? Number(runCounters.enrichmentCountToday ?? 0)
      : 0;
  let enriched = 0;
  for (const d of pending) {
    if (enriched >= 10 || enrichedToday >= budgets.maxEnrichmentsPerDay) break;
    const payload = (d.payload_minimal as Record<string, unknown> | null) ?? {};
    if (
      (d.provider === "overture" || d.provider === "osm") &&
      d.website_url &&
      !d.category &&
      !payload.description &&
      !payload.enrichmentTried &&
      normalizedDomain(d.website_url as string)
    ) {
      const evidence = await fetchSiteEvidence(d.website_url as string);
      enriched += 1;
      enrichedToday += 1;
      payload.enrichmentTried = true;
      if (evidence) payload.description = evidence;
      d.payload_minimal = payload;
      await serviceClient
        .from("map_coverage_discoveries")
        .update({ payload_minimal: payload })
        .eq("id", d.id as string);
    }
  }
  if (enriched) {
    await serviceClient
      .from("map_coverage_runs")
      .update({
        counters: {
          ...runCounters,
          enrichmentDay: dayKey,
          enrichmentCountToday: enrichedToday,
          enrichments: Number(runCounters.enrichments ?? 0) + enriched,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
  }

  // Structured discoveries WITH coordinates -> 0087 batches. Chunk at the
  // import ceiling so a full chunk can never trip the maxImport gate, and
  // bound batches per tick (one invocation is never the whole country).
  const chunkSize = Math.min(budgets.maxBatchSize, budgets.maxImportPerBatch);
  const maxBatchesPerTick = 4;
  outer: for (const provider of ["overture", "osm"] as const) {
    const rows = pending.filter((d) => d.provider === provider && hasCoords(d));
    for (let i = 0; i < rows.length; i += chunkSize) {
      if (batches >= maxBatchesPerTick) {
        result.deferred = "batch budget for this tick reached";
        break outer;
      }
      const chunk = rows.slice(i, i + chunkSize);
      const candidates = chunk.map((d) => ({
        id:
          (d.provider_result_id as string | null) ??
          `${provider}:${d.id as string}`,
        name: d.name as string,
        latitude: Number(d.latitude),
        longitude: Number(d.longitude),
        category: (d.category as string | null) ?? null,
        city: (d.city as string | null) ?? null,
        country: run.country_code,
        websiteUrl: (d.website_url as string | null) ?? null,
        socialUrl: (d.social_url as string | null) ?? null,
        description:
          ((d.payload_minimal as Record<string, unknown> | null)
            ?.description as string | undefined) ?? null,
      }));
      const outcome = await runCountrySeed({
        adminId: run.created_by,
        countryCode: run.country_code,
        areaId: run.seed_area_id,
        raw: JSON.stringify(candidates),
        inputLabel: `coverage ${run.id.slice(0, 8)} ${provider} batch ${batches + 1}`,
        mode: run.mode === "import" ? "import" : "dry_run",
        maxImport: budgets.maxImportPerBatch,
        source: {
          type: provider === "osm" ? "osm" : "overture_maps",
          attribution:
            provider === "osm" ? OSM_ATTRIBUTION : OVERTURE_ATTRIBUTION,
        },
      });
      // Stamp handled ONLY on success, or on the idempotency refusal whose
      // prior import already holds this exact input. Every other error
      // leaves the chunk unbatched so the next tick retries it.
      const alreadyImported =
        "error" in outcome &&
        outcome.runId &&
        outcome.error.includes("already imported");
      if ("summary" in outcome || alreadyImported) {
        const batchRunId =
          "summary" in outcome
            ? outcome.summary.runId
            : (outcome.runId as string);
        await serviceClient
          .from("map_coverage_discoveries")
          .update({ batch_run_id: batchRunId })
          .in(
            "id",
            chunk.map((d) => d.id as string),
          );
        batches += 1;
        continue;
      }
      result[`batchError_${provider}`] = outcome.error;
      // Stop this provider's handoff for the tick; the finalize gate sees
      // the batchError and keeps the run open.
      break;
    }
  }

  // Discoveries without coordinates (web leads, and the rare structured row
  // missing geometry) cannot enter the automated import: they go to the
  // EXISTING manual review lane instead.
  const leads = pending.filter((d) => !hasCoords(d));
  for (const lead of leads.slice(0, 100)) {
    const url =
      (lead.source_url as string | null) ??
      (lead.website_url as string | null) ??
      (lead.social_url as string | null) ??
      "";
    if (!url) {
      await serviceClient
        .from("map_coverage_discoveries")
        .update({ candidate_status: "unusable_no_link" })
        .eq("id", lead.id as string);
      continue;
    }
    const isInstagram = /instagram\.com\//i.test(url);
    const sourceType =
      lead.provider === "osm"
        ? "osm"
        : lead.provider === "overture"
          ? "overture_maps"
          : "brave_search";
    const { error } = await serviceClient.from("map_seed_candidates").insert({
      seed_area_id: run.seed_area_id,
      source_type: sourceType,
      source_url: url,
      social_url: isInstagram ? url : null,
      website_url: isInstagram ? null : url,
      name: lead.name as string,
      city: (lead.city as string | null) ?? null,
      country: run.country_code,
      status: "new",
      provenance_notes: `Coverage run ${run.id.slice(0, 8)}: lead without coordinates for ${lead.city ?? "unknown"}`,
      created_by: run.created_by,
    });
    if (error && error.code !== "23505") {
      // Leave the discovery pending so the next tick retries; never
      // silently drop a lead.
      result.leadError = error.message;
      continue;
    }
    await serviceClient
      .from("map_coverage_discoveries")
      .update({
        candidate_status:
          error?.code === "23505" ? "already_pooled" : "queued_manual",
      })
      .eq("id", lead.id as string);
    handedToQueue += 1;
  }

  if (batches || handedToQueue) {
    await bumpCounters(run.id, {
      batchesCreated: batches,
      manualLeadsQueued: handedToQueue,
    });
  }
  result.batches = batches;
  result.manualLeads = handedToQueue;
  return result;
}

// ---------------------------------------------------------------------------
// Finalization: coverage report + terminal status. Gaps stay enumerated.

async function finalizeRun(
  run: RunRow,
  units: CoverageUnitRow[],
): Promise<void> {
  await setRunStatus(run.id, "verifying_coverage");
  const policy = getCoveragePolicy(run.country_code) ?? DE_COVERAGE_POLICY;
  const unitById = new Map(units.map((u) => [u.id, u]));
  const tasks = await pageAll<Record<string, unknown>>(
    (from, to) =>
      serviceClient
        .from("map_coverage_tasks")
        .select("unit_id, status, provider_state, error_class")
        .eq("run_id", run.id)
        .order("id", { ascending: true })
        .range(from, to),
    50000,
  );
  const rows: CompletionTaskRow[] = tasks
    .map((t) => {
      const unit = unitById.get(t.unit_id as string);
      if (!unit || unit.level === "cluster") return null;
      return {
        status: t.status as CompletionTaskRow["status"],
        population: unit.population ?? 0,
        areaKm2: unit.areaKm2 ?? 0,
        externalId: unit.externalId,
        name: unit.name,
        providerActionsComplete:
          !t.error_class &&
          ["complete", "complete_no_results"].includes(t.status as string),
      };
    })
    .filter(Boolean) as CompletionTaskRow[];

  const report = computeCoverageReport(rows, policy);
  await serviceClient
    .from("map_coverage_runs")
    .update({
      status: report.finalStatus,
      // Explicit truncation: the founder must never mistake the stored
      // sample for the full gap list.
      gaps: {
        total: report.gaps.length,
        truncated: report.gaps.length > 500,
        list: report.gaps.slice(0, 500),
      },
      counters: await mergedCounters(run.id, report),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  await writeAudit({
    action: "coverage_run_finished",
    actor: run.created_by ?? "seed-coverage",
    category: run.created_by ? "admin" : "system",
    details: {
      run_id: run.id,
      country: run.country_code,
      scope: run.scope,
      status: report.finalStatus,
      units: report.totalUnits,
      done: report.doneUnits,
      gaps: report.gaps.length,
    },
  });

  // Pilot auto-advance: only when the founder explicitly set it at run
  // creation, only after a fully clean pilot import, never recursively
  // (the nationwide run is created with autoAdvance false).
  if (
    run.auto_advance &&
    run.scope === "pilot" &&
    run.mode === "import" &&
    report.finalStatus === "completed"
  ) {
    const advanced = await createCoverageRun({
      countryCode: run.country_code,
      scope: "nationwide",
      mode: "import",
      autoAdvance: false,
      createdBy: run.created_by,
    });
    await writeAudit({
      action: "coverage_pilot_auto_advanced",
      actor: run.created_by ?? "seed-coverage",
      category: run.created_by ? "admin" : "system",
      details: {
        pilot_run_id: run.id,
        nationwide_run_id: advanced.runId ?? null,
        error: advanced.error ?? null,
      },
    });
  }
}

async function mergedCounters(
  runId: string,
  report: unknown,
): Promise<Record<string, unknown>> {
  const { data } = await serviceClient
    .from("map_coverage_runs")
    .select("counters")
    .eq("id", runId)
    .maybeSingle();
  return { ...((data?.counters as Record<string, unknown>) ?? {}), report };
}

// ---------------------------------------------------------------------------
// Founder controls.

export async function pauseCoverageRun(
  runId: string,
): Promise<{ error?: string }> {
  const { data } = await serviceClient
    .from("map_coverage_runs")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", runId)
    .in("status", [
      "created",
      "discovering",
      "processing_candidates",
      "paused_budget",
      "paused_rate_limit",
    ])
    .select("id");
  return data?.length ? {} : { error: "The run is not in a pausable state." };
}

export async function resumeCoverageRun(
  runId: string,
): Promise<{ error?: string }> {
  const { data } = await serviceClient
    .from("map_coverage_runs")
    .update({ status: "discovering", updated_at: new Date().toISOString() })
    .eq("id", runId)
    .in("status", ["paused", "paused_budget", "paused_rate_limit"])
    .select("id");
  return data?.length ? {} : { error: "The run is not paused." };
}

export async function cancelCoverageRun(
  runId: string,
): Promise<{ error?: string }> {
  const { data } = await serviceClient
    .from("map_coverage_runs")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .not("status", "in", "(completed,completed_with_gaps,failed,cancelled)")
    .select("id");
  if (!data?.length) return { error: "The run already ended." };
  await serviceClient
    .from("map_coverage_tasks")
    .update({
      status: "skipped_by_policy",
      updated_at: new Date().toISOString(),
    })
    .eq("run_id", runId)
    .in("status", ["queued", "retry_required", "discovering"]);
  return {};
}

export async function retryCoverageFailures(
  runId: string,
): Promise<{ error?: string; requeued?: number }> {
  const { data } = await serviceClient
    .from("map_coverage_tasks")
    .update({
      status: "queued",
      attempt: 0,
      error_class: null,
      last_error: null,
      next_retry_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("run_id", runId)
    .in("status", ["retry_required", "partial", "blocked", "stale"])
    .select("id");
  const requeued = data?.length ?? 0;
  if (requeued) {
    await serviceClient
      .from("map_coverage_runs")
      .update({ status: "discovering", updated_at: new Date().toISOString() })
      .eq("id", runId)
      .in("status", ["completed_with_gaps", "paused", "blocked"]);
  }
  return { requeued };
}

// ---------------------------------------------------------------------------
// Admin reads.

export type CoverageRunListRow = {
  id: string;
  countryCode: string;
  scope: string;
  mode: string;
  status: string;
  policyVersion: string;
  datasetVersion: string;
  counters: Record<string, unknown> | null;
  gaps: {
    total: number;
    truncated: boolean;
    list: Array<{ externalId: string; name: string; status: string }>;
  } | null;
  pilotSelection: unknown[] | null;
  seedAreaId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export async function listCoverageRuns(
  countryCode?: string,
): Promise<CoverageRunListRow[]> {
  let q = serviceClient
    .from("map_coverage_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  if (countryCode) q = q.eq("country_code", countryCode);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    countryCode: r.country_code as string,
    scope: r.scope as string,
    mode: r.mode as string,
    status: r.status as string,
    policyVersion: r.policy_version as string,
    datasetVersion: r.dataset_version as string,
    counters: (r.counters as Record<string, unknown> | null) ?? null,
    gaps: (r.gaps as CoverageRunListRow["gaps"]) ?? null,
    pilotSelection: (r.pilot_selection as unknown[] | null) ?? null,
    seedAreaId: (r.seed_area_id as string | null) ?? null,
    startedAt: (r.started_at as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export type CoverageTaskListRow = {
  id: string;
  unitName: string;
  unitExternalId: string;
  stateName: string | null;
  level: string;
  strategy: string;
  status: string;
  attempt: number;
  rawCount: number;
  novelCount: number;
  errorClass: string | null;
  lastError: string | null;
  providerState: Record<string, unknown> | null;
};

export async function listCoverageTasks(
  runId: string,
  statusFilter?: string,
): Promise<CoverageTaskListRow[]> {
  let q = serviceClient
    .from("map_coverage_tasks")
    .select("*, map_coverage_units(name, external_id, state_name, level)")
    .eq("run_id", runId)
    .order("priority", { ascending: false })
    .limit(1000);
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data } = await q;
  return (data ?? []).map((t) => {
    const unit = t.map_coverage_units as Record<string, unknown> | null;
    return {
      id: t.id as string,
      unitName: (unit?.name as string) ?? "?",
      unitExternalId: (unit?.external_id as string) ?? "?",
      stateName: (unit?.state_name as string | null) ?? null,
      level: (unit?.level as string) ?? "municipality",
      strategy: t.strategy as string,
      status: t.status as string,
      attempt: Number(t.attempt ?? 0),
      rawCount: Number(t.raw_count ?? 0),
      novelCount: Number(t.novel_count ?? 0),
      errorClass: (t.error_class as string | null) ?? null,
      lastError: (t.last_error as string | null) ?? null,
      providerState:
        (t.provider_state as Record<string, unknown> | null) ?? null,
    };
  });
}
