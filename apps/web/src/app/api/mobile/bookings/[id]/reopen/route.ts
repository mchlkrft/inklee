import {
  requireMobileUser,
  mobileError,
  mobileMutation,
} from "@/lib/server/mobile-auth";
import { reopenBookingCore } from "@/lib/server/bookings";

export const runtime = "nodejs";

// POST /api/mobile/bookings/:id/reopen — reopen a cancelled or passed booking
// back to `pending` so the artist can re-request a deposit and restart the loop.
// Money-gated in the core: refuses if the deposit was ever paid; cancels any
// lingering unpaid intent and clears the dead deposit columns.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  return mobileMutation(await reopenBookingCore(supabase, userId, id));
}
