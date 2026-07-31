import {
  requireMobileUser,
  mobileError,
  mobileOk,
} from "@/lib/server/mobile-auth";
import {
  createPaymentRequestCore,
  type PaymentRequestInput,
  type PaymentSubjectInput,
} from "@/lib/server/appointment-payments";
import { listPaymentRequestsForArtist } from "@/lib/server/appointment-payment-read";

export const runtime = "nodejs";

// GET /api/mobile/payments/requests — the artist's payment requests, newest
// first. The read half that was missing: the cores could create/send a request
// but nothing could list what was created. RLS-scoped via the caller's client.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  try {
    const requests = await listPaymentRequestsForArtist(
      auth.supabase,
      auth.userId,
    );
    return mobileOk({ requests });
  } catch (e) {
    return mobileError(
      500,
      e instanceof Error ? e.message : "Could not load payment requests.",
    );
  }
}

// POST /api/mobile/payments/requests  { subject, collects, currency?, lines }
// Create a payment request as a draft. Thin route, same discipline as
// deposit/route.ts: all business logic (validation, entitlement, amount
// ceiling) lives in the shared core.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: {
    subject?: unknown;
    collects?: unknown;
    currency?: unknown;
    lines?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const input: PaymentRequestInput = {
    subject: body.subject as PaymentSubjectInput | undefined,
    collects: body.collects,
    currency: body.currency,
    lines: body.lines,
  };

  const result = await createPaymentRequestCore(supabase, userId, input);
  if (!result.ok) {
    const status = result.code === "not_entitled" ? 403 : 400;
    return mobileError(status, result.error, result.code);
  }
  return mobileOk({ id: result.id, status: result.status });
}
