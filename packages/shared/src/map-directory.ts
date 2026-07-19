// Inklee 2.0 map/directory vocabulary + seed-cap bucket math.
// Single source of truth for the map_locations enums (migration 0075 mirrors
// the CHECK constraints) and the style seed (migration 0075 mirrors STYLE_SEED;
// keep both in sync when either changes).

export const MAP_LOCATION_CATEGORIES = [
  "tattoo_studio",
  "private_studio",
  "piercing_studio",
  "supply_shop",
  "other",
] as const;
export type MapLocationCategory = (typeof MAP_LOCATION_CATEGORIES)[number];

export const MAP_LOCATION_CATEGORY_LABELS: Record<MapLocationCategory, string> =
  {
    tattoo_studio: "Tattoo studio",
    private_studio: "Private studio",
    piercing_studio: "Piercing studio",
    supply_shop: "Supply shop",
    other: "Other",
  };

export const MAP_LOCATION_SOURCES = [
  "inklee_seed",
  "owner_created",
  "claim_converted",
] as const;
export type MapLocationSource = (typeof MAP_LOCATION_SOURCES)[number];

export const MAP_CLAIM_STATUSES = [
  "unclaimed",
  "claim_pending",
  "claim_conflict",
  "claimed",
] as const;
export type MapClaimStatus = (typeof MAP_CLAIM_STATUSES)[number];

export const MAP_MODERATION_STATUSES = [
  "pending",
  "approved",
  "hidden",
  "removed",
] as const;
export type MapModerationStatus = (typeof MAP_MODERATION_STATUSES)[number];

export const MAP_MODERATION_LABELS: Record<MapModerationStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  hidden: "Hidden",
  removed: "Removed",
};

export const MAP_REPORT_REASONS = [
  "wrong_location",
  "fake_studio",
  "spam",
  "scam",
  "behavior",
  "other",
] as const;
export type MapReportReason = (typeof MAP_REPORT_REASONS)[number];

export const MAP_REPORT_STATUSES = [
  "new",
  "reviewed",
  "actioned",
  "dismissed",
] as const;
export type MapReportStatus = (typeof MAP_REPORT_STATUSES)[number];

// Mirrored by the styles table seed in migration 0075.
export const STYLE_SEED: ReadonlyArray<{ key: string; label: string }> = [
  { key: "blackwork", label: "Blackwork" },
  { key: "fine_line", label: "Fine line" },
  { key: "traditional", label: "Traditional" },
  { key: "neo_traditional", label: "Neo traditional" },
  { key: "realism", label: "Realism" },
  { key: "japanese", label: "Japanese" },
  { key: "tribal", label: "Tribal" },
  { key: "dotwork", label: "Dotwork" },
  { key: "geometric", label: "Geometric" },
  { key: "watercolor", label: "Watercolor" },
  { key: "new_school", label: "New school" },
  { key: "lettering", label: "Lettering" },
  { key: "portrait", label: "Portrait" },
  { key: "ornamental", label: "Ornamental" },
  { key: "trash_polka", label: "Trash polka" },
];

// ---------------------------------------------------------------------------
// HISTORICAL default only (0091 lifted the cap; the live value is the
// founder-configurable map_settings.seed_cap_per_bucket, null = no cap).
// The bucket grid itself stays load-bearing for capacity display.
// Original rule: max SEED_CAP_PER_BUCKET seeded studios per grid bucket of
// approximately SEED_BUCKET_TARGET_KM2. Locked product rule (scope 4.4).

export const SEED_CAP_PER_BUCKET = 5;
export const SEED_BUCKET_TARGET_KM2 = 300;

const KM_PER_DEGREE_LAT = 111.32;
const CELL_SIDE_KM = Math.sqrt(SEED_BUCKET_TARGET_KM2); // ~17.32 km
const LAT_STEP_DEG = CELL_SIDE_KM / KM_PER_DEGREE_LAT; // ~0.1556 deg
// Above this latitude the cos-correction degenerates; there are no tattoo
// scenes at the poles, so clamp instead of special-casing.
const MAX_ABS_LAT = 85;

/**
 * Grid bucket for the seed density cap. Latitude bands of ~17.32 km; within
 * each band the longitude step is widened by 1/cos(band center) so every cell
 * covers roughly SEED_BUCKET_TARGET_KM2 regardless of latitude. Proven by the
 * area test in map-directory.test.ts.
 */
