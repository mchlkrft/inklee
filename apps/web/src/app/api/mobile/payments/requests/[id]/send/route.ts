import {
  requireMobileUser,
  mobileError,
  mobileOk,
} from "@/lib/server/mobile-auth";
import * as Sentry from "@sentry/nextjs";
import { sendPaymentRequestCore } from "@/lib/server/appointment-payments";
import { deliverPaymentRequestLink } from "@/lib/server/appointment-payment-delivery";

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
  // Email the client their /pay/<token> link (Track A slice 3). Best-effort
  // AFTER the send succeeded: a provider outage never un-sends the request.
  // ADDITIVE keys (older builds ignore them); customerToken stays for the app's
  // own share-the-link flow. `customerToken?` is optional only because the
  // write-result type is shared; a successful send always carries one — a
  // violation is a core bug and is CAPTURED here exactly like the web action
  // does (verifier finding: the two surfaces answered this case differently).
  if (!result.customerToken) {
    Sentry.captureMessage("payment request sent without a customer token", {
      extra: { requestId: id, surface: "mobile" },
    });
  }
  const delivery = result.customerToken
    ? await deliverPaymentRequestLink(
        supabase,
        userId,
        id,
        result.customerToken,
      )
    : null;
  return mobileOk({
    id: result.id,
    status: result.status,
    customerToken: result.customerToken,
    ...(delivery ? { payUrl: delivery.payUrl, emailed: delivery.emailed } : {}),
  });
}
