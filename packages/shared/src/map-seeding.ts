// Inklee 2.0 map seeding tool: vocabularies, caps, and pure validation.
// SoT: docs/product/inklee-2-map-seeding-tool.md. The tool is a lead
// collector, not an importer: external sources create candidates, admin
// review converts the best ones through the existing create pipeline (which
// owns the locked density cap). Claim state never appears here.

export const SEED_AREA_STATUSES = ["active", "done", "archived"] as const;
export type SeedAreaStatus = (typeof SEED_AREA_STATUSES)[number];

export const SEED_AREA_STATUS_LABELS: Record<SeedAreaStatus, string> = {
  active: "Active",
  done: "Done",
  archived: "Archived",
};

export const SEED_CANDIDATE_SOURCES = [
  "overture_maps",
  "brave_search",
  "manual_instagram",
  "artist_suggestion",
] as const;
export type SeedCandidateSource = (typeof SEED_CANDIDATE_SOURCES)[number];

export const SEED_CANDIDATE_SOURCE_LABELS: Record<SeedCandidateSource, string> =
  {
    overture_maps: "Overture Maps",
    brave_search: "Brave search",
    manual_instagram: "Instagram (manual)",
    artist_suggestion: "Artist suggestion",
  };

export const SEED_CANDIDATE_STATUSES = [
  "new",
  "likely_duplicate",
  "approved_for_enrichment",
  "rejected",
  "converted",
] as const;
export type SeedCandidateStatus = (typeof SEED_CANDIDATE_STATUSES)[number];

export const SEED_CANDIDATE_STATUS_LABELS: Record<SeedCandidateStatus, string> =
  {
    new: "New",
    likely_duplicate: "Likely duplicate",
    approved_for_enrichment: "Approved",
    rejected: "Rejected",
    converted: "Converted",
  };

/**
 * Review transitions. Terminal: converted. Rejected can be reopened (a lead
 * judged wrongly costs nothing to revive); converted cannot (a map entry
 * exists).
 */
const CANDIDATE_TRANSITIONS: Record<SeedCandidateStatus, SeedCandidateStatus[]> =
  {
    new: ["likely_duplicate", "approved_for_enrichment", "rejected", "converted"],
    likely_duplicate: ["new", "approved_for_enrichment", "rejected", "converted"],
    approved_for_enrichment: ["new", "likely_duplicate", "rejected", "converted"],
    rejected: ["new"],
    converted: [],
  };

export function canTransitionSeedCandidate(
  from: string,
  to: SeedCandidateStatus,
): boolean {
  const allowed = CANDIDATE_TRANSITIONS[from as SeedCandidateStatus];
  return Boolean(allowed?.includes(to));
}

// Candidate types = the shipped map category vocabulary + two candidate-only
// extras. Both extras must be re-typed before conversion (an artist is an
// outreach lead, not a map location).
export const SEED_CANDIDATE_TYPES = [
  "tattoo_studio",
  "private_studio",
  "piercing_studio",
  "supply_shop",
  "other",
  "tattoo_artist",
  "uncertain",
] as const;
export type SeedCandidateType = (typeof SEED_CANDIDATE_TYPES)[number];

export const SEED_CANDIDATE_TYPE_LABELS: Record<SeedCandidateType, string> = {
  tattoo_studio: "Tattoo studio",
  private_studio: "Private studio",
  piercing_studio: "Piercing studio",
  supply_shop: "Supply shop",
  other: "Other",
  tattoo_artist: "Tattoo artist",
  uncertain: "Uncertain",
};

/** Types that can convert straight to a map location category. */
export const CONVERTIBLE_CANDIDATE_TYPES: SeedCandidateType[] = [
  "tattoo_studio",
  "private_studio",
  "piercing_studio",
  "supply_shop",
  "other",
];

// ---------------------------------------------------------------------------
// Caps (shared constants, founder-adjustable in code; the doc explains why
// these are not env vars). Brave caps sit far inside the $5 monthly credit:
// worst case 1000 queries at $0.005 each, hard stop at 900.

// Raised 2026-07-20 (founder decision, real pricing observed: ~$5.1/1k):
// the ~€5 monthly free credit covers ~1,050 requests and the founder's €10
// out-of-pocket ceiling ~3,100 total; 2,400/month worst-cases at ~€6.2 out
// of pocket, comfortably inside both walls.
export const BRAVE_SEARCH_DAILY_CAP = 120;
export const BRAVE_SEARCH_MONTHLY_CAP = 2400;
export const MAX_CANDIDATES_PER_RUN = 200;

