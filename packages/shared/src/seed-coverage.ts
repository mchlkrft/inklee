// Country coverage orchestrator - pure planning logic (Inklee 2.0).
// Owns coverage planning and discovery bookkeeping math ONLY; candidate
// processing stays in seed-filtering + the 0087 pipeline, import stays in the
// map-location core. SoT: docs/product/inklee-2-country-coverage.md.
//
// Everything here is deterministic and platform-agnostic so the planner,
// worker, tests, and admin UI share one source of truth.

import { normalizeSeedText } from "./seed-filtering";

export const COVERAGE_POLICY_VERSION = "2026-07-19.1";

// ---------------------------------------------------------------------------
// Vocabulary.

export const COVERAGE_STRATEGIES = [
  "metro_deep",
  "city_standard",
  "town_light",
  "rural_cluster",
  "structured_only",
  "gap_recheck",
] as const;
export type CoverageStrategy = (typeof COVERAGE_STRATEGIES)[number];

export const COVERAGE_TASK_STATUSES = [
  "unplanned",
  "queued",
  "discovering",
  "discovered",
  "processing",
  "complete",
  "complete_no_results",
  "partial",
  "retry_required",
  "blocked",
  "skipped_by_policy",
  "stale",
] as const;
export type CoverageTaskStatus = (typeof COVERAGE_TASK_STATUSES)[number];

/** Task statuses that count as successfully processed for completion math. */
export const COVERAGE_DONE_STATUSES: readonly CoverageTaskStatus[] = [
  "complete",
  "complete_no_results",
];

export const COVERAGE_RUN_SCOPES = [
  "pilot",
  "regional",
  "nationwide",
  "gap_fill",
] as const;
export type CoverageRunScope = (typeof COVERAGE_RUN_SCOPES)[number];

export const COVERAGE_RUN_MODES = ["planning", "discovery", "import"] as const;
export type CoverageRunMode = (typeof COVERAGE_RUN_MODES)[number];

export const COVERAGE_ERROR_CLASSES = [
  "transient_provider_error",
  "rate_limited",
  "budget_exhausted",
  "invalid_coverage_unit",
  "invalid_provider_response",
  "unsupported_location",
  "dataset_version_error",
  "authentication_error",
  "permanent_provider_error",
] as const;
export type CoverageErrorClass = (typeof COVERAGE_ERROR_CLASSES)[number];

/** Error classes that a retry can plausibly fix. */
export const RETRYABLE_ERROR_CLASSES: readonly CoverageErrorClass[] = [
  "transient_provider_error",
  "rate_limited",
  "invalid_provider_response",
];

// ---------------------------------------------------------------------------
// Types.

export type Coordinate = { latitude: number; longitude: number };

export type CoverageUnitInput = {
  externalId: string;
  name: string;
  aliases?: string[];
  stateCode: string;
  stateName: string;
  districtCode?: string | null;
  districtName?: string | null;
  population?: number | null;
  areaKm2?: number | null;
  centroid?: Coordinate | null;
  postalCode?: string | null;
  settlementClass?: string | null;
};

export type PlannedUnit = CoverageUnitInput & {
  level: "municipality";
  strategy: CoverageStrategy;
  priorityScore: number;
  clusterExternalId: string | null;
};

export type PlannedCluster = {
  externalId: string;
  level: "cluster";
  name: string;
  stateCode: string;
  stateName: string;
  memberExternalIds: string[];
  population: number;
  areaKm2: number;
  centroid: Coordinate;
  strategy: "rural_cluster";
  priorityScore: number;
};

export type CoveragePolicy = {
  version: string;
  thresholds: {
    metroPopulation: number;
    cityPopulation: number;
    townPopulation: number;
    clusterRadiusKm: number;
    clusterMaxMembers: number;
  };
  /** Query templates per strategy; {location} is replaced per unit. */
  queryBundles: Record<CoverageStrategy, string[]>;
  budgets: {
    /** Coverage's own daily share; must stay under the 0082 ledger caps. */
    maxDailySearchRequests: number;
    maxRunSearchRequests: number;
    maxEnrichmentsPerDay: number;
    maxTasksPerTick: number;
    maxAttempts: number;
    maxBatchSize: number;
    maxImportPerBatch: number;
  };
  saturation: {
    /** Stop a bundle after this many consecutive zero-novel queries. */
    noNovelStreakToStop: number;
  };
  completion: {
    requiredUnitCompletionRate: number;
    requiredPopulationCoverageRate: number;
    requiredProviderCompletionRate: number;
    allowBlockedUnits: number;
    allowPartialUnits: number;
    maximumUnresolvedFailureRate: number;
  };
};

