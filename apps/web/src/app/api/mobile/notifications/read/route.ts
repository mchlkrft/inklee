import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";

export const runtime = "nodejs";

// POST /api/mobile/notifications/read  { ids: string[] } — mark specific
// notifications read. RLS scopes the update to the artist's own rows.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) return mobileOk({ updated: 0 });

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("id", ids)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ updated: ids.length });
}
