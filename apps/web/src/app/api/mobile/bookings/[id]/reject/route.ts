import {
  requireMobileUser,
  mobileError,
  mobileMutation,
} from "@/lib/server/mobile-auth";
import { rejectBookingCore } from "@/lib/server/bookings";

export const runtime = "nodejs";

// POST /api/mobile/bookings/:id/reject — decline a request.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  return mobileMutation(await rejectBookingCore(supabase, userId, id));
}
