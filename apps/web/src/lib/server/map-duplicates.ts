import { serviceClient } from "@/lib/supabase/service";
import {
  classifyDuplicate,
  normalizeInstagramHandle,
  normalizeWebsiteHost,
  type DuplicateCandidateInput,
  type DuplicateConfidence,
  type DuplicateHit,
} from "@inklee/shared/map-directory";

export type { DuplicateHit };

/** Escape LIKE metacharacters so admin-typed strings match literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

// Duplicate studio detection (scope 4.10 extension, Phase 1 follow-on).
// Candidate fetch is three cheap queries (nearby, same city, same
// instagram); classification is the shared pure math. Founder-scale by
// design; a similarity index can replace the fetch if the directory ever
// outgrows it. Never auto-merges anything.

const NEARBY_DEGREES = 0.004; // ~450 m of latitude
const CITY_CANDIDATE_LIMIT = 300;

type CandidateRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  country: string | null;
  instagram_handle: string | null;
  website_url: string | null;
  moderation_status: string;
};

const CANDIDATE_COLS =
  "id, name, latitude, longitude, address, city, country, instagram_handle, website_url, moderation_status";

export async function scanForDuplicates(
  entry: DuplicateCandidateInput & { city?: string | null },
  excludeId?: string,
): Promise<DuplicateHit[]> {
  const queries = [
    serviceClient
      .from("map_locations")
      .select(CANDIDATE_COLS)
      .gte("latitude", entry.latitude - NEARBY_DEGREES)
      .lte("latitude", entry.latitude + NEARBY_DEGREES)
      .gte("longitude", entry.longitude - NEARBY_DEGREES * 2)
      .lte("longitude", entry.longitude + NEARBY_DEGREES * 2)
      .limit(CITY_CANDIDATE_LIMIT),
  ];
  if (entry.city?.trim()) {
    queries.push(
      serviceClient
        .from("map_locations")
        .select(CANDIDATE_COLS)
        .ilike("city", escapeLike(entry.city.trim()))
        .limit(CITY_CANDIDATE_LIMIT),
    );
  }
  const instagram = normalizeInstagramHandle(entry.instagramHandle);
  if (instagram) {
    queries.push(
      serviceClient
        .from("map_locations")
        .select(CANDIDATE_COLS)
        .eq("instagram_handle", instagram)
        .limit(50),
    );
  }
  // Same-website recall: classification treats a matching website as a clear
  // signal, so the fetch must be able to surface those rows even far away.
  const websiteHost = normalizeWebsiteHost(entry.websiteUrl);
  if (websiteHost) {
    queries.push(
      serviceClient
        .from("map_locations")
        .select(CANDIDATE_COLS)
        .ilike("website_url", `%${escapeLike(websiteHost)}%`)
        .limit(50),
    );
  }

  const results = await Promise.all(queries);
  const seen = new Map<string, CandidateRow>();
  for (const { data } of results) {
    for (const row of (data ?? []) as CandidateRow[]) {
      if (row.id === excludeId) continue;
      if (row.moderation_status === "removed") continue;
      seen.set(row.id, row);
    }
  }

  const order: Record<DuplicateConfidence, number> = {
    clear: 0,
    likely: 1,
    possible: 2,
  };
  const hits: DuplicateHit[] = [];
  for (const row of seen.values()) {
    const verdict = classifyDuplicate(entry, {
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      instagramHandle: row.instagram_handle,
      websiteUrl: row.website_url,
    });
    if (!verdict) continue;
    hits.push({
      locationId: row.id,
      name: row.name,
      city: row.city,
      country: row.country,
      confidence: verdict.confidence,
      signals: verdict.signals,
    });
  }
  hits.sort((a, b) => order[a.confidence] - order[b.confidence]);
  return hits;
}

/**
 * Persist review suggestions for a saved location. Ordered pair + ON
 * CONFLICT DO NOTHING keeps re-saves from resurrecting dismissed pairs.
 * When `reviewedInFormBy` is set (the admin clicked "save anyway"), the
 * clear/likely hits they just reviewed are stored already dismissed, so the
 * queue never asks for the same judgment twice; unseen "possible" hits stay
 * open for review.
 */
export async function persistDuplicateSuggestions(
  locationId: string,
  hits: DuplicateHit[],
  reviewedInFormBy?: string,
): Promise<void> {
  if (hits.length === 0) return;
  const now = new Date().toISOString();
  const rows = hits.map((h) => {
    const [a, b] =
      locationId < h.locationId
        ? [locationId, h.locationId]
        : [h.locationId, locationId];
    const dismissedInForm =
      Boolean(reviewedInFormBy) && h.confidence !== "possible";
    return {
      location_a: a,
      location_b: b,
      confidence: h.confidence,
      signals: h.signals,
      status: dismissedInForm ? "dismissed" : "open",
      reviewed_by: dismissedInForm ? reviewedInFormBy : null,
      reviewed_at: dismissedInForm ? now : null,
    };
  });
  await serviceClient
    .from("map_duplicate_suggestions")
    .upsert(rows, {
      onConflict: "location_a,location_b",
      ignoreDuplicates: true,
    });
}
