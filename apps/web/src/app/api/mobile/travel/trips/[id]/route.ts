import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { GUEST_SPOT_LEG_LOCKED_MESSAGE } from "@inklee/shared/guest-spots";
import { normalizeTripInput } from "@/lib/mobile-travel";
import type {
  MobileTripDetail,
  MobileTripLeg,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

type LegRow = {
  id: string;
  starts_on: string;
  ends_on: string;
  studio_id: string | null;
  notes: string | null;
  // PostgREST types a to-one embed as an array; at runtime it's a single object
  // (or null). Handle both shapes.
  studios: { name: string } | { name: string }[] | null;
};

function legStudioName(s: LegRow["studios"]): string | null {
  if (!s) return null;
  return Array.isArray(s) ? (s[0]?.name ?? null) : s.name;
}

// GET /api/mobile/travel/trips/:id — the trip + its legs (with studio names) +
// the artist's studios for the leg picker.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { data: trip, error } = await supabase
    .from("trips")
    .select(
      "id, title, description, show_on_booking_form, icon, icon_color, icon_bg",
    )
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (error) return mobileError(500, error.message);
  if (!trip) return mobileError(404, "Trip not found.", "not_found");

  const [{ data: legs }, { data: studios }] = await Promise.all([
    supabase
      .from("trip_legs")
      .select("id, starts_on, ends_on, studio_id, notes, studios(name)")
      .eq("trip_id", id)
      .order("starts_on", { ascending: true }),
    supabase
      .from("studios")
      .select("id, name, city")
      .eq("artist_id", userId)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true }),
  ]);

  const legItems: MobileTripLeg[] = ((legs ?? []) as unknown as LegRow[]).map(
    (l) => ({
      id: l.id,
      startsOn: l.starts_on,
      endsOn: l.ends_on,
      studioId: l.studio_id,
      studioName: legStudioName(l.studios),
      notes: l.notes,
    }),
  );

  const body: MobileTripDetail = {
    id: trip.id,
    title: trip.title,
    description: trip.description,
    showOnBookingForm: trip.show_on_booking_form,
    legs: legItems,
    studios: (studios ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
    })),
    icon: (trip.icon as string | null) ?? null,
    iconColor: (trip.icon_color as string | null) ?? null,
    iconBg: (trip.icon_bg as string | null) ?? null,
  };
  return mobileOk(body);
}

// PUT /api/mobile/travel/trips/:id — edit the trip's title/description/visibility.
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

  const parsed = normalizeTripInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const v = parsed.value;

  const { data: existing, error: readErr } = await supabase
    .from("trips")
    .select("id")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (readErr) return mobileError(500, readErr.message);
  if (!existing) return mobileError(404, "Trip not found.", "not_found");

  // icon is tri-state: absent (old app) = leave the column untouched.
  const update: Record<string, unknown> = {
    title: v.title,
    description: v.description,
    show_on_booking_form: v.showOnBookingForm,
  };
  if (v.icon !== undefined) update.icon = v.icon;
  if (v.iconColor !== undefined) update.icon_color = v.iconColor;
  if (v.iconBg !== undefined) update.icon_bg = v.iconBg;

  const { error } = await supabase
    .from("trips")
    .update(update)
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}

// DELETE /api/mobile/travel/trips/:id — remove the trip (legs cascade).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  // Guest-spot-managed legs lock their trip against direct deletion
  // (Inklee 2.0 Phase 4: those dates move only through the request flow).
  const { data: lockedLeg } = await supabase
    .from("trip_legs")
    .select("id")
    .eq("trip_id", id)
    .eq("origin", "guest_spot")
    .limit(1)
    .maybeSingle();
  if (lockedLeg)
    return mobileError(409, GUEST_SPOT_LEG_LOCKED_MESSAGE, "locked");

  const { error } = await supabase
    .from("trips")
    .delete()
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
