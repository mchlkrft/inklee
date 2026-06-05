import {
  requireMobileUser,
  mobileError,
  mobileMutation,
} from "@/lib/server/mobile-auth";
import { refundDepositCore } from "@/lib/server/bookings";

export const runtime = "nodejs";

// POST /api/mobile/bookings/:id/deposit-refund — full refund of a paid card
// deposit. reverse_transfer pulls it back from the artist; Inklee's fee is
// returned; Stripe's processing fee is non-refundable (dashboard-refund parity).
// Idempotent (audit-log guard + Stripe idempotency key).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  return mobileMutation(await refundDepositCore(supabase, userId, id));
}
