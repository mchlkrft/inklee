import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";

export const runtime = "nodejs";

// POST /api/mobile/notifications/read-all — mark every unread notification read.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("artist_id", userId)
    .eq("is_read", false);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
