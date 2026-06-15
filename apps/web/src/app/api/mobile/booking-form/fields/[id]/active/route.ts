import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { UUID_RE } from "@/lib/mobile-booking-form";

export const runtime = "nodejs";

// POST /api/mobile/booking-form/fields/:id/active  { active: boolean } — show
// or hide a custom field on the public form. Port of the web
// toggleFieldActiveAction; RLS scopes the update to the artist's own row.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return mobileError(404, "Field not found.", "not_found");
  }

  let body: { active?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  if (typeof body.active !== "boolean") {
    return mobileError(400, "active must be a boolean.");
  }

  const { error } = await supabase
    .from("custom_fields")
    .update({ active: body.active })
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
