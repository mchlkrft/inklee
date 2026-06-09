import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeProfileUpdate } from "@/lib/mobile-settings";
import { writeAudit } from "@/lib/audit";
import type { MobileProfile } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/settings/profile — the editable profile fields.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "slug, display_name, bio, timezone, location, logo_url, instagram_handle",
    )
    .eq("id", userId)
    .single();
  if (error || !data)
    return mobileError(404, "Profile not found.", "not_found");

  const body: MobileProfile = {
    slug: data.slug,
    displayName: data.display_name,
    bio: data.bio,
    timezone: data.timezone,
    location: data.location,
    logoUrl: data.logo_url,
    instagramHandle: data.instagram_handle,
  };
  return mobileOk(body);
}

// POST /api/mobile/settings/profile — update the editable text fields
//   { displayName, bio?, instagramHandle?, location?, timezone?, bookingMode? }
// Ports the text half of updateProfileAction (logo/cover image upload stays web).
// timezone + bookingMode columns are only touched when the client sends them, so
// a partial save never clobbers an unchanged value. RLS own-row update.
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

  const parsed = normalizeProfileUpdate(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const v = parsed.value;

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: v.displayName,
      bio: v.bio,
      instagram_handle: v.instagramHandle,
      location: v.location,
      ...(v.timezone ? { timezone: v.timezone } : {}),
      ...(v.bookingMode ? { booking_mode: v.bookingMode } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  if (v.bookingMode) {
    void writeAudit({
      action: "booking_mode_changed",
      actor: userId,
      category: "settings",
      details: { to: v.bookingMode },
    });
  }

  return mobileOk({ ok: true });
}
