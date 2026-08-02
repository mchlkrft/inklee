"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refundGoodsOrderCore } from "@/lib/server/goods-order-refund";
import { isArtistInitiatedFeeRefundCase } from "@inklee/shared/fee-refund-policy";

// Server actions for the goods order detail page (FD12). Thin wrapper over the
// SAME core the founder's list requires: full / by-line-with-quantity / custom
// amount, deterministic fee + processor-cost treatment, restock selection and
// discount cap-release all live in refundGoodsOrderCore. This file only
// resolves the signed-in artist and validates the fee-refund case allowlist,
// mirroring the appointment lane's refundPaymentRequestAction exactly.

const LIST_PATH = "/goods/sales";

export type GoodsRefundActionResult =
  | {
      ok: true;
      refundedMinor: number;
      remainingRefundableMinor: number;
      /** A6: shown as its OWN line on the artist-facing refund result, never
       *  folded into `refundedMinor`. */
      retainedProcessorCostMinor: number;
    }
  | { ok: false; error: string };

export async function refundGoodsOrderAction(input: {
  orderId: string;
  refundType: "full" | "partial" | "by_line";
  amountMinor?: number;
  lines?: { orderItemId: string; quantity?: number }[];
  case: string;
}): Promise<GoodsRefundActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (!isArtistInitiatedFeeRefundCase(input.case)) {
    return { ok: false, error: "That refund reason isn't available." };
  }

  const result = await refundGoodsOrderCore({
    artistId: user.id,
    orderId: input.orderId,
    refundType: input.refundType,
    amountMinor: input.amountMinor,
    lines: input.lines,
    case: input.case,
  });
  if (result.status === "error") return { ok: false, error: result.message };

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${input.orderId}`);
  return {
    ok: true,
    refundedMinor: result.refundedMinor,
    remainingRefundableMinor: result.remainingRefundableMinor,
    retainedProcessorCostMinor: result.retainedProcessorCostMinor,
  };
}
