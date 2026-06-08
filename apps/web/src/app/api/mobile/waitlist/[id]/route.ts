import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";

export const runtime = "nodejs";

const ALLOWED = ["contacted", "dismissed"];

// POST /api/mobile/waitlist/:id  { status: "contacted" | "dismissed" } — update a
// waitlist entry's status (mirrors the web markWaitlistContacted /
// dismissWaitlistEntry). Convert-to-booking ("move to booking") is web-only for
// now. RLS-scoped: the artist updates only their own entries.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  if (typeof body.status !== "string" || !ALLOWED.includes(body.status)) {
    return mobileError(400, "status must be 'contacted' or 'dismissed'.");
  }

  const { error } = await supabase
    .from("waitlist_entries")
    .update({ status: body.status })
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ id, status: body.status });
}
