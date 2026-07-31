import {
  requireMobileUser,
  mobileError,
  mobileOk,
} from "@/lib/server/mobile-auth";
import { sendPaymentRequestCore } from "@/lib/server/appointment-payments";

export const runtime = "nodejs";

// POST /api/mobile/payments/requests/:id/send  { expiresAt? }
// Freeze a draft and make it payable. Returns the customer token for the
// payment link URL (/pay/<token>).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  let body: { expiresAt?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // No body is fine; send uses defaults.
  }

  const result = await sendPaymentRequestCore(supabase, userId, id, {
    expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : undefined,
  });
  if (!result.ok) {
    const status =
      result.code === "not_entitled"
        ? 403
        : result.code === "not_found"
          ? 404
          : 400;
    return mobileError(status, result.error, result.code);
  }
  return mobileOk({
    id: result.id,
    status: result.status,
    customerToken: result.customerToken,
  });
}
