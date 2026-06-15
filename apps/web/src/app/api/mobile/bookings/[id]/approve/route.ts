import {
  requireMobileUser,
  mobileError,
  mobileMutation,
} from "@/lib/server/mobile-auth";
import {
  approveBookingCore,
  approveBookingWithInterestDecisionsCore,
  type InterestDecisionPayload,
} from "@/lib/server/bookings";

export const runtime = "nodejs";

// POST /api/mobile/bookings/:id/approve  { decisions?: InterestDecisionPayload[] }
// Accept a request. If the booking has pending goods interests, the app sends
// per-item availability `decisions` and we take the approve-with-decisions path
// (mirrors the web Accept popup); with no decisions it's a plain approve.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  let decisions: InterestDecisionPayload[] = [];
  try {
    const body = (await req.json()) as { decisions?: unknown };
    if (Array.isArray(body?.decisions)) {
      decisions = body.decisions.filter(
        (d): d is InterestDecisionPayload =>
          !!d &&
          typeof (d as InterestDecisionPayload).interestId === "string" &&
          typeof (d as InterestDecisionPayload).available === "boolean",
      );
    }
  } catch {
    // No body / invalid JSON → plain approve.
  }

  const result =
    decisions.length > 0
      ? await approveBookingWithInterestDecisionsCore(
          supabase,
          userId,
          id,
          decisions,
        )
      : await approveBookingCore(supabase, userId, id);

  return mobileMutation(result);
}