export function seedRegionBucket(lat: number, lng: number): string {
  const clampedLat = Math.max(-MAX_ABS_LAT, Math.min(MAX_ABS_LAT, lat));
  const latIdx = Math.floor(clampedLat / LAT_STEP_DEG);
  const bandCenterLat = (latIdx + 0.5) * LAT_STEP_DEG;
  const cosBand = Math.max(
    Math.cos((bandCenterLat * Math.PI) / 180),
    Math.cos((MAX_ABS_LAT * Math.PI) / 180),
  );
  const lngStep = LAT_STEP_DEG / cosBand;
  const normalizedLng = ((((lng + 180) % 360) + 360) % 360) - 180; // [-180, 180)
  const lngIdx = Math.floor(normalizedLng / lngStep);
  return `s${latIdx}:${lngIdx}`;
}

/**
 * Geographic bounds of the bucket cell containing (lat, lng), in degrees.
 * Exposed so the area proof test (and any admin debug view) can compute the
 * TRUE spherical area of a cell independently of the bucketing math.
 */
export function seedBucketCellBounds(
  lat: number,
  lng: number,
): { latMin: number; latMax: number; lngMin: number; lngMax: number } {
  const clampedLat = Math.max(-MAX_ABS_LAT, Math.min(MAX_ABS_LAT, lat));
  const latIdx = Math.floor(clampedLat / LAT_STEP_DEG);
  const bandCenterLat = (latIdx + 0.5) * LAT_STEP_DEG;
  const cosBand = Math.max(
    Math.cos((bandCenterLat * Math.PI) / 180),
    Math.cos((MAX_ABS_LAT * Math.PI) / 180),
  );
  const lngStep = LAT_STEP_DEG / cosBand;
  const normalizedLng = ((((lng + 180) % 360) + 360) % 360) - 180;
  const lngIdx = Math.floor(normalizedLng / lngStep);
  return {
    latMin: latIdx * LAT_STEP_DEG,
    latMax: (latIdx + 1) * LAT_STEP_DEG,
    lngMin: lngIdx * lngStep,
    lngMax: (lngIdx + 1) * lngStep,
  };
}

// ---------------------------------------------------------------------------
// Artist map presence (profiles columns from migration 0076). Consent-gated
// by founder decision 2026-07-17: only artists with map_visibility != 'off'
// are ever counted or listed; 'city_only' counts without being named.

export const MAP_VISIBILITY_MODES = ["off", "city_only", "listed"] as const;
export type MapVisibilityMode = (typeof MAP_VISIBILITY_MODES)[number];

export const MAP_VISIBILITY_LABELS: Record<MapVisibilityMode, string> = {
  off: "Off the map",
  city_only: "Count me, do not name me",
  listed: "List me in my city",
};

// Anonymous city counts below this floor render as nothing, so the number
// itself can never identify someone (Q13, founder decision 2026-07-18).
export const MIN_ANON_ARTIST_COUNT = 3;

// ---------------------------------------------------------------------------
// The public pin shape served by the viewport query API. This shaper is THE
// boundary between the service-role read and the client (the predecessor's
// tested toPublicMapLocation pattern): only these fields ever leave the
// server, and only approved rows may be shaped.

export type PublicMapPin = {
  id: string;
  name: string;
  category: MapLocationCategory;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  claimed: boolean;
};

export type MapLocationRowForPin = {
  id: string;
  name: string;
  category: string;
  display_latitude: number;
  display_longitude: number;
  city: string | null;
  country: string | null;
  claim_status: string;
  moderation_status: string;
};

/** Returns null for anything not publicly renderable (fail closed). */
export function toPublicMapPin(row: MapLocationRowForPin): PublicMapPin | null {
  if (row.moderation_status !== "approved") return null;
  if (
    !MAP_LOCATION_CATEGORIES.includes(row.category as MapLocationCategory)
  )
    return null;
  if (
    !Number.isFinite(row.display_latitude) ||
    !Number.isFinite(row.display_longitude)
  )
    return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category as MapLocationCategory,
    lat: row.display_latitude,
    lng: row.display_longitude,
    city: row.city,
    country: row.country,
    claimed: row.claim_status === "claimed",
  };
}

export type MapBBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

// Number(null) and Number("") are 0, so missing or empty params must be
// rejected before coercion.
function coordParam(value: string | null | undefined): number {
  if (value == null || value.trim() === "") return Number.NaN;
  return Number(value);
}

/** Parse and sanity-check a viewport bbox from query params; null = invalid. */
export function parseMapBBox(params: {
  west?: string | null;
  south?: string | null;
  east?: string | null;
  north?: string | null;
}): MapBBox | null {
  const west = coordParam(params.west);
  const south = coordParam(params.south);
  const east = coordParam(params.east);
  const north = coordParam(params.north);
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (south < -90 || north > 90 || south >= north) return null;
  if (west < -180 || east > 180 || west >= east) return null;
  return { west, south, east, north };
}

// ---------------------------------------------------------------------------
// Admin input validation for map locations. Publish gates for claimed studios
// live in later phases; this validates the directory entry itself.

