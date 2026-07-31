import {
  requireMobileUser,
  mobileError,
  mobileOk,
} from "@/lib/server/mobile-auth";
import { refundPaymentRequestCore } from "@/lib/server/appointment-payment-refund";
import type { FeeRefundCase } from "@inklee/shared/fee-refund-policy";

export const runtime = "nodejs";

// POST /api/mobile/payments/requests/:id/refund
// { refundType: "full"|"partial"|"by_line", amountMinor?, lineIds?, case }
// Artist-initiated refund. Creates the Stripe refund; the charge.refunded
// webhook (A4) settles the allocation adjustments.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId } = auth;
  const { id } = await params;

  let body: {
    refundType?: unknown;
    amountMinor?: unknown;
    lineIds?: unknown;
    case?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const refundType = body.refundType;
  if (
    refundType !== "full" &&
    refundType !== "partial" &&
    refundType !== "by_line"
  ) {
    return mobileError(400, "refundType must be full, partial or by_line.");
  }

  const feeCase = body.case;
  if (typeof feeCase !== "string" || feeCase === "") {
    return mobileError(400, "case is required.");
  }

  const result = await refundPaymentRequestCore({
    artistId: userId,
    requestId: id,
    refundType,
    amountMinor:
      typeof body.amountMinor === "number" ? body.amountMinor : undefined,
    lineIds: Array.isArray(body.lineIds) ? body.lineIds : undefined,
    case: feeCase as FeeRefundCase,
  });

  if (result.status === "error") {
    return mobileError(400, result.message);
  }
  return mobileOk({
    refundId: result.refundId,
    refundedMinor: result.refundedMinor,
  });
}
