import { randomUUID } from "crypto";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { readImageFile, processAndUpload } from "@/lib/mobile-image";
import type { MobileImageUpload } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/flash/items/:id/image (multipart: image) — set a flash
// design's preview image (1200 webp, aspect kept). Verifies ownership first; the
// previous image file is left in place (orphan cleanup is a follow-up).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { data: item, error: ownErr } = await supabase
    .from("flash_items")
    .select("id")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (ownErr) return mobileError(500, ownErr.message);
  if (!item) return mobileError(404, "Flash design not found.", "not_found");

  const r = await readImageFile(req);
  if (!r.ok) return mobileError(r.status, r.error);

  const up = await processAndUpload(r.file, {
    path: `${userId}/flash/${id}/${randomUUID()}.webp`,
    width: 1200,
    height: 1200,
    fit: "inside",
  });
  if (!up.ok) return mobileError(up.status, up.error);

  const { error } = await supabase
    .from("flash_items")
    .update({ preview_image_url: up.url })
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  const body: MobileImageUpload = { url: up.url };
  return mobileOk(body);
}
