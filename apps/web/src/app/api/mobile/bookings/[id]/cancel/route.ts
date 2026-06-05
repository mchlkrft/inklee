import {
  requireMobileUser,
  mobileError,
  mobileMutation,
} from "@/lib/server/mobile-auth";
import { cancelBookingCore } from "@/lib/server/bookings";

export const runtime = "nodejs";

// POST /api/mobile/bookings/:id/cancel — artist-initiated cancellation. A paid
// card deposit is fully refunded first (client made whole); a live unpaid intent
// is cancelled. The booking stays put if the refund fails (money never stranded).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  return mobileMutation(await cancelBookingCore(supabase, userId, id));
}
