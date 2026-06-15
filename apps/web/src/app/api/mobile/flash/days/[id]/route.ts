import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeFlashDayInput } from "@/lib/mobile-flash";
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

  const [{ data: day, error }, { count }] = await Promise.all([
    supabase
      .from("flash_days")
      .select(
        "id, title, scheduled_on, location, description, status, is_public",
      )
      .eq("id", id)
      .eq("artist_id", userId)
      .maybeSingle(),
    supabase
      .from("flash_items")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", userId)
      .eq("flash_day_id", id),
  ]);
  if (error) return mobileError(500, error.message);
  if (!day) return mobileError(404, "Flash day not found.", "not_found");

  const body: MobileFlashDay = {
    id: day.id,
    title: day.title,
    scheduledOn: day.scheduled_on,
    location: day.location,
    description: day.description,
    status: day.status,
    isPublic: day.is_public,
    itemCount: count ?? 0,
  };
  return mobileOk(body);
}

// PUT /api/mobile/flash/days/:id — edit a flash day. studio_id is intentionally
// NOT written so a web-set studio link isn't clobbered by the text-only mobile
// form (the public page prefers studio_id when present).
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

  const { error } = await supabase
    .from("flash_days")
    .update({
      title: v.title,
      scheduled_on: v.scheduledOn,
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
