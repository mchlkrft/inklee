import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { revalidatePublicPage } from "@/lib/server/mobile-goods-server";
import { isProductStatus } from "@/lib/goods";

export const runtime = "nodejs";

// PATCH /api/mobile/goods/:id/status — status-only update (active | hidden |
// sold_out) for the grid tile's quick sold-out/available toggle. Mirrors the web
// setProductStatusAction: validate the status, scope to the artist, revalidate
// the public page. Does NOT touch any other field, so it's safe to call without
// the full product payload.
export async function PATCH(
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
  const status = (raw as Record<string, unknown>)?.status;
  if (!isProductStatus(status)) {
    return mobileError(400, "Invalid status.");
  }

  const { data: existing, error: readErr } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (readErr) return mobileError(500, readErr.message);
  if (!existing) return mobileError(404, "Product not found.", "not_found");

  const { error } = await supabase
    .from("products")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  await revalidatePublicPage(supabase, userId);
  return mobileOk({ ok: true });
}
