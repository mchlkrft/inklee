import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeFlashDayInput } from "@/lib/mobile-flash";
import { countDayItems } from "@/lib/server/flash-day-membership";
import type {
  MobileFlashDay,
  MobileFlashDaysResponse,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/flash/days — the artist's flash days + attached-item counts.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const [{ data: days, error }, countResult] = await Promise.all([
    supabase
      .from("flash_days")
      .select(
        "id, title, scheduled_on, studio_id, location, description, status, is_public",
      )
      .eq("artist_id", userId)
      .order("scheduled_on", { ascending: true, nullsFirst: false }),
    // Design counts from the junction (source of truth), matching web + public.
    countDayItems(supabase, userId),
  ]);
  if (error) return mobileError(500, error.message);
  const counts = "counts" in countResult ? countResult.counts : {};

  const list: MobileFlashDay[] = (days ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    scheduledOn: d.scheduled_on,
    studioId: d.studio_id,
    location: d.location,
    description: d.description,
    status: d.status,
    isPublic: d.is_public,
    itemCount: counts[d.id] ?? 0,
  }));
  const body: MobileFlashDaysResponse = { items: list };
  return mobileOk(body);
}

// POST /api/mobile/flash/days — create a flash day. Mobile uses free-text
// location only (the studio-library picker stays web; studio_id defaults null).
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const parsed = normalizeFlashDayInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const v = parsed.value;

  if (v.studioId) {
    const { data: studio, error: studioErr } = await supabase
      .from("studios")
      .select("id")
      .eq("id", v.studioId)
      .eq("artist_id", userId)
      .maybeSingle();
    if (studioErr) return mobileError(500, studioErr.message);
    if (!studio)
      return mobileError(400, "That studio doesn't exist.", "bad_studio");
  }

  const { data, error } = await supabase
    .from("flash_days")
    .insert({
      artist_id: userId,
      title: v.title,
      scheduled_on: v.scheduledOn,
      studio_id: v.studioId,
      location: v.location,
      description: v.description,
      status: v.status,
      is_public: v.isPublic,
    })
    .select("id")
    .single();
  if (error) return mobileError(500, error.message);

  return mobileOk({ id: data.id });
}
