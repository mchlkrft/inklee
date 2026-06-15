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
      "slug, display_name, bio, timezone, location, logo_url, instagram_handle, settings",
    )
    .eq("id", userId)
    .single();
  if (error || !data)
    return mobileError(404, "Profile not found.", "not_found");

  const settings = (data.settings ?? {}) as Record<string, unknown>;
  const body: MobileProfile = {
    slug: data.slug,
    displayName: data.display_name,
    bio: data.bio,
    timezone: data.timezone,
    location: data.location,
    logoUrl: data.logo_url,
    instagramHandle: data.instagram_handle,
    coverImageUrl:
      typeof settings.cover_image_url === "string"
        ? settings.cover_image_url
        : null,
    coverColor:
      typeof settings.cover_color === "string" ? settings.cover_color : null,
  };
  return mobileOk(body);
}

// POST /api/mobile/settings/profile — update the editable profile fields
//   { displayName, bio?, instagramHandle?, location?, timezone?, bookingMode?,
//     coverColor? }
// Ports the text + cover-color halves of updateProfileAction (image uploads
// live on the dedicated multipart endpoints). timezone + bookingMode columns
// are only touched when the client sends them, so a partial save never
// clobbers an unchanged value; coverColor merges into the settings JSONB
// without clobbering siblings. RLS own-row update.
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

  // Cover color lives in the settings JSONB — merge into the current value so
  // siblings (cover_image_url, books_settings, bio_page, …) are preserved,
  // mirroring updateProfileAction's settings patch.
  let settingsPatch: Record<string, unknown> | undefined;
  if (v.coverColor !== undefined) {
    const { data: profile, error: readError } = await supabase
      .from("profiles")
      .select("settings")
      .eq("id", userId)
      .single();
    if (readError || !profile) {
      return mobileError(500, readError?.message ?? "Profile not found.");
    }
    settingsPatch = {
      ...((profile.settings ?? {}) as Record<string, unknown>),
    };
    if (v.coverColor === null) delete settingsPatch.cover_color;
    else settingsPatch.cover_color = v.coverColor;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: v.displayName,
      bio: v.bio,
      instagram_handle: v.instagramHandle,
      location: v.location,
      ...(v.timezone ? { timezone: v.timezone } : {}),
      ...(v.bookingMode ? { booking_mode: v.bookingMode } : {}),
      ...(settingsPatch ? { settings: settingsPatch } : {}),
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
