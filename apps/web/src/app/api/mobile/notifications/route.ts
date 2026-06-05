import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";

export const runtime = "nodejs";

// GET /api/mobile/notifications — the notification feed + unread count for the
// badge. Mirrors fetchNotificationsAction; RLS scopes to the artist.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const [listRes, unreadRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .eq("artist_id", userId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("artist_id", userId)
      .eq("is_read", false),
  ]);

  if (listRes.error) return mobileError(500, listRes.error.message);

  return mobileOk({
    items: listRes.data ?? [],
    unread: unreadRes.count ?? 0,
  });
}
