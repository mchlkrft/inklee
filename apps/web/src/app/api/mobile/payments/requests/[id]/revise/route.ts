import {
  requireMobileUser,
  mobileError,
  mobileOk,
} from "@/lib/server/mobile-auth";
import { revisePaymentRequestCore } from "@/lib/server/appointment-payments";

export const runtime = "nodejs";

// POST /api/mobile/payments/requests/:id/revise  { collects?, lines? }
// Create a new revision of a sent request. The predecessor stays live until
// the revision is sent (sendPaymentRequestCore cancels it atomically).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  let body: { collects?: unknown; lines?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // No body = carry over the predecessor's lines.
  }

  const result = await revisePaymentRequestCore(supabase, userId, id, {
    collects: body.collects,
    lines: body.lines,
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
  return mobileOk({ id: result.id, status: result.status });
}
