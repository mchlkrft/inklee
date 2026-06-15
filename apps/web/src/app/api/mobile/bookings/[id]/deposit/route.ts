import {
  requireMobileUser,
  mobileError,
  mobileMutation,
} from "@/lib/server/mobile-auth";
import { requestDepositCore } from "@/lib/server/bookings";

export const runtime = "nodejs";

// POST /api/mobile/bookings/:id/deposit  { amount, dueAt, note? }
// Request a deposit. The shared core decides card-vs-manual: an entitled,
// Connect-active artist gets a PaymentIntent (artist = merchant of record, 3%
// platform fee unless sponsored); otherwise it's a manual deposit. The client
// is emailed a fresh payment link. Server-side floor + rate limit live in core.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  let body: { amount?: unknown; dueAt?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const amount = typeof body.amount === "number" ? body.amount : NaN;
  const dueAt = typeof body.dueAt === "string" ? body.dueAt : "";
  const note = typeof body.note === "string" ? body.note : null;
  if (!Number.isFinite(amount)) {
    return mobileError(400, "amount must be a number.");
  }
  if (!dueAt) {
    return mobileError(400, "dueAt is required.");
  }

  return mobileMutation(
    await requestDepositCore(supabase, userId, id, amount, dueAt, note),
  );
}
