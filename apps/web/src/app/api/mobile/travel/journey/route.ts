import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { listTravelJourney } from "@/lib/server/travel-map";
import type { TravelJourneyResponse } from "@inklee/shared/travel-map";

export const runtime = "nodejs";

// GET /api/mobile/travel/journey — the artist's travel journey for the map
// (trips -> trip_legs -> studios), date-ordered with per-leg client-booking
// counts. Same source as the web map (listTravelJourney). Empty when the artist
// has no mappable trips; the native screen shows the map only when non-empty.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const todayKey = new Date().toISOString().slice(0, 10);
  const stops = await listTravelJourney(supabase, userId, todayKey);
  const body: TravelJourneyResponse = { stops };
  return mobileOk(body);
}