// ---------------------------------------------------------------------------
// Germany policy. Thresholds are working defaults, versioned, founder-tunable;
// they are policy, not product truth.

export const DE_COVERAGE_POLICY: CoveragePolicy = {
  version: COVERAGE_POLICY_VERSION,
  thresholds: {
    metroPopulation: 400_000,
    cityPopulation: 90_000,
    townPopulation: 20_000,
    clusterRadiusKm: 12,
    clusterMaxMembers: 12,
  },
  queryBundles: {
    metro_deep: [
      "tattoo studio {location}",
      "tattoostudio {location}",
      "tätowierer {location}",
      "tattoo artist {location}",
      "walk in tattoo {location}",
    ],
    city_standard: ["tattoo studio {location}", "tattoostudio {location}"],
    town_light: ["tattoo studio {location}"],
    rural_cluster: ["tattoo studio {location}"],
    structured_only: [],
    gap_recheck: ["tattoo studio {location}"],
  },
  budgets: {
    // The 0082 ledger enforces 60/day + 900/month for Brave; coverage keeps
    // its own share BELOW that so the manual lane always retains headroom.
    maxDailySearchRequests: 40,
    maxRunSearchRequests: 800,
    maxEnrichmentsPerDay: 25,
    maxTasksPerTick: 5,
    maxAttempts: 3,
    maxBatchSize: 200,
    maxImportPerBatch: 150,
  },
  saturation: { noNovelStreakToStop: 2 },
  completion: {
    requiredUnitCompletionRate: 0.98,
    requiredPopulationCoverageRate: 0.95,
    requiredProviderCompletionRate: 0.95,
    allowBlockedUnits: 25,
    allowPartialUnits: 50,
    maximumUnresolvedFailureRate: 0.02,
  },
};

export const COVERAGE_POLICIES: Record<string, CoveragePolicy> = {
  DE: DE_COVERAGE_POLICY,
};

