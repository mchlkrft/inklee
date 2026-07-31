import {
  requireMobileUser,
  mobileError,
  mobileOk,
} from "@/lib/server/mobile-auth";
import { getPaymentRequestForArtist } from "@/lib/server/appointment-payment-read";

export const runtime = "nodejs";

// GET /api/mobile/payments/requests/:id — one payment request with its lines.
// RLS-scoped to the artist; 404 when it does not exist or is not theirs.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { id } = await params;
  try {
    const request = await getPaymentRequestForArtist(
      auth.supabase,
      auth.userId,
      id,
    );
    if (!request) return mobileError(404, "Payment request not found.");
    return mobileOk({ request });
  } catch (e) {
    return mobileError(
      500,
      e instanceof Error ? e.message : "Could not load the payment request.",
    );
  }
}
