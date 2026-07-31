import {
  requireMobileUser,
  mobileError,
  mobileOk,
} from "@/lib/server/mobile-auth";
import { cancelPaymentRequestCore } from "@/lib/server/appointment-payments";

export const runtime = "nodejs";

// POST /api/mobile/payments/requests/:id/cancel
// Withdraw a payment request. NOT GATED on entitlement, deliberately: an
// artist who lapses to Free must still be able to stop a request for money.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const result = await cancelPaymentRequestCore(supabase, userId, id);
  if (!result.ok) {
    const status =
      result.code === "not_found" ? 404 : result.code === "settled" ? 409 : 400;
    return mobileError(status, result.error, result.code);
  }
  return mobileOk({ id: result.id, status: result.status });
}
