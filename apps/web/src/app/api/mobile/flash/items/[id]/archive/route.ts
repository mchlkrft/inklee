import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";

export const runtime = "nodejs";

// POST /api/mobile/flash/items/:id/archive — archive a flash design. Mirrors the
// web archiveFlashItemAction: it sets status=archived AND forces is_bookable=false
// in the same write, so an archived design can never linger as bookable (a plain
// status enum change on the edit form does not replicate that coupling). RLS +
// the explicit artist_id eq scope this to the owner's row.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { data: existing, error: readErr } = await supabase
    .from("flash_items")
    .select("id")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (readErr) return mobileError(500, readErr.message);
  if (!existing)
    return mobileError(404, "Flash design not found.", "not_found");

  const { error } = await supabase
    .from("flash_items")
    .update({ status: "archived", is_bookable: false })
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
