import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import type { MobileWaitlistEntry } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

const ALLOWED = ["contacted", "dismissed"];

// A malformed id (bad deep link) would otherwise surface Postgres' raw 22P02
// "invalid input syntax for type uuid" as a 500 — treat it as not-found, like
// the sibling bookings detail route does.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/mobile/waitlist/:id — one waitlist entry (the detail screen). Needed
// for cold starts / deep links where the list cache is empty. RLS-scoped.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return mobileError(404, "Waitlist entry not found.", "not_found");
  }

  const { data, error } = await supabase
    .from("waitlist_entries")
    .select(
      "id, customer_email, customer_handle, note, status, created_at, city_text",
    )
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (error) return mobileError(500, error.message);
  if (!data) return mobileError(404, "Waitlist entry not found.", "not_found");

  return mobileOk(data as MobileWaitlistEntry);
}

// POST /api/mobile/waitlist/:id  { status: "contacted" | "dismissed" } — update a
// waitlist entry's status (mirrors the web markWaitlistContacted /
// dismissWaitlistEntry). Convert-to-booking lives at /waitlist/:id/convert.
// RLS-scoped: the artist updates only their own entries.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return mobileError(404, "Waitlist entry not found.", "not_found");
  }

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  if (typeof body.status !== "string" || !ALLOWED.includes(body.status)) {
    return mobileError(400, "status must be 'contacted' or 'dismissed'.");
  }

  // .select() so a zero-row update (a foreign or nonexistent id — RLS + the
  // artist_id filter already prevent any cross-tenant write) is distinguishable
  // from a real update and returns 404 rather than a misleading 200.
  const { data: updated, error } = await supabase
    .from("waitlist_entries")
    .update({ status: body.status })
    .eq("id", id)
    .eq("artist_id", userId)
    .select("id");
  if (error) return mobileError(500, error.message);
  if (!updated || updated.length === 0) {
    return mobileError(404, "Waitlist entry not found.");
  }

  return mobileOk({ id, status: body.status });
}
