import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase/service";

// Watch/unwatch a map location. ONE core shared by the web server action
// (apps/web/src/app/(artist)/map/actions.ts) and the mobile route
// (/api/mobile/map/locations/[id]/watch), per the one-source-of-truth rule.
// The watch row is written with the USER-SCOPED client (own-row RLS from
// migration 0076); the approved check runs first via the service client so
// hidden or pending locations cannot be probed or watched.

export type ToggleWatchResult = {
  error?: string;
  /** Machine-readable failure kind so routes can map HTTP status faithfully. */
  code?: "not_found" | "write_failed";
  watched?: boolean;
};

export async function toggleWatchCore(
  supabase: SupabaseClient,
  userId: string,
  mapLocationId: string,
): Promise<ToggleWatchResult> {
  const { data: location } = await serviceClient
    .from("map_locations")
    .select("id")
    .eq("id", mapLocationId)
    .eq("moderation_status", "approved")
    .maybeSingle();
  if (!location)
    return { error: "This place is not on the map.", code: "not_found" };

  const { data: existing } = await supabase
    .from("watched_studios")
    .select("id")
    .eq("map_location_id", mapLocationId)
    .eq("artist_user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("watched_studios")
      .delete()
      .eq("id", existing.id as string);
    if (error)
      return {
        error: "Could not update your watched list.",
        code: "write_failed",
      };
    return { watched: false };
  }

  const { error } = await supabase.from("watched_studios").insert({
    artist_user_id: userId,
    map_location_id: mapLocationId,
  });
  if (error && error.code !== "23505")
    return {
      error: "Could not update your watched list.",
      code: "write_failed",
    };
  return { watched: true };
}
