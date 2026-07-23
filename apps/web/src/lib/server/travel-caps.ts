import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { capState } from "./entitlement-gates";

// The active_trips cap must ALSO be enforced when a future-dated leg is added to
// a not-yet-active trip: adding such a leg is what makes a trip "active", so the
// create-time gate alone is bypassable (create legless trips, then add legs).
// Shared by the web createTripLegAction and the mobile POST trips/:id/legs so the
// two surfaces enforce the identical truth (the deposits-gate drift lesson).
//
// Returns an error string when the add is blocked, else null. Dark-launched via
// entitlement_caps (capState). Fail OPEN on a plan-read blip. A past-dated leg,
// or a leg added to an already-active trip, never counts (neither raises the
// active-trip total).
export async function checkTripLegCap(
  supabase: SupabaseClient,
  artistId: string,
  tripId: string,
  legEndsOn: string | null,
): Promise<string | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Only a leg ending today or later can make a trip active.
    if (!legEndsOn || legEndsOn < today) return null;

    // Already active? Another existing leg on THIS trip ends today or later.
    const { data: activeLegs } = await supabase
      .from("trip_legs")
      .select("id")
      .eq("trip_id", tripId)
      .gte("ends_on", today)
      .limit(1);
    if ((activeLegs ?? []).length > 0) return null;

    // This leg would newly activate the trip: enforce the active-trip cap.
    const overrides = await getAccountOverrides(artistId);
    const { data: activeTrips } = await supabase
      .from("trips")
      .select("id, trip_legs!inner(ends_on)")
      .eq("artist_id", artistId)
      .gte("trip_legs.ends_on", today);
    const count = new Set((activeTrips ?? []).map((t: { id: string }) => t.id))
      .size;
    const gate = capState(overrides, "active_trips", count);
    if (gate.blocked) {
      return `You've reached the ${gate.cap}-active trip limit on your current plan. Upgrade to Plus to add more.`;
    }
    return null;
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "trip_leg_cap_check" },
      extra: { artistId, tripId },
    });
    return null; // fail open
  }
}
