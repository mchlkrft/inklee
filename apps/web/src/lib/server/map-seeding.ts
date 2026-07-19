import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import {
  classifyDuplicate,
  normalizeInstagramHandle,
  type DuplicateCandidateInput,
  type DuplicateConfidence,
} from "@inklee/shared/map-directory";
import {
  BRAVE_SEARCH_DAILY_CAP,
  BRAVE_SEARCH_MONTHLY_CAP,
  SEED_AREA_STATUSES,
  SEED_QUERY_MAX,
  canTransitionSeedCandidate,
  instagramHandleFromSeedUrl,
  isHttpsSeedUrl,
  parseOvertureImport,
  shapeBraveResults,
  usageDayKey,
  usageMonthKey,
  validateManualCandidateInput,
  validateSeedAreaInput,
  type BraveLead,
  type ManualCandidateInput,
  type OvertureImportCandidate,
  type SeedAreaInput,
  type SeedCandidateStatus,
} from "@inklee/shared/map-seeding";

// Map seeding tool server core (SoT: docs/product/inklee-2-map-seeding-tool.md).
// A lead collector, not an importer: candidates are uncapped leads, the locked
// density cap fires at conversion through the existing map-location create
// pipeline, and every automated provider request goes through the usage
// ledger BEFORE it leaves the server. All callers are admin-only actions.

const OVERTURE_ATTRIBUTION = "Overture Maps (CDLA-Permissive-2.0)";

// ---------------------------------------------------------------------------
// Seed areas (planning entities).

export type SeedAreaRow = {
  id: string;
  label: string;
  city: string | null;
  country: string | null;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  status: string;
  notes: string | null;
};

