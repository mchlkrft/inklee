import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";

export const runtime = "nodejs";

// DELETE /api/mobile/travel/legs/:id — remove a trip leg. Ownership is enforced
// via the parent trip (trip_legs RLS = EXISTS own trip); the explicit join gives
// a clean 404 rather than a silent no-op.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { data: leg } = await supabase
    .from("trip_legs")
    .select("id, trips!inner(artist_id)")
    .eq("id", id)
    .eq("trips.artist_id", userId)
    .maybeSingle();
  if (!leg) return mobileError(404, "Trip stop not found.", "not_found");

  const { error } = await supabase.from("trip_legs").delete().eq("id", id);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