export function getCoveragePolicy(countryCode: string): CoveragePolicy | null {
  return COVERAGE_POLICIES[countryCode.toUpperCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Geometry.

export function haversineKm(a: Coordinate, b: Coordinate): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la = (a.latitude * Math.PI) / 180;
  const lb = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Effective assignment radius of a unit: the circle-equivalent radius of its
 * area with slack for irregular shapes, floored so tiny municipalities still
 * catch their own edge candidates.
 */
export function unitAssignmentRadiusKm(areaKm2: number | null | undefined): number {
  if (!areaKm2 || areaKm2 <= 0) return 4;
  return Math.max(2.5, Math.sqrt(areaKm2 / Math.PI) * 1.6 + 1);
}

// ---------------------------------------------------------------------------
// Strategy assignment. Population drives the tier; units without a known
// population are treated as small (cheap, structured-first) rather than
// guessed upward into paid tiers.

export function assignStrategy(
  unit: CoverageUnitInput,
  policy: CoveragePolicy,
): CoverageStrategy {
  const pop = unit.population ?? 0;
  if (pop >= policy.thresholds.metroPopulation) return "metro_deep";
  if (pop >= policy.thresholds.cityPopulation) return "city_standard";
  if (pop >= policy.thresholds.townPopulation) return "town_light";
  return "rural_cluster";
}

export function priorityScore(unit: CoverageUnitInput): number {
  // Bigger populations first; area breaks ties for unknown-population units.
  return (unit.population ?? 0) + Math.min(999, unit.areaKm2 ?? 0) / 1000;
}

// ---------------------------------------------------------------------------
// Rural clustering: greedy, deterministic. Seeds are the most populous
// unclustered rural units; members join within the radius, capped. Every
// member keeps its own coverage status; the cluster is an execution unit
// only and never becomes a public location.

export function buildRuralClusters(
  units: PlannedUnit[],
  policy: CoveragePolicy,
): { clusters: PlannedCluster[]; clustered: PlannedUnit[] } {
  const rural = units
    .filter((u) => u.strategy === "rural_cluster" && u.centroid)
    .sort(
      (a, b) =>
        (b.population ?? 0) - (a.population ?? 0) ||
        a.externalId.localeCompare(b.externalId),
    );
  const assigned = new Map<string, string>();
  const clusters: PlannedCluster[] = [];

  for (const seed of rural) {
    if (assigned.has(seed.externalId)) continue;
    const members = [seed];
    assigned.set(seed.externalId, seed.externalId);
    for (const other of rural) {
      if (members.length >= policy.thresholds.clusterMaxMembers) break;
      if (assigned.has(other.externalId)) continue;
      // Clusters never cross state lines: search labels and disambiguation
      // stay coherent.
      if (other.stateCode !== seed.stateCode) continue;
      if (
        haversineKm(seed.centroid as Coordinate, other.centroid as Coordinate) <=
        policy.thresholds.clusterRadiusKm
      ) {
        members.push(other);
        assigned.set(other.externalId, seed.externalId);
      }
    }
    const population = members.reduce((s, m) => s + (m.population ?? 0), 0);
    const areaKm2 = members.reduce((s, m) => s + (m.areaKm2 ?? 0), 0);
    const lat =
      members.reduce((s, m) => s + (m.centroid as Coordinate).latitude, 0) /
      members.length;
    const lng =
      members.reduce((s, m) => s + (m.centroid as Coordinate).longitude, 0) /
      members.length;
    clusters.push({
      externalId: `cluster:${seed.externalId}`,
      level: "cluster",
      name: `${seed.name} area`,
      stateCode: seed.stateCode,
      stateName: seed.stateName,
      memberExternalIds: members.map((m) => m.externalId),
      population,
      areaKm2,
      centroid: { latitude: lat, longitude: lng },
      strategy: "rural_cluster",
      priorityScore: population,
    });
  }

  const clustered = units.map((u) =>
    assigned.has(u.externalId)
      ? { ...u, clusterExternalId: `cluster:${assigned.get(u.externalId)}` }
      : u,
  );
  return { clusters, clustered };
}

/** Full planning pass: strategies, priorities, clusters. Deterministic. */
export function planCoverage(
  inputs: CoverageUnitInput[],
  policy: CoveragePolicy,
): { units: PlannedUnit[]; clusters: PlannedCluster[] } {
  const seen = new Set<string>();
  const planned: PlannedUnit[] = [];
  for (const input of inputs) {
    if (seen.has(input.externalId)) continue; // no duplicate units
    seen.add(input.externalId);
    planned.push({
      ...input,
      level: "municipality",
      strategy: assignStrategy(input, policy),
      priorityScore: priorityScore(input),
      clusterExternalId: null,
    });
  }
  const { clusters, clustered } = buildRuralClusters(planned, policy);
  return { units: clustered, clusters };
}

// ---------------------------------------------------------------------------
// Query generation. Normalized-dedup kills alias/umlaut/hyphen duplicates and
// anything already executed.

export type GeneratedQuery = { query: string; normalized: string };

export function generateQueries(
  unit: { name: string; aliases?: string[]; stateName?: string | null },
  strategy: CoverageStrategy,
  policy: CoveragePolicy,
  alreadyExecutedNormalized: ReadonlySet<string>,
  options?: { disambiguateWithState?: boolean },
): GeneratedQuery[] {
  const bundle = policy.queryBundles[strategy] ?? [];
  const location = options?.disambiguateWithState
    ? `${unit.name} ${unit.stateName ?? ""}`.trim()
    : unit.name;
  const out: GeneratedQuery[] = [];
  const seen = new Set<string>(alreadyExecutedNormalized);
  for (const template of bundle) {
    const query = template.replace("{location}", location);
    const normalized = normalizeSeedText(query);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({ query, normalized });
  }
  return out;
}

/**
 * Saturation stopping rule: stop expanding a bundle once the configured
 * number of consecutive queries produced zero novel identities. Result
 * count alone never proves completeness.
 */
export function isSaturated(
  novelCountsInOrder: number[],
  policy: CoveragePolicy,
): boolean {
  const streak = policy.saturation.noNovelStreakToStop;
  if (novelCountsInOrder.length < streak) return false;
  return novelCountsInOrder.slice(-streak).every((n) => n === 0);
}

// ---------------------------------------------------------------------------
// Discovery identity + merge. Conservative: exact identity keys merge; a
// near-name near-geo pair merges only when BOTH signals agree. Uncertain
// identities stay separate, corroborating sources stay attached.

export type RawDiscovery = {
  provider: "overture" | "osm" | "brave_search";
  providerResultId?: string | null;
  name: string;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  websiteUrl?: string | null;
  socialUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  openingHours?: string | null;
  sourceUrl?: string | null;
  /** Future-proofing: extra structured facts, carried verbatim (bounded). */
  extra?: Record<string, string> | null;
};

export function normalizedDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    const bare = host.replace(/^www\./, "");
    // Platform hosts identify a page, not a business domain.
    if (
      /(^|\.)instagram\.com$|(^|\.)facebook\.com$|(^|\.)linktr\.ee$/.test(bare)
    )
      return null;
    return bare;
  } catch {
    return null;
  }
}