export async function createSeedAreaCore(
  adminId: string,
  input: SeedAreaInput,
): Promise<{ error?: string; id?: string }> {
  const invalid = validateSeedAreaInput(input);
  if (invalid) return { error: invalid };
  const { data, error } = await serviceClient
    .from("map_seed_areas")
    .insert({
      label: input.label.trim(),
      city: input.city?.trim() || null,
      country: input.country?.trim() || null,
      center_lat: input.centerLat,
      center_lng: input.centerLng,
      radius_km: input.radiusKm,
      created_by: adminId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the area." };
  return { id: data.id as string };
}

export async function setSeedAreaStatusCore(
  adminId: string,
  areaId: string,
  status: string,
): Promise<{ error?: string }> {
  if (!(SEED_AREA_STATUSES as readonly string[]).includes(status))
    return { error: "Pick a valid area status." };
  const { data } = await serviceClient
    .from("map_seed_areas")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", areaId)
    .select("id");
  if (!data?.length) return { error: "Area not found." };
  return {};
}

function shapeArea(row: Record<string, unknown>): SeedAreaRow {
  return {
    id: row.id as string,
    label: row.label as string,
    city: (row.city as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    centerLat: Number(row.center_lat),
    centerLng: Number(row.center_lng),
    radiusKm: Number(row.radius_km),
    status: row.status as string,
    notes: (row.notes as string | null) ?? null,
  };
}

export async function getSeedArea(areaId: string): Promise<SeedAreaRow | null> {
  const { data } = await serviceClient
    .from("map_seed_areas")
    .select("*")
    .eq("id", areaId)
    .maybeSingle();
  return data ? shapeArea(data) : null;
}

/**
 * PostgREST caps every response at 1000 rows regardless of .limit (the
 * config.toml max_rows gotcha); page in windows like the resolve-segment
 * helper does. `max` is a hard ceiling against runaway tables.
 */
export async function pageAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  max: number,
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; from < max; from += page) {
    const { data } = await build(from, Math.min(from + page, max) - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}

export async function listSeedAreas(): Promise<
  Array<SeedAreaRow & { candidateCounts: Record<string, number> }>
> {
  const [{ data: areas }, candidates] = await Promise.all([
    serviceClient
      .from("map_seed_areas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    pageAll<{ seed_area_id: string | null; status: string }>(
      (from, to) =>
        serviceClient
          .from("map_seed_candidates")
          .select("seed_area_id, status")
          .order("id", { ascending: true })
          .range(from, to),
      20000,
    ),
  ]);
  const counts = new Map<string, Record<string, number>>();
  for (const c of candidates) {
    const key = c.seed_area_id ?? "none";
    const bucket = counts.get(key) ?? {};
    bucket[c.status] = (bucket[c.status] ?? 0) + 1;
    counts.set(key, bucket);
  }
  return (areas ?? []).map((a) => ({
    ...shapeArea(a),
    candidateCounts: counts.get(a.id as string) ?? {},
  }));
}

/** Bounding box of the area circle (degrees), clamped to valid ranges. */
function areaBbox(area: SeedAreaRow): {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
} {
  const latDelta = area.radiusKm / 111.32;
  const cos = Math.max(0.05, Math.cos((area.centerLat * Math.PI) / 180));
  const lngDelta = area.radiusKm / (111.32 * cos);
  return {
    latMin: Math.max(-90, area.centerLat - latDelta),
    latMax: Math.min(90, area.centerLat + latDelta),
    lngMin: Math.max(-180, area.centerLng - lngDelta),
    lngMax: Math.min(180, area.centerLng + lngDelta),
  };
}

export type BucketCapacity = {
  bucket: string;
  seeded: number;
  cap: number;
};

/**
 * Live density capacity inside the area: seeded map entries grouped by their
 * ~300 square km bucket. Display only; enforcement stays in the create path.
 */
export async function areaBucketCapacity(
  area: SeedAreaRow,
  cap: number,
): Promise<{ buckets: BucketCapacity[]; totalSeeded: number }> {
  const box = areaBbox(area);
  const rows = await pageAll<{ seed_region_bucket: string | null }>(
    (from, to) =>
      serviceClient
        .from("map_locations")
        .select("seed_region_bucket")
        .eq("is_seed", true)
        .neq("moderation_status", "removed")
        .gte("latitude", box.latMin)
        .lte("latitude", box.latMax)
        .gte("longitude", box.lngMin)
        .lte("longitude", box.lngMax)
        .order("id", { ascending: true })
        .range(from, to),
    5000,
  );
  const byBucket = new Map<string, number>();
  for (const row of rows) {
    const b = row.seed_region_bucket ?? "unknown";
    byBucket.set(b, (byBucket.get(b) ?? 0) + 1);
  }
  const buckets = [...byBucket.entries()]
    .map(([bucket, seeded]) => ({ bucket, seeded, cap }))
    .sort((a, b) => b.seeded - a.seeded);
  return { buckets, totalSeeded: rows.length };
}

// ---------------------------------------------------------------------------
// Duplicate annotation (bulk, in-process). Reuses the shipped Phase 1
// classifier against existing map locations, plus exact URL and name checks
// against the candidate pool. Nothing auto-merges; annotations only.

export type ExistingLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  instagramHandle: string | null;
  websiteUrl: string | null;
  /** Set when the entry belongs to a claimed studio (never auto-touched). */
  studioProfileId: string | null;
};

export type ExistingCandidate = {
  id: string;
  name: string;
  sourceUrl: string | null;
  socialUrl: string | null;
  websiteUrl: string | null;
};

export type SeedAnnotationContext = {
  locations: ExistingLocation[];
  candidates: ExistingCandidate[];
};

export type DuplicateAnnotation = {
  confidence: DuplicateConfidence;
  locationId?: string;
  candidateId?: string;
  reason: string;
} | null;

function instagramHandleFromUrl(url: string | null | undefined): string | null {
  const handle = instagramHandleFromSeedUrl(url);
  return handle ? normalizeInstagramHandle(handle) : null;
}

function lowerUrl(value: string | null | undefined): string | null {
  return value ? value.trim().toLowerCase().replace(/\/+$/, "") : null;
}

export async function loadAnnotationContext(
  area: SeedAreaRow | null,
): Promise<SeedAnnotationContext> {
  const [locations, candidates] = await Promise.all([
    pageAll<Record<string, unknown>>((from, to) => {
      const q = serviceClient
        .from("map_locations")
        .select(
          "id, name, latitude, longitude, address, instagram_handle, website_url, studio_profile_id",
        )
        .neq("moderation_status", "removed")
        .order("id", { ascending: true })
        .range(from, to);
      if (area) {
        const box = areaBbox(area);
        q.gte("latitude", box.latMin)
          .lte("latitude", box.latMax)
          .gte("longitude", box.lngMin)
          .lte("longitude", box.lngMax);
      }
      return q;
    }, 5000),
    pageAll<Record<string, unknown>>((from, to) => {
      const q = serviceClient
        .from("map_seed_candidates")
        .select("id, name, source_url, social_url, website_url")
        .order("id", { ascending: true })
        .range(from, to);
      if (area) q.eq("seed_area_id", area.id);
      return q;
    }, 10000),
  ]);
  return {
    locations: (locations ?? []).map((l) => ({
      id: l.id as string,
      name: l.name as string,
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
      address: (l.address as string | null) ?? null,
      instagramHandle: (l.instagram_handle as string | null) ?? null,
      websiteUrl: (l.website_url as string | null) ?? null,
      studioProfileId: (l.studio_profile_id as string | null) ?? null,
    })),
    candidates: (candidates ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      sourceUrl: (c.source_url as string | null) ?? null,
      socialUrl: (c.social_url as string | null) ?? null,
      websiteUrl: (c.website_url as string | null) ?? null,
    })),
  };
}

