import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeFlashDayInput } from "@/lib/mobile-flash";
import { countDayItems } from "@/lib/server/flash-day-membership";
import type { MobileFlashDay } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/flash/days/:id — one flash day + its attached-item count
// (loads the edit form).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const [{ data: day, error }, countResult] = await Promise.all([
    supabase
      .from("flash_days")
      .select(
        "id, title, scheduled_on, studio_id, location, description, status, is_public",
      )
      .eq("id", id)
      .eq("artist_id", userId)
      .maybeSingle(),
    countDayItems(supabase, userId, [id]),
  ]);
  if (error) return mobileError(500, error.message);
  if (!day) return mobileError(404, "Flash day not found.", "not_found");
  const itemCount = "counts" in countResult ? (countResult.counts[id] ?? 0) : 0;

  const body: MobileFlashDay = {
    id: day.id,
    title: day.title,
    scheduledOn: day.scheduled_on,
    studioId: day.studio_id,
    location: day.location,
    description: day.description,
    status: day.status,
    isPublic: day.is_public,
    itemCount,
  };
  return mobileOk(body);
}

// PUT /api/mobile/flash/days/:id — edit a flash day, including the studio_id
// venue. The shared validator clears free-text location when a studio is set
// (matching the web form); studio ownership is verified below.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const parsed = normalizeFlashDayInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const v = parsed.value;

  const { data: existing, error: readErr } = await supabase
    .from("flash_days")
    .select("id")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (readErr) return mobileError(500, readErr.message);
  if (!existing) return mobileError(404, "Flash day not found.", "not_found");

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

  const { error } = await supabase
    .from("flash_days")
    .update({
      title: v.title,
      scheduled_on: v.scheduledOn,
      studio_id: v.studioId,
      location: v.location,
      description: v.description,
      status: v.status,
      is_public: v.isPublic,
    })
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
