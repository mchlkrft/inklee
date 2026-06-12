import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { deleteOpenSlot } from "@/lib/server/slots";
import { UUID_RE } from "@/lib/mobile-booking-form";

export const runtime = "nodejs";

// DELETE /api/mobile/slots/:id — remove an OPEN slot. The shared core keeps
// the row-level status='open' guard (deleting a slot a client just locked is
// a silent no-op, exactly like the web action) and the artist_id scope.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return mobileError(404, "Slot not found.", "not_found");
  }

  const result = await deleteOpenSlot(supabase, userId, id);
  if (!result.ok) return mobileError(500, result.error);

  return mobileOk({ ok: true });
}