export function normalizedInstagram(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const m = url.match(
    /instagram\.com\/([A-Za-z0-9._]{2,60})(?:[/?#]|$)/i,
  );
  if (!m) return null;
  const handle = m[1].toLowerCase().replace(/\/+$/, "");
  if (["p", "reel", "explore", "stories", "accounts"].includes(handle))
    return null;
  return handle;
}

export function normalizedPhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "").replace(/^00/, "+");
  if (digits.replace(/\D/g, "").length < 6) return null;
  return digits;
}

/** Stable identity key, strongest signal first. */
export function discoveryIdentityKey(d: RawDiscovery): string {
  const ig = normalizedInstagram(d.socialUrl) ?? normalizedInstagram(d.sourceUrl);
  if (ig) return `ig:${ig}`;
  const domain = normalizedDomain(d.websiteUrl);
  if (domain) return `domain:${domain}`;
  const phone = normalizedPhone(d.phone);
  if (phone) return `phone:${phone}`;
  const email = d.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  if (d.providerResultId) return `pid:${d.provider}:${d.providerResultId}`;
  const name = normalizeSeedText(d.name);
  const geo =
    Number.isFinite(d.latitude ?? NaN) && Number.isFinite(d.longitude ?? NaN)
      ? `${(d.latitude as number).toFixed(2)},${(d.longitude as number).toFixed(2)}`
      : "nogeo";
  return `namegeo:${name}:${geo}`;
}

export type MergedDiscovery = RawDiscovery & {
  identityKey: string;
  discoveredBy: Array<{
    provider: RawDiscovery["provider"];
    providerResultId: string | null;
    sourceUrl: string | null;
  }>;
};

function fillMissing(target: MergedDiscovery, source: RawDiscovery): void {
  const fields = [
    "category",
    "latitude",
    "longitude",
    "address",
    "city",
    "postalCode",
    "websiteUrl",
    "socialUrl",
    "phone",
    "email",
    "openingHours",
  ] as const;
  for (const f of fields) {
    if (
      (target[f] === null || target[f] === undefined) &&
      source[f] !== null &&
      source[f] !== undefined
    ) {
      (target as Record<string, unknown>)[f] = source[f];
    }
  }
  // Extra facts union across sources; the first source wins on key clashes.
  if (source.extra) target.extra = { ...source.extra, ...(target.extra ?? {}) };
}

/**
 * Cross-source, cross-area merge. Pass 1: exact identity keys. Pass 2: same
 * normalized name within 250 m (both signals must agree; anything softer
 * stays separate for the downstream duplicate detector to judge).
 */
