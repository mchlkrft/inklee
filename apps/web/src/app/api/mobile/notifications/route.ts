import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import type { MobileNotificationsResponse } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/notifications — the notification feed + unread count for the
// badge. Mirrors fetchNotificationsAction; RLS scopes to the artist. Capped at
// 100 to match the web feed page (the bell only renders a subset anyway).
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
      .limit(100),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("artist_id", userId)
      .eq("is_read", false),
  ]);

  if (listRes.error) return mobileError(500, listRes.error.message);

  const responseBody: MobileNotificationsResponse = {
    items: (listRes.data ?? []) as MobileNotificationsResponse["items"],
    unread: unreadRes.count ?? 0,
  };
  return mobileOk(responseBody);
}
