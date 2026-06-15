import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeFlashDayInput } from "@/lib/mobile-flash";
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

  const [{ data: days, error }, { data: items }] = await Promise.all([
    supabase
      .from("flash_days")
      .select(
        "id, title, scheduled_on, location, description, status, is_public",
      )
      .eq("artist_id", userId)
      .order("scheduled_on", { ascending: true, nullsFirst: false }),
    supabase
      .from("flash_items")
      .select("flash_day_id")
      .eq("artist_id", userId)
      .not("flash_day_id", "is", null),
  ]);
  if (error) return mobileError(500, error.message);

  const counts = new Map<string, number>();
  for (const it of items ?? []) {
    const k = it.flash_day_id as string | null;
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const list: MobileFlashDay[] = (days ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    scheduledOn: d.scheduled_on,
    location: d.location,
    description: d.description,
    status: d.status,
    isPublic: d.is_public,
    itemCount: counts.get(d.id) ?? 0,
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

  const { data, error } = await supabase
    .from("flash_days")
    .insert({
      artist_id: userId,
      title: v.title,
      scheduled_on: v.scheduledOn,
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
