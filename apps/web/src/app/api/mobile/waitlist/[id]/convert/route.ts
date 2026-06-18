import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { convertWaitlistEntryCore } from "@/lib/server/waitlist";

export const runtime = "nodejs";

// POST /api/mobile/waitlist/:id/convert — move a waitlist entry to an accepted
// booking. Delegates to the shared convertWaitlistEntryCore (the SAME core the
// web "Move to booking" action calls) so the guards (already-converted,
// missing-email, the concurrent-convert claim) + the magic-link/booking insert
// contract live in exactly one place (ME-10). RLS-scoped; needs an email to send
// the link.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const result = await convertWaitlistEntryCore(supabase, userId, id);
  if (!result.ok) return mobileError(result.status, result.error);

  return mobileOk({ id, status: "converted" });
}
