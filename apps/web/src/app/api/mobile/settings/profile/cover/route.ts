import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { readImageFile, processAndUpload } from "@/lib/mobile-image";
import { serviceClient } from "@/lib/supabase/service";
import type { MobileImageUpload } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/settings/profile/cover (multipart: image) — replace the
// public-page cover image. Mirrors the cover half of the web
// updateProfileAction: 1600x600 webp at a fixed path so the upsert overwrites
// the previous file (no orphaned storage object), and the URL lands in
// profiles.settings.cover_image_url merged into the current settings JSONB so
// sibling keys (cover_color, books_settings, …) are preserved. RLS own-row
// update.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const r = await readImageFile(req);
  if (!r.ok) return mobileError(r.status, r.error);

  const up = await processAndUpload(r.file, {
    path: `${userId}/cover.webp`,
    width: 1600,
    height: 600,
    fit: "cover",
  });
  if (!up.ok) return mobileError(up.status, up.error);

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const current = (profile.settings ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...current, cover_image_url: up.url },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  const body: MobileImageUpload = { url: up.url };
  return mobileOk(body);
}

// DELETE /api/mobile/settings/profile/cover — remove the cover image. Deletes
// the storage object best-effort (a missing file is non-fatal, mirroring the
// web action's remove path) and drops cover_image_url from the settings JSONB
// without touching siblings.
export async function DELETE(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  await serviceClient.storage
    .from("logos")
    .remove([`${userId}/cover.webp`])
    .catch(() => undefined);

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const current = { ...((profile.settings ?? {}) as Record<string, unknown>) };
  delete current.cover_image_url;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: current,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