export function annotateOne(
  entry: {
    name: string;
    latitude?: number | null;
    longitude?: number | null;
    socialUrl?: string | null;
    websiteUrl?: string | null;
    sourceUrl?: string | null;
  },
  ctx: SeedAnnotationContext,
): DuplicateAnnotation {
  // Exact URL hits against the candidate pool first (the same lead found
  // twice), then the geo classifier against real map entries.
  const urls = [entry.sourceUrl, entry.socialUrl, entry.websiteUrl]
    .map(lowerUrl)
    .filter(Boolean);
  for (const c of ctx.candidates) {
    const theirs = [c.sourceUrl, c.socialUrl, c.websiteUrl]
      .map(lowerUrl)
      .filter(Boolean);
    if (urls.some((u) => theirs.includes(u)))
      return {
        confidence: "clear",
        candidateId: c.id,
        reason: "Same link as an existing candidate.",
      };
  }

  const entryHandle =
    instagramHandleFromUrl(entry.socialUrl) ??
    instagramHandleFromUrl(entry.sourceUrl);
  let best: DuplicateAnnotation = null;
  const rank: Record<DuplicateConfidence, number> = {
    clear: 3,
    likely: 2,
    possible: 1,
  };
  for (const loc of ctx.locations) {
    if (
      entryHandle &&
      loc.instagramHandle &&
      entryHandle === normalizeInstagramHandle(loc.instagramHandle)
    ) {
      return {
        confidence: "clear",
        locationId: loc.id,
        reason: "Same Instagram as an existing map entry.",
      };
    }
    if (
      Number.isFinite(entry.latitude ?? NaN) &&
      Number.isFinite(entry.longitude ?? NaN)
    ) {
      const verdict = classifyDuplicate(
        {
          name: entry.name,
          latitude: entry.latitude as number,
          longitude: entry.longitude as number,
          websiteUrl: entry.websiteUrl ?? null,
          instagramHandle: entryHandle,
        } satisfies DuplicateCandidateInput,
        {
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          address: loc.address,
          instagramHandle: loc.instagramHandle,
          websiteUrl: loc.websiteUrl,
        },
      );
      if (
        verdict &&
        (!best || rank[verdict.confidence] > rank[best.confidence])
      ) {
        best = {
          confidence: verdict.confidence,
          locationId: loc.id,
          reason: "Looks like an existing map entry.",
        };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Brave search lane. The ledger check runs BEFORE the request; blocked
// attempts are logged with a reason. Guardrails are the only wall between
// this lane and the card on file, so they fail closed.

export type BraveUsage = {
  configured: boolean;
  usedToday: number;
  usedThisMonth: number;
  dailyCap: number;
  monthlyCap: number;
  lastBlockedReason: string | null;
};

async function usageCount(
  column: "day_key" | "month_key",
  key: string,
): Promise<number | null> {
  const { count, error } = await serviceClient
    .from("map_seed_provider_usage")
    .select("id", { count: "exact", head: true })
    .eq("provider", "brave_search")
    .eq(column, key)
    .eq("blocked", false);
  if (error) return null;
  return count ?? 0;
}

export async function braveUsageSummary(): Promise<BraveUsage> {
  const now = new Date();
  const [today, month, { data: lastBlocked }] = await Promise.all([
    usageCount("day_key", usageDayKey(now)),
    usageCount("month_key", usageMonthKey(now)),
    serviceClient
      .from("map_seed_provider_usage")
      .select("block_reason")
      .eq("provider", "brave_search")
      .eq("blocked", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    configured: Boolean(process.env.MAP_SEED_BRAVE_SEARCH_KEY),
    usedToday: today ?? 0,
    usedThisMonth: month ?? 0,
    dailyCap: BRAVE_SEARCH_DAILY_CAP,
    monthlyCap: BRAVE_SEARCH_MONTHLY_CAP,
    lastBlockedReason: (lastBlocked?.block_reason as string | null) ?? null,
  };
}

export type LedgerContext = {
  createdBy: string | null;
  coverageRunId?: string | null;
  coverageUnitId?: string | null;
};

/**
 * Ledger write. Returns the new row id, or null when the insert failed; a
 * failed write must abort the request (the ledger is the only wall between
 * this lane and the card on file).
 */
async function recordUsage(
  context: LedgerContext,
  provider: "brave_search" | "osm_overpass",
  query: string,
  blocked: boolean,
  blockReason: string | null,
): Promise<string | null> {
  const now = new Date();
  const { data, error } = await serviceClient
    .from("map_seed_provider_usage")
    .insert({
      provider,
      query,
      day_key: usageDayKey(now),
      month_key: usageMonthKey(now),
      blocked,
      block_reason: blockReason,
      created_by: context.createdBy,
      // Conditional: pre-0088 schemas (deploy-order safety) must keep
      // accepting manual-lane writes.
      ...(context.coverageRunId
        ? { coverage_run_id: context.coverageRunId }
        : {}),
      ...(context.coverageUnitId
        ? { coverage_unit_id: context.coverageUnitId }
        : {}),
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as string;
}

/**
 * Remaining global Brave headroom across BOTH lanes (manual + coverage).
 * Null on ledger read failure (callers must fail closed).
 */
export async function braveGlobalHeadroom(): Promise<{
  dayRemaining: number;
  monthRemaining: number;
} | null> {
  const now = new Date();
  const [today, month, trailing] = await Promise.all([
    usageCount("day_key", usageDayKey(now)),
    usageCount("month_key", usageMonthKey(now)),
    usageCountTrailing30(),
  ]);
  if (today === null || month === null || trailing === null) return null;
  return {
    dayRemaining: Math.max(0, BRAVE_SEARCH_DAILY_CAP - today),
    monthRemaining: Math.max(
      0,
      BRAVE_SEARCH_MONTHLY_CAP - Math.max(month, trailing),
    ),
  };
}

/** Record an externally executed extraction (e.g. one bounded Overpass query). */
export async function recordExternalExtraction(
  context: LedgerContext,
  provider: "osm_overpass",
  label: string,
): Promise<void> {
  await recordUsage(context, provider, label, false, null);
}

/** Stamp result yield onto a ledger row after the response was processed. */
export async function stampUsageYield(
  usageId: string,
  resultCount: number,
  novelCount: number,
): Promise<void> {
  await serviceClient
    .from("map_seed_provider_usage")
    .update({ result_count: resultCount, novel_count: novelCount })
    .eq("id", usageId);
}

async function blockUsageRow(id: string, reason: string): Promise<void> {
  await serviceClient
    .from("map_seed_provider_usage")
    .update({ blocked: true, block_reason: reason })
    .eq("id", id);
}

/** Non-blocked requests in the trailing 30 days (billing-cycle safety net). */
async function usageCountTrailing30(): Promise<number | null> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await serviceClient
    .from("map_seed_provider_usage")
    .select("id", { count: "exact", head: true })
    .eq("provider", "brave_search")
    .eq("blocked", false)
    .gte("created_at", since);
  if (error) return null;
  return count ?? 0;
}

export type BraveSearchOutcome = {
  error?: string;
  /** Coverage-orchestrator error classification for retry decisions. */
  errorClass?:
    | "rate_limited"
    | "budget_exhausted"
    | "transient_provider_error"
    | "authentication_error"
    | "invalid_provider_response";
  leads?: BraveLead[];
  usageId?: string;
};

/**
 * The ONE Brave request path (manual lane and coverage worker both ride it):
 * ledger insert-then-count kills the TOCTOU race, caps fail closed, every
 * outcome stays attributable via the returned usage row id.
 */
export async function braveLedgerSearch(
  context: LedgerContext,
  query: string,
): Promise<BraveSearchOutcome> {
  const key = process.env.MAP_SEED_BRAVE_SEARCH_KEY;
  if (!key)
    return {
      error:
        "Brave search is not configured. Set MAP_SEED_BRAVE_SEARCH_KEY to enable the lane.",
      errorClass: "authentication_error",
    };
  const q = query.trim();
  if (!q) return { error: "Type a search first." };
  if (q.length > SEED_QUERY_MAX) return { error: "Keep the search shorter." };

  // Insert first, then count INCLUDING the own row: concurrent searches
  // cannot all pass the same pre-check, and a failed ledger write aborts
  // before any billable request. This lane fails closed by design.
  const usageId = await recordUsage(context, "brave_search", q, false, null);
  if (!usageId)
    return {
      error: "Could not write the usage ledger. No request was made.",
      errorClass: "transient_provider_error",
    };

  const now = new Date();
  const [today, month, trailing] = await Promise.all([
    usageCount("day_key", usageDayKey(now)),
    usageCount("month_key", usageMonthKey(now)),
    usageCountTrailing30(),
  ]);
  if (today === null || month === null || trailing === null) {
    await blockUsageRow(usageId, "Ledger unreadable after write.");
    return {
      error: "Could not read the usage ledger. No request was made.",
      errorClass: "transient_provider_error",
    };
  }
  // The trailing window guards Brave's billing cycle: two calendar months
  // can straddle one cycle, so the monthly cap alone is not enough.
  if (month > BRAVE_SEARCH_MONTHLY_CAP || trailing > BRAVE_SEARCH_MONTHLY_CAP) {
    const reason = `Monthly cap reached (${Math.max(month, trailing)}/${BRAVE_SEARCH_MONTHLY_CAP}).`;
    await blockUsageRow(usageId, reason);
    return {
      error: `${reason} The lane reopens as usage rolls off.`,
      errorClass: "budget_exhausted",
      usageId,
    };
  }
  if (today > BRAVE_SEARCH_DAILY_CAP) {
    const reason = `Daily cap reached (${today}/${BRAVE_SEARCH_DAILY_CAP}).`;
    await blockUsageRow(usageId, reason);
    return {
      error: `${reason} The lane reopens tomorrow.`,
      errorClass: "budget_exhausted",
      usageId,
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": key,
        },
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    return {
      error: "The search request failed. The query still counted.",
      errorClass: "transient_provider_error",
      usageId,
    };
  }
  if (!response.ok)
    return {
      error: `Brave returned ${response.status}. The query still counted.`,
      errorClass:
        response.status === 429
          ? "rate_limited"
          : response.status === 401 || response.status === 403
            ? "authentication_error"
            : "transient_provider_error",
      usageId,
    };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      error: "Brave returned an unreadable response.",
      errorClass: "invalid_provider_response",
      usageId,
    };
  }
  return { leads: shapeBraveResults(payload), usageId };
}

export async function braveSearchCore(
  adminId: string,
  query: string,
): Promise<{ error?: string; leads?: BraveLead[] }> {
  const outcome = await braveLedgerSearch({ createdBy: adminId }, query);
  return outcome.error
    ? { error: outcome.error }
    : { leads: outcome.leads ?? [] };
}

export async function storeBraveSelectionCore(
  adminId: string,
  areaId: string,
  query: string,
  leads: BraveLead[],
): Promise<{
  error?: string;
  stored?: number;
  duplicates?: number;
  failed?: number;
}> {
  const area = await getSeedArea(areaId);
  if (!area) return { error: "Area not found." };
  if (!leads.length) return { error: "Pick at least one result." };
  if (leads.length > 50) return { error: "Pick fewer results at once." };

  const { data: run, error: runErr } = await serviceClient
    .from("map_seed_runs")
    .insert({
      seed_area_id: areaId,
      provider: "brave_search",
      query: query.slice(0, SEED_QUERY_MAX),
      result_count: leads.length,
      created_by: adminId,
    })
    .select("id")
    .single();
  if (runErr || !run) return { error: "Could not record the run." };

  const ctx = await loadAnnotationContext(area);
  let stored = 0;
  let duplicates = 0;
  let failed = 0;
  for (const lead of leads) {
    const url = lead.url?.trim();
    const title = lead.title?.trim();
    // Re-check the scheme server-side: the selection round-trips through the
    // client and lands in a clickable admin href.
    if (!url || !title || !isHttpsSeedUrl(url)) continue;
    const annotation = annotateOne(
      { name: title, sourceUrl: url, socialUrl: url },
      ctx,
    );
    // Keep the lead usable at conversion: Instagram URLs prefill the handle,
    // anything else prefills the website (integration sweep finding).
    const isInstagram = /instagram\.com\//i.test(url);
    const { error } = await serviceClient.from("map_seed_candidates").insert({
      seed_run_id: run.id,
      seed_area_id: areaId,
      source_type: "brave_search",
      source_url: url,
      social_url: isInstagram ? url : null,
      website_url: isInstagram ? null : url,
      source_payload_minimal: { query: query.slice(0, SEED_QUERY_MAX) },
      name: title,
      city: area.city,
      country: area.country,
      status:
        annotation && annotation.confidence !== "possible"
          ? "likely_duplicate"
          : "new",
      duplicate_confidence: annotation?.confidence ?? null,
      duplicate_of_candidate_id: annotation?.candidateId ?? null,
      duplicate_location_id: annotation?.locationId ?? null,
      provenance_notes: `Brave search: ${query.slice(0, SEED_QUERY_MAX)}`,
      created_by: adminId,
    });
    if (error) {
      if (error.code === "23505") duplicates += 1;
      else failed += 1;
      continue;
    }
    stored += 1;
  }
  await serviceClient
    .from("map_seed_runs")
    .update({ stored_count: stored, duplicate_count: duplicates })
    .eq("id", run.id);
  return { stored, duplicates, failed };
}

// ---------------------------------------------------------------------------
// Overture import lane (file produced by scripts/overture-tattoo-extract.cjs;
// the preview IS the dry run, nothing persists until commit).

export type AnnotatedOvertureCandidate = OvertureImportCandidate & {
  annotation: DuplicateAnnotation;
};

export async function previewOvertureImportCore(
  areaId: string,
  raw: string,
): Promise<{ error?: string; rows?: AnnotatedOvertureCandidate[] }> {
  const area = await getSeedArea(areaId);
  if (!area) return { error: "Area not found." };
  const parsed = parseOvertureImport(raw);
  if ("error" in parsed) return { error: parsed.error };
  const ctx = await loadAnnotationContext(area);
  return {
    rows: parsed.candidates.map((c) => ({
      ...c,
      annotation: annotateOne(
        {
          name: c.name,
          latitude: c.latitude,
          longitude: c.longitude,
          websiteUrl: c.websiteUrl,
          socialUrl: c.socialUrl,
        },
        ctx,
      ),
    })),
  };
}

export async function commitOvertureImportCore(
  adminId: string,
  areaId: string,
  raw: string,
  fileLabel: string | null,
): Promise<{
  error?: string;
  stored?: number;
  duplicates?: number;
  failed?: number;
}> {
  const area = await getSeedArea(areaId);
  if (!area) return { error: "Area not found." };
  const parsed = parseOvertureImport(raw);
  if ("error" in parsed) return { error: parsed.error };

  const { data: run, error: runErr } = await serviceClient
    .from("map_seed_runs")
    .insert({
      seed_area_id: areaId,
      provider: "overture_maps",
      query: fileLabel?.slice(0, SEED_QUERY_MAX) ?? null,
      result_count: parsed.candidates.length,
      created_by: adminId,
    })
    .select("id")
    .single();
  if (runErr || !run) return { error: "Could not record the run." };

  const ctx = await loadAnnotationContext(area);
  let stored = 0;
  let duplicates = 0;
  let failed = 0;
  for (const c of parsed.candidates) {
    const annotation = annotateOne(
      {
        name: c.name,
        latitude: c.latitude,
        longitude: c.longitude,
        websiteUrl: c.websiteUrl,
        socialUrl: c.socialUrl,
      },
      ctx,
    );
    const { error } = await serviceClient.from("map_seed_candidates").insert({
      seed_run_id: run.id,
      seed_area_id: areaId,
      source_type: "overture_maps",
      source_provider_id: c.id,
      source_url: c.websiteUrl,
      source_payload_minimal: c.category ? { category: c.category } : null,
      candidate_type: "uncertain",
      name: c.name,
      city: c.city ?? area.city,
      country: c.country ?? area.country,
      latitude: c.latitude,
      longitude: c.longitude,
      social_url: c.socialUrl,
      website_url: c.websiteUrl,
      attribution: OVERTURE_ATTRIBUTION,
      status:
        annotation && annotation.confidence !== "possible"
          ? "likely_duplicate"
          : "new",
      duplicate_confidence: annotation?.confidence ?? null,
      duplicate_of_candidate_id: annotation?.candidateId ?? null,
      duplicate_location_id: annotation?.locationId ?? null,
      created_by: adminId,
    });
    if (error) {
      if (error.code === "23505") duplicates += 1;
      else failed += 1;
      continue;
    }
    stored += 1;
  }
  await serviceClient
    .from("map_seed_runs")
    .update({ stored_count: stored, duplicate_count: duplicates })
    .eq("id", run.id);
  return { stored, duplicates, failed };
}

// ---------------------------------------------------------------------------
// Manual Instagram lane.

export async function addManualCandidateCore(
  adminId: string,
  areaId: string,
  input: ManualCandidateInput,
): Promise<{ error?: string; id?: string }> {
  const area = await getSeedArea(areaId);
  if (!area) return { error: "Area not found." };
  const invalid = validateManualCandidateInput(input);
  if (invalid) return { error: invalid };

  const ctx = await loadAnnotationContext(area);
  const annotation = annotateOne(
    {
      name: input.name,
      sourceUrl: input.sourceUrl,
      socialUrl: input.sourceUrl,
    },
    ctx,
  );
  const { data, error } = await serviceClient
    .from("map_seed_candidates")
    .insert({
      seed_area_id: areaId,
      source_type: "manual_instagram",
      source_url: input.sourceUrl.trim(),
      social_url: input.sourceUrl.trim(),
      candidate_type: input.candidateType,
      name: input.name.trim(),
      city: input.city?.trim() || area.city,
      country: input.country?.trim() || area.country,
      confidence_score: input.confidenceScore ?? null,
      provenance_notes: input.sourceContext?.trim() || null,
      admin_notes: input.notes?.trim() || null,
      status:
        annotation && annotation.confidence !== "possible"
          ? "likely_duplicate"
          : "new",
      duplicate_confidence: annotation?.confidence ?? null,
      duplicate_of_candidate_id: annotation?.candidateId ?? null,
      duplicate_location_id: annotation?.locationId ?? null,
      created_by: adminId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { error: "This link is already collected." };
    return { error: "Could not save the candidate." };
  }
  return { id: data.id as string };
}

// ---------------------------------------------------------------------------
// Review queue.

export type SeedCandidateRow = {
  id: string;
  sourceType: string;
  sourceUrl: string | null;
  sourceProviderId: string | null;
  candidateType: string;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  socialUrl: string | null;
  websiteUrl: string | null;
  confidenceScore: number | null;
  provenanceNotes: string | null;
  attribution: string | null;
  status: string;
  duplicateConfidence: string | null;
  duplicateLocationId: string | null;
  duplicateOfCandidateId: string | null;
  convertedLocationId: string | null;
  adminNotes: string | null;
  createdAt: string;
  /** Automated-lane decision fields (null on purely manual candidates). */
  decision: string | null;
  decisionConfidence: number | null;
  decisionEvidence: Record<string, unknown> | null;
  countryRunId: string | null;
  /** Contact enrichment from structured sources (0090). */
  address: string | null;
  postalCode: string | null;
  phone: string | null;
  openingHours: string | null;
  extraMetadata: Record<string, string> | null;
};

function shapeCandidate(row: Record<string, unknown>): SeedCandidateRow {
  return {
    id: row.id as string,
    sourceType: row.source_type as string,
    sourceUrl: (row.source_url as string | null) ?? null,
    sourceProviderId: (row.source_provider_id as string | null) ?? null,
    candidateType: row.candidate_type as string,
    name: row.name as string,
    city: (row.city as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    socialUrl: (row.social_url as string | null) ?? null,
    websiteUrl: (row.website_url as string | null) ?? null,
    confidenceScore:
      row.confidence_score === null ? null : Number(row.confidence_score),
    provenanceNotes: (row.provenance_notes as string | null) ?? null,
    attribution: (row.attribution as string | null) ?? null,
    status: row.status as string,
    duplicateConfidence: (row.duplicate_confidence as string | null) ?? null,
    duplicateLocationId: (row.duplicate_location_id as string | null) ?? null,
    duplicateOfCandidateId:
      (row.duplicate_of_candidate_id as string | null) ?? null,
    convertedLocationId: (row.converted_location_id as string | null) ?? null,
    adminNotes: (row.admin_notes as string | null) ?? null,
    createdAt: row.created_at as string,
    decision: (row.decision as string | null) ?? null,
    decisionConfidence:
      row.decision_confidence === null || row.decision_confidence === undefined
        ? null
        : Number(row.decision_confidence),
    decisionEvidence:
      (row.decision_evidence as Record<string, unknown> | null) ?? null,
    countryRunId: (row.country_run_id as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    postalCode: (row.postal_code as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    openingHours: (row.opening_hours as string | null) ?? null,
    extraMetadata:
      (row.extra_metadata as Record<string, string> | null) ?? null,
  };
}

export async function listAreaCandidates(
  areaId: string,
): Promise<SeedCandidateRow[]> {
  const { data } = await serviceClient
    .from("map_seed_candidates")
    .select("*")
    .eq("seed_area_id", areaId)
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map(shapeCandidate);
}

export async function getSeedCandidate(
  id: string,
): Promise<SeedCandidateRow | null> {
  const { data } = await serviceClient
    .from("map_seed_candidates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ? shapeCandidate(data) : null;
}

const REVIEW_TARGETS: Record<string, SeedCandidateStatus> = {
  reject: "rejected",
  approve: "approved_for_enrichment",
  reopen: "new",
  mark_duplicate: "likely_duplicate",
};

export async function reviewCandidateCore(
  adminId: string,
  candidateId: string,
  action: string,
  extras?: { adminNotes?: string | null; confidenceScore?: number | null },
): Promise<{ error?: string }> {
  const target = REVIEW_TARGETS[action];
  if (!target) return { error: "Pick a valid review action." };
  const candidate = await getSeedCandidate(candidateId);
  if (!candidate) return { error: "Candidate not found." };
  // Converted is terminal ONLY while the map entry exists; if an admin later
  // deleted the entry (the FK nulls converted_location_id), the lead may be
  // revived instead of rotting in a dead terminal state.
  const orphanedConversion =
    action === "reopen" &&
    candidate.status === "converted" &&
    !candidate.convertedLocationId;
  if (
    !orphanedConversion &&
    !canTransitionSeedCandidate(candidate.status, target)
  )
    return { error: "This candidate already moved on." };
  if (
    extras?.confidenceScore !== null &&
    extras?.confidenceScore !== undefined &&
    (!Number.isFinite(extras.confidenceScore) ||
      extras.confidenceScore < 0 ||
      extras.confidenceScore > 100)
  )
    return { error: "Confidence must be between 0 and 100." };

  const update: Record<string, unknown> = {
    status: target,
    reviewed_by: adminId,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (extras?.adminNotes !== undefined)
    update.admin_notes = extras.adminNotes?.trim() || null;
  if (extras?.confidenceScore !== undefined)
    update.confidence_score = extras.confidenceScore;

  const { data } = await serviceClient
    .from("map_seed_candidates")
    .update(update)
    .eq("id", candidateId)
    .eq("status", candidate.status)
    .select("id");
  if (!data?.length) return { error: "This candidate already moved on." };
  return {};
}

/** Called by the convert wrapper after the map entry was created. */
export async function markConvertedCore(
  adminId: string,
  candidateId: string,
  locationId: string,
): Promise<{ error?: string }> {
  const candidate = await getSeedCandidate(candidateId);
  if (!candidate) return { error: "Candidate not found." };
  if (!canTransitionSeedCandidate(candidate.status, "converted"))
    return { error: "This candidate already moved on." };
  const { data } = await serviceClient
    .from("map_seed_candidates")
    .update({
      status: "converted",
      converted_location_id: locationId,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId)
    .neq("status", "converted")
    .select("id");
  if (!data?.length) return { error: "This candidate already moved on." };
  return {};
}