export type MapLocationInput = {
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  postalCode?: string | null;
  googlePlaceId?: string | null;
  websiteUrl?: string | null;
  instagramHandle?: string | null;
  phone?: string | null;
  openingHours?: string | null;
};

const NAME_MAX = 120;
const TEXT_MAX = 200;

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Returns an error message, or null when the input is valid. */
export function validateMapLocationInput(input: MapLocationInput): string | null {
  const name = input.name?.trim() ?? "";
  if (!name) return "Name is required.";
  if (name.length > NAME_MAX) return `Name must be at most ${NAME_MAX} characters.`;
  if (!MAP_LOCATION_CATEGORIES.includes(input.category as MapLocationCategory))
    return "Pick a valid category.";
  if (
    !Number.isFinite(input.latitude) ||
    input.latitude < -90 ||
    input.latitude > 90
  )
    return "Latitude must be between -90 and 90.";
  if (
    !Number.isFinite(input.longitude) ||
    input.longitude < -180 ||
    input.longitude > 180
  )
    return "Longitude must be between -180 and 180.";
  for (const [label, value] of [
    ["Address", input.address],
    ["City", input.city],
    ["Country", input.country],
    ["Postal code", input.postalCode],
  ] as const) {
    if (value && value.length > TEXT_MAX)
      return `${label} must be at most ${TEXT_MAX} characters.`;
  }
  if (input.websiteUrl && !isHttpUrl(input.websiteUrl))
    return "Website must be an http(s) URL.";
  if (input.instagramHandle && input.instagramHandle.replace(/^@+/, "").length > 30)
    return "Instagram handle must be at most 30 characters.";
  if (input.phone && input.phone.length > 40)
    return "Phone must be at most 40 characters.";
  // OSM opening_hours syntax; multi-rule strings are long but bounded.
  if (input.openingHours && input.openingHours.length > 300)
    return "Opening hours must be at most 300 characters.";
  return null;
}

/** Normalize an instagram handle for storage (no leading @). */
export function normalizeInstagramHandle(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().replace(/^@+/, "");
  return v ? v : null;
}

// ---------------------------------------------------------------------------
// Duplicate studio detection (Phase 1 follow-on, scope 4.10 extension).
// Pure math here; the server module feeds it candidate rows. Never
// auto-merges: output is admin review suggestions with confidence levels.

/** Lowercase, strip diacritics-ish punctuation and filler words, collapse spaces. */
export function normalizeStudioName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(tattoo|tattoos|studio|atelier|ink|shop|parlor|parlour)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function softNormalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bigram dice similarity in [0, 1] on normalized names. When filler-word
 * stripping empties a name (the studio is literally called "Tattoo Studio",
 * the most duplicate-prone name class), fall back to the unstripped form so
 * two generic names still compare.
 */
export function nameSimilarity(a: string, b: string): number {
  let na = normalizeStudioName(a);
  let nb = normalizeStudioName(b);
  if (!na || !nb) {
    na = softNormalizeName(a);
    nb = softNormalizeName(b);
  }
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const bigrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ma = bigrams(na);
  const mb = bigrams(nb);
  let overlap = 0;
  let totalA = 0;
  let totalB = 0;
  for (const c of ma.values()) totalA += c;
  for (const c of mb.values()) totalB += c;
  if (totalA === 0 || totalB === 0) return 0;
  for (const [g, c] of ma) overlap += Math.min(c, mb.get(g) ?? 0);
  return (2 * overlap) / (totalA + totalB);
}