export const SEED_NOTE_MAX = 1000;
export const SEED_NAME_MAX = 200;
export const SEED_TEXT_MAX = 200;
export const SEED_URL_MAX = 500;
export const SEED_QUERY_MAX = 200;

// ---------------------------------------------------------------------------
// Seed areas (planning entities only; no cap columns by design).

export type SeedAreaInput = {
  label: string;
  city?: string | null;
  country?: string | null;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
};

export function validateSeedAreaInput(input: SeedAreaInput): string | null {
  if (!input.label?.trim()) return "Give the area a label.";
  if (input.label.length > SEED_TEXT_MAX)
    return `Keep the label under ${SEED_TEXT_MAX} characters.`;
  for (const [label, value] of [
    ["City", input.city],
    ["Country", input.country],
  ] as const) {
    if (value && value.length > SEED_TEXT_MAX)
      return `${label} must be at most ${SEED_TEXT_MAX} characters.`;
  }
  if (
    !Number.isFinite(input.centerLat) ||
    input.centerLat < -90 ||
    input.centerLat > 90
  )
    return "Center latitude must be between -90 and 90.";
  if (
    !Number.isFinite(input.centerLng) ||
    input.centerLng < -180 ||
    input.centerLng > 180
  )
    return "Center longitude must be between -180 and 180.";
  if (
    !Number.isFinite(input.radiusKm) ||
    input.radiusKm <= 0 ||
    input.radiusKm > 500
  )
    return "Radius must be between 0 and 500 km.";
  return null;
}

// ---------------------------------------------------------------------------
// Manual Instagram entry (the admin types everything; the URL is a reference).

export type ManualCandidateInput = {
  sourceUrl: string;
  name: string;
  city?: string | null;
  country?: string | null;
  candidateType: string;
  notes?: string | null;
  confidenceScore?: number | null;
  sourceContext?: string | null;
};

export function isHttpsSeedUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
const isHttpsUrl = isHttpsSeedUrl;

// Instagram path segments that are features, not profiles. A Brave result
// like instagram.com/p/abc must never yield "p" as a handle (a mis-extracted
// handle would clear-match every other mis-extraction in duplicate scoring).
const INSTAGRAM_RESERVED_SEGMENTS = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "share",
  "about",
  "developer",
  "directory",
]);

/** Extract a profile handle from an Instagram URL, or null. */
export function instagramHandleFromSeedUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const m = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(url);
  if (!m) return null;
  const handle = m[1].toLowerCase();
  if (INSTAGRAM_RESERVED_SEGMENTS.has(handle)) return null;
  return handle;
}

export function validateManualCandidateInput(
  input: ManualCandidateInput,
): string | null {
  const url = input.sourceUrl?.trim() ?? "";
  if (!url) return "Add the Instagram or profile link.";
  if (url.length > SEED_URL_MAX) return "That link is too long.";
  if (!isHttpsUrl(url)) return "Links need to start with https://.";
  if (!input.name?.trim()) return "Give the candidate a name.";
  if (input.name.length > SEED_NAME_MAX)
    return `Keep the name under ${SEED_NAME_MAX} characters.`;
  for (const [label, value] of [
    ["City", input.city],
    ["Country", input.country],
    ["Source context", input.sourceContext],
  ] as const) {
    if (value && value.length > SEED_TEXT_MAX)
      return `${label} must be at most ${SEED_TEXT_MAX} characters.`;
  }
  if ((input.notes ?? "").length > SEED_NOTE_MAX)
    return "Keep the notes shorter.";
  if (
    !SEED_CANDIDATE_TYPES.includes(input.candidateType as SeedCandidateType)
  )
    return "Pick a candidate type.";
  if (
    input.confidenceScore !== null &&
    input.confidenceScore !== undefined &&
    (!Number.isFinite(input.confidenceScore) ||
      input.confidenceScore < 0 ||
      input.confidenceScore > 100)
  )
    return "Confidence must be between 0 and 100.";
  return null;
}

// ---------------------------------------------------------------------------
// Overture import file (produced by scripts/overture-tattoo-extract.cjs).

export type OvertureImportCandidate = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category?: string | null;
  city?: string | null;
  country?: string | null;
  websiteUrl?: string | null;
  socialUrl?: string | null;
  /**
   * Optional free-text evidence (bounded website metadata gathered by the
   * coverage lane's enrichment; schema v2). Feeds the relevance filter as an
   * extra field, never rendered as trusted content.
   */
  description?: string | null;
  // Contact enrichment from structured open data (schema v3).
  address?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  openingHours?: string | null;
  /**
   * Future-proofing envelope: any additional structured facts a future
   * extractor version carries (bounded string map, validated at parse).
   * Flows into the candidate's extra_metadata and the map entry's
   * seed_metadata without schema changes.
   */
  extra?: Record<string, string> | null;
};

