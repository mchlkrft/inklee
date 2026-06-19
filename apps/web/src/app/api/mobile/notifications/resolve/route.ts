import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";

export const runtime = "nodejs";

// POST /api/mobile/notifications/resolve  { id } — resolve a system warning.
// Ports resolveWarningAction: marks the warning resolved AND read so it drops
// off both the unread badge and the unresolved-warning surface. RLS scopes the
// update to the artist's own row (same thin pattern as the read / read-all
// routes).
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  if (typeof body.id !== "string" || !body.id) {
    return mobileError(400, "id is required.");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_resolved: true, is_read: true })
    .eq("id", body.id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
