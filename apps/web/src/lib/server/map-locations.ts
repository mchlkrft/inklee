import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";
import {
  MAP_LOCATION_SOURCES,
  MAP_MODERATION_STATUSES,
  SEED_CAP_PER_BUCKET,
  normalizeInstagramHandle,
  seedRegionBucket,
  validateMapLocationInput,
  type MapLocationSource,
  type MapModerationStatus,
} from "@inklee/shared/map-directory";
import {
  persistDuplicateSuggestions,
  scanForDuplicates,
  type DuplicateHit,
} from "@/lib/server/map-duplicates";

// The ONE map-location creation pipeline (extracted 2026-07-19 so the manual
// admin action and the automated seed lane share identical conversion
// semantics: validation, the locked density cap, duplicate detection, audit).
// The two lanes differ in orchestration, never in conversion rules.

export type MapLocationFormInput = {
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  googlePlaceId: string | null;
  websiteUrl: string | null;
  instagramHandle: string | null;
  source: string;
  moderationStatus: string;
  isSeed: boolean;
};

export type CreateLocationActor =
  | { kind: "admin"; adminId: string }
  | { kind: "automation"; runId: string };

export type CreateLocationResult = {
  error?: string;
  id?: string;
  duplicates?: DuplicateHit[];
};

export function validateLocationEnums(
  input: MapLocationFormInput,
): string | null {
  if (!MAP_LOCATION_SOURCES.includes(input.source as MapLocationSource))
    return "Pick a valid source.";
  if (
    !MAP_MODERATION_STATUSES.includes(
      input.moderationStatus as MapModerationStatus,
    )
  )
    return "Pick a valid moderation status.";
  return null;
}

/**
 * The locked seed density cap: max SEED_CAP_PER_BUCKET seeded entries per
 * ~300 square km bucket, enforced in this insert path (not in import
 * scripts) so no seeding round can bypass it. `excludeId` skips the row
 * being edited.
 */
export async function seedCapError(
  bucket: string,
  excludeId?: string,
): Promise<string | null> {
  let query = serviceClient
    .from("map_locations")
    .select("id", { count: "exact", head: true })
    .eq("is_seed", true)
    .eq("seed_region_bucket", bucket)
    .neq("moderation_status", "removed");
  if (excludeId) query = query.neq("id", excludeId);
  const { count, error } = await query;
  if (error) return `Could not verify the seed cap: ${error.message}`;
  if ((count ?? 0) >= SEED_CAP_PER_BUCKET)
    return `Seed cap reached: this area (bucket ${bucket}) already holds ${count} of ${SEED_CAP_PER_BUCKET} seeded entries. Curate, do not crowd.`;
  return null;
}

export function locationRowFromInput(
  input: MapLocationFormInput,
  bucket: string,
) {
  return {
    source: input.source,
    category: input.category,
    name: input.name.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    // Admin-curated entries render at their true position; the approximate
    // offset applies only to owner studios with that visibility choice.
    display_latitude: input.latitude,
    display_longitude: input.longitude,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    country: input.country?.trim() || null,
    postal_code: input.postalCode?.trim() || null,
    google_place_id: input.googlePlaceId?.trim() || null,
    website_url: input.websiteUrl?.trim() || null,
    instagram_handle: normalizeInstagramHandle(input.instagramHandle),
    moderation_status: input.moderationStatus,
    is_seed: input.isSeed,
    seed_region_bucket: bucket,
    updated_at: new Date().toISOString(),
  };
}

function duplicateEntry(input: MapLocationFormInput) {
  return {
    name: input.name.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address,
    city: input.city,
    instagramHandle: input.instagramHandle,
    websiteUrl: input.websiteUrl,
  };
}

async function auditCreate(
  actor: CreateLocationActor,
  locationId: string,
  input: MapLocationFormInput,
  bucket: string,
  duplicateHitCount: number,
): Promise<void> {
  const metadata = {
    map_location_id: locationId,
    name: input.name.trim(),
    category: input.category,
    is_seed: input.isSeed,
    seed_region_bucket: bucket,
    duplicate_hits: duplicateHitCount,
    ...(actor.kind === "automation" ? { country_run_id: actor.runId } : {}),
  };
  const tasks: Array<PromiseLike<unknown>> = [
    writeAudit({
      action:
        actor.kind === "admin"
          ? "admin_map_location_created"
          : "automated_seed_location_created",
      actor: actor.kind === "admin" ? actor.adminId : "seed-automation",
      category: actor.kind === "admin" ? "admin" : "system",
      details: metadata,
    }),
  ];
  if (actor.kind === "admin") {
    tasks.push(
      serviceClient.from("admin_action_log").insert({
        admin_user_id: actor.adminId,
        target_user_id: null,
        action: "map_location_created",
        reason: null,
        metadata,
      }),
    );
  }
  await Promise.all(tasks);
}

/**
 * Create a map location: validation, the density cap, duplicate detection
 * (warn-and-confirm for the manual lane; the automated lane treats hits as
 * possible duplicates and never passes ignoreDuplicates), insert, audit.
 */
export async function createMapLocationCore(
  actor: CreateLocationActor,
  input: MapLocationFormInput,
  ignoreDuplicates = false,
): Promise<CreateLocationResult> {
  const invalid =
    validateMapLocationInput(input) ?? validateLocationEnums(input);
  if (invalid) return { error: invalid };

  const bucket = seedRegionBucket(input.latitude, input.longitude);
  if (input.isSeed) {
    const capError = await seedCapError(bucket);
    if (capError) return { error: capError };
  }

  const duplicateHits = await scanForDuplicates(duplicateEntry(input));
  if (
    !ignoreDuplicates &&
    duplicateHits.some((h) => h.confidence !== "possible")
  ) {
    return { duplicates: duplicateHits };
  }

  const { data, error } = await serviceClient
    .from("map_locations")
    .insert(locationRowFromInput(input, bucket))
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return {
        error: "A directory entry with this Google place already exists.",
      };
    return { error: error.message };
  }

  await Promise.all([
    auditCreate(actor, data.id as string, input, bucket, duplicateHits.length),
    persistDuplicateSuggestions(
      data.id as string,
      duplicateHits,
      ignoreDuplicates && actor.kind === "admin" ? actor.adminId : undefined,
    ),
  ]);
  return { id: data.id as string };
}