export type OvertureParseResult =
  | { error: string }
  | { candidates: OvertureImportCandidate[] };

/**
 * Parse and validate a pasted Overture extract. Fail-closed: any malformed
 * row rejects the whole file so a bad extract never half-imports.
 */
export function parseOvertureImport(raw: string): OvertureParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: "That is not valid JSON." };
  }
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { candidates?: unknown }).candidates)
      ? (data as { candidates: unknown[] }).candidates
      : null;
  if (!rows) return { error: "Expected a JSON array of candidates." };
  if (rows.length === 0) return { error: "The file has no candidates." };
  if (rows.length > MAX_CANDIDATES_PER_RUN)
    return {
      error: `Import at most ${MAX_CANDIDATES_PER_RUN} candidates per run.`,
    };

  const out: OvertureImportCandidate[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown>;
    if (!row || typeof row !== "object")
      return { error: `Row ${i + 1} is not an object.` };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!id) return { error: `Row ${i + 1} is missing the Overture ID.` };
    if (!name || name.length > SEED_NAME_MAX)
      return { error: `Row ${i + 1} has a missing or oversized name.` };
    if (!Number.isFinite(lat) || lat < -90 || lat > 90)
      return { error: `Row ${i + 1} has an invalid latitude.` };
    if (!Number.isFinite(lng) || lng < -180 || lng > 180)
      return { error: `Row ${i + 1} has an invalid longitude.` };
    const text = (v: unknown): string | null =>
      typeof v === "string" && v.trim()
        ? v.trim().slice(0, SEED_URL_MAX)
        : null;
    // Third-party URLs render as clickable admin links later; only https
    // survives (same rule the manual and Brave lanes enforce).
    const httpsOnly = (v: unknown): string | null => {
      const t = text(v);
      return t && isHttpsUrl(t) ? t : null;
    };
    out.push({
      id: id.slice(0, SEED_URL_MAX),
      name,
      latitude: lat,
      longitude: lng,
      category: text(row.category)?.slice(0, SEED_TEXT_MAX) ?? null,
      city: text(row.city)?.slice(0, SEED_TEXT_MAX) ?? null,
      country: text(row.country)?.slice(0, SEED_TEXT_MAX) ?? null,
      websiteUrl: httpsOnly(row.websiteUrl),
      socialUrl: httpsOnly(row.socialUrl),
      description: text(row.description)?.slice(0, 500) ?? null,
      address: text(row.address)?.slice(0, SEED_TEXT_MAX) ?? null,
      postalCode: text(row.postalCode)?.slice(0, 20) ?? null,
      phone: text(row.phone)?.slice(0, 40) ?? null,
      openingHours: text(row.openingHours)?.slice(0, 300) ?? null,
      extra: boundedExtra(row.extra),
    });
  }
  return { candidates: out };
}

/**
 * The schema v3 extension envelope: at most 10 short string facts. Anything
 * malformed is dropped silently (enrichment is optional, never fatal).
 */
function boundedExtra(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (count >= 10) break;
    if (typeof v !== "string" || !v.trim()) continue;
    const k = key.trim().slice(0, 40);
    if (!k) continue;
    out[k] = v.trim().slice(0, 500);
    count += 1;
  }
  return count > 0 ? out : null;
}

// ---------------------------------------------------------------------------
// Brave search results: store the lead only (URL + title + query). No
// snippets, no descriptions, no cached content (doc section 6; Q17).

export type BraveLead = { title: string; url: string };

export function shapeBraveResults(raw: unknown): BraveLead[] {
  if (!raw || typeof raw !== "object") return [];
  const web = (raw as { web?: { results?: unknown } }).web;
  if (!web || !Array.isArray(web.results)) return [];
  // Deduped by URL: leads are keyed by URL in the selection UI.
  const out = new Map<string, BraveLead>();
  for (const entry of web.results) {
    if (!entry || typeof entry !== "object") continue;
    const url = (entry as { url?: unknown }).url;
    const title = (entry as { title?: unknown }).title;
    if (typeof url !== "string" || !isHttpsUrl(url)) continue;
    const cut = url.slice(0, SEED_URL_MAX);
    if (out.has(cut)) continue;
    out.set(cut, {
      url: cut,
      title:
        typeof title === "string" && title.trim()
          ? title.trim().slice(0, SEED_NAME_MAX)
          : cut.slice(0, SEED_NAME_MAX),
    });
  }
  return [...out.values()];
}

/** UTC day and month keys for the provider usage ledger. */
export function usageDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}
export function usageMonthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}
