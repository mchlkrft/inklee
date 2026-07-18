"use server";

import { revalidatePath } from "next/cache";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { serviceClient } from "@/lib/supabase/service";
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
import { approximateDisplayPosition } from "@inklee/shared/studio-profile";
import {
  persistDuplicateSuggestions,
  scanForDuplicates,
  type DuplicateHit,
} from "@/lib/server/map-duplicates";
import { approveClaimCore, rejectClaimCore } from "@/lib/server/studios";

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

type Result = { error?: string; id?: string; duplicates?: DuplicateHit[] };

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

async function logMapAdminAction(
  adminUserId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await Promise.all([
    serviceClient.from("admin_action_log").insert({
      admin_user_id: adminUserId,
      target_user_id: null,
      action,
      reason: null,
      metadata,
    }),
    writeAudit({
      action: `admin_${action}`,
      actor: adminUserId,
      category: "admin",
      details: metadata,
    }),
  ]);
}

function validateEnums(input: MapLocationFormInput): string | null {
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
 * ~300 square km bucket, enforced here in the insert path (not in import
 * scripts) so no later seeding round can bypass it. `excludeId` skips the row
 * being edited.
 */
async function seedCapError(
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

function rowFromInput(input: MapLocationFormInput, bucket: string) {
  return {
    source: input.source,
    category: input.category,
    name: input.name.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    // Admin-curated entries render at their true position; the approximate
    // offset concept arrives with studio profiles in Phase 3.
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

export async function createMapLocationAction(
  input: MapLocationFormInput,
  ignoreDuplicates = false,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const invalid = validateMapLocationInput(input) ?? validateEnums(input);
  if (invalid) return { error: invalid };

  const bucket = seedRegionBucket(input.latitude, input.longitude);
  if (input.isSeed) {
    const capError = await seedCapError(bucket);
    if (capError) return { error: capError };
  }

  // Duplicate detection (Phase 1 follow-on): warn-and-confirm on clear or
  // likely hits, persist every hit as an admin review suggestion after save.
  const duplicateHits = await scanForDuplicates(duplicateEntry(input));
  if (
    !ignoreDuplicates &&
    duplicateHits.some((h) => h.confidence !== "possible")
  ) {
    return { duplicates: duplicateHits };
  }

  const { data, error } = await serviceClient
    .from("map_locations")
    .insert(rowFromInput(input, bucket))
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
    logMapAdminAction(adminId, "map_location_created", {
      map_location_id: data.id,
      name: input.name.trim(),
      category: input.category,
      is_seed: input.isSeed,
      seed_region_bucket: bucket,
      duplicate_hits: duplicateHits.length,
    }),
    persistDuplicateSuggestions(
      data.id as string,
      duplicateHits,
      ignoreDuplicates ? adminId : undefined,
    ),
  ]);
  revalidatePath("/admin/map");
  return { id: data.id as string };
}

export async function updateMapLocationAction(
  id: string,
  input: MapLocationFormInput,
  ignoreDuplicates = false,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const invalid = validateMapLocationInput(input) ?? validateEnums(input);
  if (invalid) return { error: invalid };

  const bucket = seedRegionBucket(input.latitude, input.longitude);
  if (input.isSeed) {
    const capError = await seedCapError(bucket, id);
    if (capError) return { error: capError };
  }

  const duplicateHits = await scanForDuplicates(duplicateEntry(input), id);
  if (
    !ignoreDuplicates &&
    duplicateHits.some((h) => h.confidence !== "possible")
  ) {
    return { duplicates: duplicateHits };
  }

  // Studio-linked rows re-derive their public display from the OWNER'S
  // address visibility, so an admin save can never overwrite the approximate
  // offset with the true position (integration sweep follow-up).
  const row = rowFromInput(input, bucket);
  const { data: linkedRow } = await serviceClient
    .from("map_locations")
    .select("studio_profile_id")
    .eq("id", id)
    .maybeSingle();
  if (linkedRow?.studio_profile_id) {
    const { data: linkedStudio } = await serviceClient
      .from("studio_profiles")
      .select("address_visibility")
      .eq("id", linkedRow.studio_profile_id as string)
      .maybeSingle();
    if (linkedStudio?.address_visibility === "approximate") {
      const display = approximateDisplayPosition(
        id,
        input.latitude,
        input.longitude,
      );
      row.display_latitude = display.latitude;
      row.display_longitude = display.longitude;
      row.address = null;
      row.postal_code = null;
    }
  }
  const { error } = await serviceClient
    .from("map_locations")
    .update(row)
    .eq("id", id);
  if (error) {
    if (error.code === "23505")
      return {
        error: "A directory entry with this Google place already exists.",
      };
    return { error: error.message };
  }

  await Promise.all([
    logMapAdminAction(adminId, "map_location_updated", {
      map_location_id: id,
      name: input.name.trim(),
      moderation_status: input.moderationStatus,
      is_seed: input.isSeed,
      seed_region_bucket: bucket,
      duplicate_hits: duplicateHits.length,
    }),
    persistDuplicateSuggestions(
      id,
      duplicateHits,
      ignoreDuplicates ? adminId : undefined,
    ),
  ]);
  revalidatePath("/admin/map");
  revalidatePath(`/admin/map/${id}`);
  return { id };
}

export async function deleteMapLocationAction(id: string): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const { data: existing } = await serviceClient
    .from("map_locations")
    .select("name, studio_profile_id")
    .eq("id", id)
    .maybeSingle();
  // A studio-linked location must never be hard-deleted (integration sweep
  // finding): the cascade would erase the approved claim record and strand
  // the published studio with a false "awaiting map review" state.
  if (existing?.studio_profile_id)
    return {
      error:
        "This entry belongs to a claimed studio. Hide it with moderation instead of deleting.",
    };
  const { error } = await serviceClient
    .from("map_locations")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  await logMapAdminAction(adminId, "map_location_deleted", {
    map_location_id: id,
    name: existing?.name ?? null,
  });
  revalidatePath("/admin/map");
  return {};
}

export async function decideClaimAction(
  claimId: string,
  decision: "approve" | "reject",
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  if (decision !== "approve" && decision !== "reject")
    return { error: "Pick a valid decision." };

  const result =
    decision === "approve"
      ? await approveClaimCore(claimId, adminId)
      : await rejectClaimCore(claimId, adminId);
  if (result.error) return { error: result.error };

  await logMapAdminAction(
    adminId,
    decision === "approve" ? "map_claim_approved" : "map_claim_rejected",
    { claim_id: claimId },
  );
  revalidatePath("/admin/map/claims");
  revalidatePath("/admin/map");
  return {};
}

export async function dismissDuplicateSuggestionAction(
  suggestionId: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const { error } = await serviceClient
    .from("map_duplicate_suggestions")
    .update({
      status: "dismissed",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", suggestionId);
  if (error) return { error: error.message };

  await logMapAdminAction(adminId, "map_duplicate_dismissed", {
    suggestion_id: suggestionId,
  });
  revalidatePath("/admin/map/duplicates");
  return {};
}

export async function setReportStatusAction(
  reportId: string,
  status: "reviewed" | "dismissed",
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  if (status !== "reviewed" && status !== "dismissed")
    return { error: "Pick a valid report status." };

  const { error } = await serviceClient
    .from("map_reports")
    .update({
      status,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  if (error) return { error: error.message };

  await logMapAdminAction(adminId, "map_report_status_set", {
    map_report_id: reportId,
    status,
  });
  revalidatePath("/admin/map/reports");
  return {};
}
