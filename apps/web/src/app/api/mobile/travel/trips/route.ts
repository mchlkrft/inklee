import * as Sentry from "@sentry/nextjs";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeTripInput } from "@/lib/mobile-travel";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { capState } from "@/lib/server/entitlement-gates";
import type {
  MobileTrip,
  MobileTripsResponse,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/travel/trips — the artist's trips (newest first) + leg counts.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data: trips, error } = await supabase
    .from("trips")
    .select(
      "id, title, description, show_on_booking_form, icon, icon_color, icon_bg",
    )
    .eq("artist_id", userId)
    .order("created_at", { ascending: false });
  if (error) return mobileError(500, error.message);

  const tripIds = (trips ?? []).map((t) => t.id);
  const counts = new Map<string, number>();
  if (tripIds.length > 0) {
    const { data: legs } = await supabase
      .from("trip_legs")
      .select("trip_id")
      .in("trip_id", tripIds);
    for (const l of legs ?? []) {
      const k = l.trip_id as string;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }

  const items: MobileTrip[] = (trips ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    showOnBookingForm: t.show_on_booking_form,
    legCount: counts.get(t.id) ?? 0,
    icon: (t.icon as string | null) ?? null,
    iconColor: (t.icon_color as string | null) ?? null,
    iconBg: (t.icon_bg as string | null) ?? null,
  }));
  const body: MobileTripsResponse = { items };
  return mobileOk(body);
}

// POST /api/mobile/travel/trips — create a trip (legs are added from the detail).
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

  const parsed = normalizeTripInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const v = parsed.value;

  // Entitlement cap (BM-2.0, same gate as the web createTripAction). Dark-launched
  // via entitlement_caps; fail open on a plan-read blip. (Leg-add is a separate,
  // ungated path; a follow-up can gate it for full active-trip precision.)
  try {
    const overrides = await getAccountOverrides(userId);
    const today = new Date().toISOString().slice(0, 10);
    const { data: activeTrips } = await supabase
      .from("trips")
      .select("id, trip_legs!inner(ends_on)")
      .eq("artist_id", userId)
      .gte("trip_legs.ends_on", today);
    const count = new Set((activeTrips ?? []).map((t: { id: string }) => t.id))
      .size;
    const gate = capState(overrides, "active_trips", count);
    if (gate.blocked) {
      return mobileError(
        403,
        `You've reached the ${gate.cap}-active trip limit on your current plan. Upgrade to Plus to add more.`,
        "cap_reached",
      );
    }
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "active_trips_cap_check_mobile" },
      extra: { artistId: userId },
    });
  }

  const { data, error } = await supabase
    .from("trips")
    .insert({
      artist_id: userId,
      title: v.title,
      description: v.description,
      show_on_booking_form: v.showOnBookingForm,
      icon: v.icon ?? null,
      icon_color: v.iconColor ?? null,
      icon_bg: v.iconBg ?? null,
    })
    .select("id")
    .single();
  if (error) return mobileError(500, error.message);

  return mobileOk({ id: data.id });
}
