import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { addArtistReply } from "@/lib/server/support";
import { validateReplyBody } from "@/lib/support";
import { UUID_RE } from "@/lib/mobile-booking-form";

export const runtime = "nodejs";

// POST /api/mobile/support/:id/reply — add the artist's reply. Ownership +
// closed-state guards live in addArtistReply (the shared core), which also
// reopens a resolved ticket and notifies the team. Body: { body }.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  if (!auth.email) {
    return mobileError(400, "Your account has no email on file.");
  }
  const { id } = await params;
  if (!UUID_RE.test(id))
    return mobileError(404, "Ticket not found.", "not_found");

  let raw: Record<string, unknown> = {};
  try {
    raw = ((await req.json()) as Record<string, unknown>) ?? {};
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  const bodyError = validateReplyBody(body);
  if (bodyError) return mobileError(400, bodyError, "invalid");

  const result = await addArtistReply({
    ticketId: id,
    artistId: auth.userId,
    artistEmail: auth.email,
    body,
  });
  if ("error" in result) {
    const status = result.error === "Ticket not found." ? 404 : 400;
    return mobileError(status, result.error);
  }
  return mobileOk({ ok: true });
}
