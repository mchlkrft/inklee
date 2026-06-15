import {
  requireMobileUser,
  mobileError,
  mobileMutation,
} from "@/lib/server/mobile-auth";
import { markDepositReceivedCore } from "@/lib/server/bookings";

export const runtime = "nodejs";

// POST /api/mobile/bookings/:id/deposit-received — mark a (manual) deposit as
// paid out-of-band. Cancels any outstanding card intent so the client can't be
// double-charged, then confirms the booking.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  return mobileMutation(await markDepositReceivedCore(supabase, userId, id));
}
