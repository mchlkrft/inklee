import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { readImageFile, processAndUpload } from "@/lib/mobile-image";
import type { MobileImageUpload } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/settings/profile/logo (multipart: image) — replace the artist
// logo. 512×512 webp at a fixed path so the upsert overwrites the previous file
// (no orphaned storage object). RLS-scoped own-row update.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const r = await readImageFile(req);
  if (!r.ok) return mobileError(r.status, r.error);

  const up = await processAndUpload(r.file, {
    path: `${userId}/logo.webp`,
    width: 512,
    height: 512,
    fit: "cover",
  });
  if (!up.ok) return mobileError(up.status, up.error);

  const { error } = await supabase
    .from("profiles")
    .update({ logo_url: up.url, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  const body: MobileImageUpload = { url: up.url };
  return mobileOk(body);
}
