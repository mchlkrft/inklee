import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeTripLegInput } from "@/lib/mobile-travel";

export const runtime = "nodejs";

// POST /api/mobile/travel/trips/:id/legs — add a leg (date range + optional
// studio + notes) to the trip. Verifies trip ownership + that an assigned studio
// is the artist's own.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id: tripId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const parsed = normalizeTripLegInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const v = parsed.value;

  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .eq("artist_id", userId)
    .maybeSingle();
  if (tripErr) return mobileError(500, tripErr.message);
  if (!trip) return mobileError(404, "Trip not found.", "not_found");

  if (v.studioId) {
    const { data: studio } = await supabase
      .from("studios")
      .select("id")
      .eq("id", v.studioId)
      .eq("artist_id", userId)
      .maybeSingle();
    if (!studio) {
      return mobileError(400, "That studio doesn't exist.", "bad_studio");
    }
  }

  const { data, error } = await supabase
    .from("trip_legs")
    .insert({
      trip_id: tripId,
      studio_id: v.studioId,
      starts_on: v.startsOn,
      ends_on: v.endsOn,
      notes: v.notes,
    })
    .select("id")
    .single();
  if (error) return mobileError(500, error.message);

  return mobileOk({ id: data.id });
}