/** Great-circle distance in meters. */
export function distanceMeters(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    const host = u.host.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

/** Host without www, for candidate recall queries; null when unparseable. */
export function normalizeWebsiteHost(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function normalizeAddress(value: string | null | undefined): string | null {
  const v = (value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
  return v || null;
}

export type DuplicateCandidateInput = {
  name: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  instagramHandle?: string | null;
  websiteUrl?: string | null;
};

export type DuplicateConfidence = "clear" | "likely" | "possible";

export type DuplicateSignals = {
  nameSimilarity: number;
  distanceM: number;
  sameInstagram: boolean;
  sameWebsite: boolean;
  sameAddress: boolean;
};

export type DuplicateVerdict = {
  confidence: DuplicateConfidence;
  signals: DuplicateSignals;
} | null;

export type DuplicateHit = {
  locationId: string;
  name: string;
  city: string | null;
  country: string | null;
  confidence: DuplicateConfidence;
  signals: DuplicateSignals;
  /** Lets surfaces gate claim links: the claim page accepts approved only. */
  moderationStatus?: string;
};

/**
 * Classify one existing row against a new or edited entry. Thresholds are
 * deliberately conservative toward "possible": a false suggestion costs one
 * admin dismissal, a missed duplicate costs map credibility.
 */
export function classifyDuplicate(
  entry: DuplicateCandidateInput,
  existing: DuplicateCandidateInput,
): DuplicateVerdict {
  const signals: DuplicateSignals = {
    nameSimilarity: Math.round(nameSimilarity(entry.name, existing.name) * 100) / 100,
    distanceM: Math.round(
      distanceMeters(
        entry.latitude,
        entry.longitude,
        existing.latitude,
        existing.longitude,
      ),
    ),
    sameInstagram: Boolean(
      normalizeInstagramHandle(entry.instagramHandle) &&
        normalizeInstagramHandle(entry.instagramHandle) ===
          normalizeInstagramHandle(existing.instagramHandle),
    ),
    sameWebsite: Boolean(
      normalizeUrl(entry.websiteUrl) &&
        normalizeUrl(entry.websiteUrl) === normalizeUrl(existing.websiteUrl),
    ),
    sameAddress: Boolean(
      normalizeAddress(entry.address) &&
        normalizeAddress(entry.address) === normalizeAddress(existing.address),
    ),
  };
  const sim = signals.nameSimilarity;
  const d = signals.distanceM;

  if (
    signals.sameInstagram ||
    signals.sameWebsite ||
    signals.sameAddress ||
    (d <= 30 && sim >= 0.85)
  )
    return { confidence: "clear", signals };
  if (d <= 30 || (d <= 100 && sim >= 0.6) || sim >= 0.85)
    return { confidence: "likely", signals };
  if ((d <= 250 && sim >= 0.4) || sim >= 0.7)
    return { confidence: "possible", signals };
  return null;
}

// ---------------------------------------------------------------------------
// Artists in town (Phase 2 slice 2). Consent-gated aggregation: only rows
// with map_visibility != 'off' ever reach this function, 'city_only' rows
// count without being named, and cities under the floor disappear entirely.

export type ArtistPresenceRow = {
  id: string;
  display_name: string | null;
  slug: string | null;
  map_visibility: string;
  looking_for_guest_spots: boolean;
  map_city_label: string | null;
  map_city_place_id: string | null;
  map_city_lat: number | null;
  map_city_lng: number | null;
};

export type PublicCityArtist = {
  slug: string;
  displayName: string;
  lookingForGuestSpots: boolean;
};

export type PublicArtistCity = {
  cityKey: string;
  cityLabel: string;
  lat: number;
  lng: number;
  count: number;
  artists: PublicCityArtist[];
};

/**
 * Aggregate opted-in artists into city buckets, applying the anonymity
 * floor (Q13: below `floor`, the city is omitted entirely) and the
 * listed-vs-counted split. `excludedIds` carries viewer-specific block
 * filtering: excluded artists disappear from the NAMED list but still
 * count anonymously (counts are aggregates; blocking must not dent them
 * in an observable way).
 */
export function aggregateArtistCities(
  rows: ArtistPresenceRow[],
  options: { floor: number; excludedIds?: ReadonlySet<string> },
): PublicArtistCity[] {
  const excluded = options.excludedIds ?? new Set<string>();
  const cities = new Map<
    string,
    { label: string; lats: number[]; lngs: number[]; count: number; artists: PublicCityArtist[] }
  >();
  for (const row of rows) {
    if (row.map_visibility !== "city_only" && row.map_visibility !== "listed")
      continue;
    if (
      !Number.isFinite(row.map_city_lat ?? Number.NaN) ||
      !Number.isFinite(row.map_city_lng ?? Number.NaN) ||
      !row.map_city_label
    )
      continue;
    const key =
      row.map_city_place_id?.trim() ||
      row.map_city_label.trim().toLowerCase();
    let city = cities.get(key);
    if (!city) {
      city = { label: row.map_city_label.trim(), lats: [], lngs: [], count: 0, artists: [] };
      cities.set(key, city);
    }
    city.count += 1;
    city.lats.push(row.map_city_lat as number);
    city.lngs.push(row.map_city_lng as number);
    if (
      row.map_visibility === "listed" &&
      row.slug &&
      !excluded.has(row.id)
    ) {
      city.artists.push({
        slug: row.slug,
        displayName: row.display_name || row.slug,
        lookingForGuestSpots: Boolean(row.looking_for_guest_spots),
      });
    }
  }
  const result: PublicArtistCity[] = [];
  for (const [key, city] of cities) {
    if (city.count < options.floor) continue;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    city.artists.sort((a, b) => a.displayName.localeCompare(b.displayName));
    result.push({
      cityKey: key,
      cityLabel: city.label,
      lat: avg(city.lats),
      lng: avg(city.lngs),
      count: city.count,
      artists: city.artists,
    });
  }
  result.sort((a, b) => b.count - a.count);
  return result;
}
