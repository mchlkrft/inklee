"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import {
  MAP_VISIBILITY_MODES,
  type MapVisibilityMode,
} from "@inklee/shared/map-directory";

export type MapPresenceInput = {
  mapVisibility: string;
  lookingForGuestSpots: boolean;
  cityLabel: string | null;
  cityPlaceId: string | null;
  cityLat: number | null;
  cityLng: number | null;
  travelMapConsent: boolean;
  passportPublic: boolean;
  styleKeys: string[];
};

const MAX_STYLES = 8;

type Result = { error?: string };

export async function updateMapPresenceAction(
  input: MapPresenceInput,
): Promise<Result> {
  if (!tattooMapEnabled()) return { error: "The map is not available." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  if (!MAP_VISIBILITY_MODES.includes(input.mapVisibility as MapVisibilityMode))
    return { error: "Pick a valid visibility." };

  const hasCity =
    Boolean(input.cityLabel?.trim()) &&
    Number.isFinite(input.cityLat) &&
    Number.isFinite(input.cityLng);
  if (input.mapVisibility !== "off" && !hasCity)
    return { error: "Pick your city to appear on the map." };
  if (hasCity) {
    if ((input.cityLat as number) < -90 || (input.cityLat as number) > 90)
      return { error: "That city location looks wrong." };
    if ((input.cityLng as number) < -180 || (input.cityLng as number) > 180)
      return { error: "That city location looks wrong." };
    if ((input.cityLabel as string).length > 120)
      return { error: "City name must be at most 120 characters." };
    if (input.cityPlaceId && input.cityPlaceId.length > 256)
      return { error: "That city location looks wrong." };
  }

  const styleKeys = [...new Set(input.styleKeys)];
  if (styleKeys.length > MAX_STYLES)
    return { error: `Pick at most ${MAX_STYLES} styles.` };
  // Validate against the same source the form renders from (the styles
  // table), not a constant that could drift from it.
  if (styleKeys.length > 0) {
    const { data: validStyles } = await serviceClient
      .from("styles")
      .select("key")
      .in("key", styleKeys);
    const valid = new Set((validStyles ?? []).map((s) => s.key as string));
    if (styleKeys.some((k) => !valid.has(k)))
      return { error: "Pick styles from the list." };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      map_visibility: input.mapVisibility,
      looking_for_guest_spots: input.lookingForGuestSpots,
      map_city_label: hasCity ? (input.cityLabel as string).trim() : null,
      map_city_place_id: hasCity ? input.cityPlaceId : null,
      map_city_lat: hasCity ? input.cityLat : null,
      map_city_lng: hasCity ? input.cityLng : null,
      travel_map_consent: input.travelMapConsent,
      passport_public: input.passportPublic,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (profileError) return { error: "Could not save your map settings." };

  // Replace the style set loss-free (own-row RLS on artist_styles): upsert
  // the new keys FIRST, then delete only the stale rows, so a failure at any
  // point leaves at worst a superset instead of wiping the artist's styles.
  if (styleKeys.length > 0) {
    const { error: upsertError } = await supabase.from("artist_styles").upsert(
      styleKeys.map((style_key) => ({
        artist_user_id: user.id,
        style_key,
      })),
      { onConflict: "artist_user_id,style_key", ignoreDuplicates: true },
    );
    if (upsertError) return { error: "Could not save your styles." };
  }
  let staleQuery = supabase
    .from("artist_styles")
    .delete()
    .eq("artist_user_id", user.id);
  if (styleKeys.length > 0) {
    // Keys were validated against the styles table ([a-z_] slugs), so the
    // filter literal is safe to build.
    staleQuery = staleQuery.not("style_key", "in", `(${styleKeys.join(",")})`);
  }
  const { error: staleError } = await staleQuery;
  if (staleError) return { error: "Could not save your styles." };

  revalidatePath("/settings/map");
  return {};
}
