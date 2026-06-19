import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { createAppointmentCore } from "@/lib/server/bookings";

export const runtime = "nodejs";

// POST /api/mobile/calendar/appointments — create an artist-authored approved
// booking (a manual calendar appointment). Delegates to the shared
// createAppointmentCore (the SAME path the web createAppointmentAction calls) so
// the magic-link token generation, the inserted row shape, the audit row, and
// the approval email live in exactly one place (ME-10). RLS scopes the insert to
// the artist; the mobile client invalidates /calendar after success.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const result = await createAppointmentCore(supabase, userId, {
    handle: String(raw.handle ?? ""),
    email: raw.email != null ? String(raw.email) : null,
    date: String(raw.date ?? ""),
    placement: String(raw.placement ?? ""),
    size: String(raw.size ?? ""),
    description: String(raw.description ?? ""),
    sendEmail: raw.sendEmail === true,
  });
  if ("error" in result) return mobileError(400, result.error);

  return mobileOk({ id: result.id });
}
