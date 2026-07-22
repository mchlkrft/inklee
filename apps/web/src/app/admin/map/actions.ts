"use server";

import { revalidatePath } from "next/cache";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { serviceClient } from "@/lib/supabase/service";
import {
  seedRegionBucket,
  validateMapLocationInput,
} from "@inklee/shared/map-directory";
import { approximateDisplayPosition } from "@inklee/shared/studio-profile";
import {
  persistDuplicateSuggestions,
  scanForDuplicates,
  type DuplicateHit,
} from "@/lib/server/map-duplicates";
import {
  createMapLocationCore,
  locationRowFromInput,
  seedCapError,
  validateLocationEnums,
  type MapLocationFormInput,
} from "@/lib/server/map-locations";
import { approveClaimCore, rejectClaimCore } from "@/lib/server/studios";

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

export async function createMapLocationAction(
  input: MapLocationFormInput,
  ignoreDuplicates = false,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  // The shared conversion core (validation, density cap, duplicate
  // warn-and-confirm, insert, audit) — identical semantics for the manual
  // admin lane and the automated seed lane.
  const result = await createMapLocationCore(
    { kind: "admin", adminId },
    input,
    ignoreDuplicates,
  );
  if (result.id) revalidatePath("/admin/map");
  return result;
}

export async function updateMapLocationAction(
  id: string,
  input: MapLocationFormInput,
  ignoreDuplicates = false,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const invalid =
    validateMapLocationInput(input) ?? validateLocationEnums(input);
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
  const row = locationRowFromInput(input, bucket);
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

/**
 * Action a "closed" / "outdated" report: flag the location possibly_closed (a
 * soft warning on the detail, reversed by any owner confirmation) and resolve
 * the report as actioned. The location comes from the report, so a stale id can
 * never be targeted.
 */
export async function markLocationPossiblyClosedAction(
  reportId: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const { data: report } = await serviceClient
    .from("map_reports")
    .select("id, target_map_location_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!report?.target_map_location_id)
    return { error: "This report is not about a map location." };
  const locationId = report.target_map_location_id as string;

  const { error: locErr } = await serviceClient
    .from("map_locations")
    .update({ possibly_closed: true, updated_at: new Date().toISOString() })
    .eq("id", locationId);
  if (locErr) return { error: locErr.message };

  const { error: repErr } = await serviceClient
    .from("map_reports")
    .update({
      status: "actioned",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  if (repErr) return { error: repErr.message };

  await logMapAdminAction(adminId, "map_location_possibly_closed", {
    map_report_id: reportId,
    map_location_id: locationId,
  });
  revalidatePath("/admin/map/reports");
  return {};
}
