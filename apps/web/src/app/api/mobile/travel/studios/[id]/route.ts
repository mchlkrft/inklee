import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import {
  normalizeStudioInput,
  STUDIO_COLS,
  toStudio,
  type StudioRow,
} from "@/lib/mobile-travel";

export const runtime = "nodejs";

// GET /api/mobile/travel/studios/:id — one studio (loads the edit form).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { data, error } = await supabase
    .from("studios")
    .select(STUDIO_COLS)
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (error) return mobileError(500, error.message);
  if (!data) return mobileError(404, "Studio not found.", "not_found");

  return mobileOk(toStudio(data as StudioRow));
}

// PUT /api/mobile/travel/studios/:id — edit the manual studio fields. The Google
// Places columns (place id / lat / lng / formatted address / maps url) are NOT
// written, so a studio geocoded on the web keeps that data.
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

  const parsed = normalizeStudioInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const v = parsed.value;

  const { data: existing, error: readErr } = await supabase
    .from("studios")
    .select("id")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (readErr) return mobileError(500, readErr.message);
  if (!existing) return mobileError(404, "Studio not found.", "not_found");

  if (v.is_primary) {
    const { error: demoteErr } = await supabase
      .from("studios")
      .update({ is_primary: false })
      .eq("artist_id", userId)
      .eq("is_primary", true)
      .neq("id", id);
    if (demoteErr) return mobileError(500, demoteErr.message);
  }

  // icon is tri-state: undefined (old app omitted it) leaves the column alone.
  const update: Record<string, unknown> = {
    name: v.name,
    city: v.city,
    country: v.country,
    address: v.address,
    public_note: v.public_note,
    visibility_mode: v.visibility_mode,
    is_primary: v.is_primary,
    updated_at: new Date().toISOString(),
  };
  if (v.icon !== undefined) update.icon = v.icon;
  if (v.icon_color !== undefined) update.icon_color = v.icon_color;

  const { error } = await supabase
    .from("studios")
    .update(update)
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}

// DELETE /api/mobile/travel/studios/:id — remove a studio. Trip legs that
// reference it are set null by the FK (ON DELETE SET NULL).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { error } = await supabase
    .from("studios")
    .delete()
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
