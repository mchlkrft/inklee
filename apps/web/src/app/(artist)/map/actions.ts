"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";

type WatchResult = { error?: string; watched?: boolean };

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