export function mergeDiscoveries(raw: RawDiscovery[]): MergedDiscovery[] {
  const byKey = new Map<string, MergedDiscovery>();
  for (const d of raw) {
    const key = discoveryIdentityKey(d);
    const existing = byKey.get(key);
    if (existing) {
      fillMissing(existing, d);
      existing.discoveredBy.push({
        provider: d.provider,
        providerResultId: d.providerResultId ?? null,
        sourceUrl: d.sourceUrl ?? null,
      });
      continue;
    }
    byKey.set(key, {
      ...d,
      identityKey: key,
      discoveredBy: [
        {
          provider: d.provider,
          providerResultId: d.providerResultId ?? null,
          sourceUrl: d.sourceUrl ?? null,
        },
      ],
    });
  }

  const merged = [...byKey.values()];
  const out: MergedDiscovery[] = [];
  for (const d of merged) {
    const twin = out.find(
      (o) =>
        normalizeSeedText(o.name) === normalizeSeedText(d.name) &&
        Number.isFinite(o.latitude ?? NaN) &&
        Number.isFinite(d.latitude ?? NaN) &&
        haversineKm(
          { latitude: o.latitude as number, longitude: o.longitude as number },
          { latitude: d.latitude as number, longitude: d.longitude as number },
        ) <= 0.25,
    );
    if (twin) {
      fillMissing(twin, d);
      twin.discoveredBy.push(...d.discoveredBy);
      continue;
    }
    out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Spatial assignment.

export type AssignableUnit = {
  externalId: string;
  name: string;
  aliases?: string[];
  areaKm2?: number | null;
  centroid?: Coordinate | null;
};

export type SpatialAssignment = {
  externalId: string | null;
  method: "centroid_distance" | "city_name" | "unassigned";
  confidence: "high" | "medium" | "low";
};

export function assignDiscoveryToUnit(
  d: { latitude?: number | null; longitude?: number | null; city?: string | null },
  units: AssignableUnit[],
): SpatialAssignment {
  if (
    Number.isFinite(d.latitude ?? NaN) &&
    Number.isFinite(d.longitude ?? NaN)
  ) {
    const point = {
      latitude: d.latitude as number,
      longitude: d.longitude as number,
    };
    let best: { unit: AssignableUnit; distance: number } | null = null;
    for (const unit of units) {
      if (!unit.centroid) continue;
      const distance = haversineKm(point, unit.centroid);
      if (!best || distance < best.distance) best = { unit, distance };
    }
    if (best) {
      const radius = unitAssignmentRadiusKm(best.unit.areaKm2);
      if (best.distance <= radius)
        return {
          externalId: best.unit.externalId,
          method: "centroid_distance",
          confidence: "high",
        };
      if (best.distance <= 25)
        return {
          externalId: best.unit.externalId,
          method: "centroid_distance",
          confidence: "low",
        };
    }
  }
  const city = normalizeSeedText(d.city);
  if (city) {
    const matches = units.filter(
      (u) =>
        normalizeSeedText(u.name) === city ||
        (u.aliases ?? []).some((a) => normalizeSeedText(a) === city),
    );
    if (matches.length === 1)
      return {
        externalId: matches[0].externalId,
        method: "city_name",
        confidence: "medium",
      };
    // Several municipalities share the name and there are no coordinates:
    // guessing would silently misfile the candidate.
  }
  return { externalId: null, method: "unassigned", confidence: "low" };
}

// ---------------------------------------------------------------------------
// Deterministic pilot selection: one metro, one medium city, one town, one
// rural cluster, across at least two states where the data allows. Ties
// break on the external id so the same dataset always yields the same pilot.

export type PilotSelection = Array<{ externalId: string; reason: string }>;

function median<T>(sorted: T[]): T | null {
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

export function selectPilotUnits(
  units: PlannedUnit[],
  clusters: PlannedCluster[],
): PilotSelection {
  const byPopDesc = (a: PlannedUnit, b: PlannedUnit) =>
    (b.population ?? 0) - (a.population ?? 0) ||
    a.externalId.localeCompare(b.externalId);

  const metros = units.filter((u) => u.strategy === "metro_deep").sort(byPopDesc);
  const cities = units
    .filter((u) => u.strategy === "city_standard")
    .sort(byPopDesc);
  const towns = units.filter((u) => u.strategy === "town_light").sort(byPopDesc);

  const selection: PilotSelection = [];
  const usedStates = new Set<string>();

  const metro = metros[0] ?? null;
  if (metro) {
    selection.push({
      externalId: metro.externalId,
      reason: `Largest metro (${metro.name}, population ${metro.population ?? "unknown"}).`,
    });
    usedStates.add(metro.stateCode);
  }

  const pickDiverse = <T extends { externalId: string; stateCode: string }>(
    pool: T[],
    preferred: T | null,
  ): T | null => {
    if (!preferred) return null;
    if (!usedStates.has(preferred.stateCode)) return preferred;
    return pool.find((c) => !usedStates.has(c.stateCode)) ?? preferred;
  };

  const city = pickDiverse(cities, median(cities));
  if (city) {
    selection.push({
      externalId: city.externalId,
      reason: `Median medium city of the tier (${city.name}), state diversity preferred.`,
    });
    usedStates.add(city.stateCode);
  }

  const town = pickDiverse(towns, median(towns));
  if (town) {
    selection.push({
      externalId: town.externalId,
      reason: `Median small town of the tier (${town.name}), state diversity preferred.`,
    });
    usedStates.add(town.stateCode);
  }

  const clustersSorted = [...clusters].sort(
    (a, b) =>
      b.memberExternalIds.length - a.memberExternalIds.length ||
      a.externalId.localeCompare(b.externalId),
  );
  const cluster =
    clustersSorted.find((c) => !usedStates.has(c.stateCode)) ??
    clustersSorted[0] ??
    null;
  if (cluster) {
    selection.push({
      externalId: cluster.externalId,
      reason: `Largest rural cluster (${cluster.name}, ${cluster.memberExternalIds.length} municipalities), state diversity preferred.`,
    });
  }
  return selection;
}

// ---------------------------------------------------------------------------
// Retry backoff (pure: jitter comes from the caller so tests stay exact).

export function retryDelayMs(attempt: number, jitter01: number): number {
  const base = Math.min(8 * 60_000 * 2 ** Math.max(0, attempt - 1), 6 * 60 * 60_000);
  return Math.round(base * (0.75 + 0.5 * Math.max(0, Math.min(1, jitter01))));
}

// ---------------------------------------------------------------------------
// Completion math. Separate rates, never one collapsed number; a country is
// complete only when the policy says so, and gaps are enumerated.

export type CompletionTaskRow = {
  status: CoverageTaskStatus;
  population: number;
  areaKm2: number;
  externalId: string;
  name: string;
  /** True when every provider action the strategy required succeeded. */
  providerActionsComplete: boolean;
};

export type CoverageReport = {
  totalUnits: number;
  doneUnits: number;
  noResultUnits: number;
  partialUnits: number;
  failedUnits: number;
  blockedUnits: number;
  unprocessedUnits: number;
  unitCompletionRate: number;
  populationCoverageRate: number;
  areaCoverageRate: number;
  providerCompletionRate: number;
  unresolvedFailureRate: number;
  satisfied: boolean;
  finalStatus: "completed" | "completed_with_gaps";
  gaps: Array<{ externalId: string; name: string; status: string }>;
};

export function computeCoverageReport(
  tasks: CompletionTaskRow[],
  policy: CoveragePolicy,
): CoverageReport {
  const total = tasks.length || 1;
  const done = tasks.filter((t) =>
    COVERAGE_DONE_STATUSES.includes(t.status),
  );
  const noResult = tasks.filter((t) => t.status === "complete_no_results");
  const partial = tasks.filter((t) => t.status === "partial");
  const blocked = tasks.filter((t) => t.status === "blocked");
  const failed = tasks.filter(
    (t) => t.status === "retry_required" || t.status === "stale",
  );
  const unprocessed = tasks.filter((t) =>
    ["unplanned", "queued", "discovering", "discovered", "processing"].includes(
      t.status,
    ),
  );

  const totalPop = tasks.reduce((s, t) => s + t.population, 0) || 1;
  const donePop = done.reduce((s, t) => s + t.population, 0);
  const totalArea = tasks.reduce((s, t) => s + t.areaKm2, 0) || 1;
  const doneArea = done.reduce((s, t) => s + t.areaKm2, 0);
  const providerComplete = tasks.filter((t) => t.providerActionsComplete);

  const unitCompletionRate = done.length / total;
  const populationCoverageRate = donePop / totalPop;
  const areaCoverageRate = doneArea / totalArea;
  const providerCompletionRate = providerComplete.length / total;
  const unresolvedFailureRate = failed.length / total;

  const c = policy.completion;
  const satisfied =
    unitCompletionRate >= c.requiredUnitCompletionRate &&
    populationCoverageRate >= c.requiredPopulationCoverageRate &&
    providerCompletionRate >= c.requiredProviderCompletionRate &&
    blocked.length <= c.allowBlockedUnits &&
    partial.length <= c.allowPartialUnits &&
    unresolvedFailureRate <= c.maximumUnresolvedFailureRate;

  const gaps = tasks
    .filter((t) => !COVERAGE_DONE_STATUSES.includes(t.status))
    .map((t) => ({ externalId: t.externalId, name: t.name, status: t.status }));

  return {
    totalUnits: tasks.length,
    doneUnits: done.length,
    noResultUnits: noResult.length,
    partialUnits: partial.length,
    failedUnits: failed.length,
    blockedUnits: blocked.length,
    unprocessedUnits: unprocessed.length,
    unitCompletionRate,
    populationCoverageRate,
    areaCoverageRate,
    providerCompletionRate,
    unresolvedFailureRate,
    satisfied,
    finalStatus: gaps.length === 0 && satisfied ? "completed" : "completed_with_gaps",
    gaps,
  };
}
