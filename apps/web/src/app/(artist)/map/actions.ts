"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import {
  MAP_CORRECTION_REASONS,
  type MapCorrectionReason,
} from "@inklee/shared/map-directory";

type WatchResult = { error?: string; watched?: boolean };

type CorrectionResult = { error?: string; ok?: boolean };

/**
 * Artist-submitted correction for a seed/directory listing (moved, closed,
 * outdated, not a studio). Writes a map_report the admin queue already
 * processes. The seed data is a snapshot, so this is the crowd-sourced
 * freshness signal. One open report per artist per location keeps it from
 * being spammed; a daily cap bounds abuse.
 */
export async function submitMapCorrection(
  mapLocationId: string,
  reason: string,
  detail: string,
): Promise<CorrectionResult> {
  if (!tattooMapEnabled()) return { error: "The map is not available." };
  if (!MAP_CORRECTION_REASONS.includes(reason as MapCorrectionReason))
    return { error: "Pick a reason for the correction." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: location } = await serviceClient
    .from("map_locations")
    .select("id")
    .eq("id", mapLocationId)
    .eq("moderation_status", "approved")
    .maybeSingle();
  if (!location) return { error: "This place is not on the map." };

  // Already flagged by this artist and not yet handled: treat as done rather
  // than stacking duplicate reports on the same pin.
  const { data: open } = await serviceClient
    .from("map_reports")
    .select("id")
    .eq("target_map_location_id", mapLocationId)
    .eq("reporter_user_id", user.id)
    .eq("status", "new")
    .maybeSingle();
  if (open) {
    revalidatePath(`/map/${mapLocationId}`);
    return { ok: true };
  }

  // Bound abuse: cap corrections per artist per day.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await serviceClient
    .from("map_reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_user_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= 25)
    return { error: "You have reported a lot today. Try again tomorrow." };

  const { error } = await serviceClient.from("map_reports").insert({
    reporter_user_id: user.id,
    target_type: "location",
    target_map_location_id: mapLocationId,
    reason,
    detail: detail.trim().slice(0, 500) || null,
    status: "new",
  });
  if (error) return { error: "Could not send the correction." };
  revalidatePath(`/map/${mapLocationId}`);
  return { ok: true };
}

/**
 * Toggle a watched studio. The watch row is written with the user-scoped
 * client (own-row RLS from 0076); the approved check runs first via the
 * service client so hidden or pending locations cannot be probed or watched.
 */
export async function toggleWatchAction(
  mapLocationId: string,
): Promise<WatchResult> {
  if (!tattooMapEnabled()) return { error: "The map is not available." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: location } = await serviceClient
    .from("map_locations")
    .select("id")
    .eq("id", mapLocationId)
    .eq("moderation_status", "approved")
    .maybeSingle();
  if (!location) return { error: "This place is not on the map." };

  const { data: existing } = await supabase
    .from("watched_studios")
    .select("id")
    .eq("map_location_id", mapLocationId)
    .eq("artist_user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("watched_studios")
      .delete()
      .eq("id", existing.id as string);
    if (error) return { error: "Could not update your watched list." };
    revalidatePath("/map");
    return { watched: false };
  }

  const { error } = await supabase.from("watched_studios").insert({
    artist_user_id: user.id,
    map_location_id: mapLocationId,
  });
  if (error && error.code !== "23505")
    return { error: "Could not update your watched list." };
  revalidatePath("/map");
  return { watched: true };
}
