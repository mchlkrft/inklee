import * as Sentry from "@sentry/nextjs";
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
import { getAccountOverrides } from "@/lib/entitlements-server";
import { capState } from "@/lib/server/entitlement-gates";
import type { MobileStudiosResponse } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/travel/studios — the artist's studios (primary first).
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("studios")
    .select(STUDIO_COLS)
    .eq("artist_id", userId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });
  if (error) return mobileError(500, error.message);

  const body: MobileStudiosResponse = {
    items: (data ?? []).map((r) => toStudio(r as StudioRow)),
  };
  return mobileOk(body);
}

// POST /api/mobile/travel/studios — create a studio (manual fields; the Google
// Places autocomplete stays web, so those columns default null here).
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

  const parsed = normalizeStudioInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const v = parsed.value;

  // Entitlement cap (BM-2.0, same gate as the web createStudioAction).
  // Dark-launched via entitlement_caps; fail open on a plan-read blip. No dedup
  // on this path (Places columns are web-only), so every POST is a new row.
  try {
    const overrides = await getAccountOverrides(userId);
    const { count } = await supabase
      .from("studios")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", userId);
    const gate = capState(overrides, "studio_library", count ?? 0);
    if (gate.blocked) {
      return mobileError(
        403,
        `You've reached the ${gate.cap}-studio limit on your current plan. Upgrade to Plus to add more.`,
        "cap_reached",
      );
    }
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "studio_library_cap_check_mobile" },
      extra: { artistId: userId },
    });
  }

  // One primary studio per artist (unique partial index) — demote the old one.
  if (v.is_primary) {
    const { error: demoteErr } = await supabase
      .from("studios")
      .update({ is_primary: false })
      .eq("artist_id", userId)
      .eq("is_primary", true);
    if (demoteErr) return mobileError(500, demoteErr.message);
  }

  // Google Places columns (place id / lat / lng / formatted address / maps url)
  // are NOT written from the mobile body — that geocoded data only comes from the
  // web Places picker. Omitting them defaults the columns to null and prevents a
  // crafted request from injecting an arbitrary google_maps_url onto the public
  // studio block.
  const { data, error } = await supabase
    .from("studios")
    .insert({
      artist_id: userId,
      name: v.name,
      city: v.city,
      country: v.country,
      address: v.address,
      visibility_mode: v.visibility_mode,
      public_note: v.public_note,
      is_primary: v.is_primary,
      icon: v.icon ?? null,
      icon_color: v.icon_color ?? null,
      icon_bg: v.icon_bg ?? null,
    })
    .select("id")
    .single();
  if (error) return mobileError(500, error.message);

  return mobileOk({ id: data.id });
}
