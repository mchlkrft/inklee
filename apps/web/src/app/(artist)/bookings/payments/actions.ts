"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createPaymentRequestCore,
  sendPaymentRequestCore,
  cancelPaymentRequestCore,
  type PaymentSubjectInput,
  type PaymentLineInput,
} from "@/lib/server/appointment-payments";
import { refundPaymentRequestCore } from "@/lib/server/appointment-payment-refund";
import { isArtistInitiatedFeeRefundCase } from "@inklee/shared/fee-refund-policy";

// Web server actions for the artist payment-requests surface. Thin wrappers over
// the SAME cores the mobile routes call (one implementation, two surfaces), with
// the cookie (RLS-scoped) client and a revalidate. Argument-free operations only
// here (send, cancel); create/revise/refund come with their forms in a later
// slice. Send stays gated inside the core; cancel is deliberately UNGATED so a
// lapsed-to-Free artist can still stop a live request for money.

export type PaymentActionResult = { ok: true } | { ok: false; error: string };

const LIST_PATH = "/bookings/payments";

async function currentArtistId(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; id: string }
  | { ok: false }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  return { ok: true, supabase, id: user.id };
}

/** Freeze a draft and make it payable. */
export async function sendPaymentRequestAction(
  id: string,
): Promise<PaymentActionResult> {
  const auth = await currentArtistId();
  if (!auth.ok) return { ok: false, error: "Not signed in." };
  const result = await sendPaymentRequestCore(auth.supabase, auth.id, id, {});
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(LIST_PATH);
  return { ok: true };
}

/** Withdraw a payment request. Ungated on purpose (stop a request for money). */
export async function cancelPaymentRequestAction(
  id: string,
): Promise<PaymentActionResult> {
  const auth = await currentArtistId();
  if (!auth.ok) return { ok: false, error: "Not signed in." };
  const result = await cancelPaymentRequestCore(auth.supabase, auth.id, id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(LIST_PATH);
  return { ok: true };
}

export type CreatePaymentRequestInput = {
  subject: PaymentSubjectInput;
  collects: string;
  currency?: string;
  lines: PaymentLineInput[];
};

export type CreatePaymentRequestResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Create a DRAFT payment request. The core validates the subject ownership
 *  (composite FK), the collects value, the lines, and the entitlement (returns a
 *  plan-specific message the form surfaces). Nothing is sent here: the artist
 *  reviews the draft, then uses Send. */
export async function createPaymentRequestAction(
  input: CreatePaymentRequestInput,
): Promise<CreatePaymentRequestResult> {
  const auth = await currentArtistId();
  if (!auth.ok) return { ok: false, error: "Not signed in." };
  const result = await createPaymentRequestCore(auth.supabase, auth.id, {
    subject: input.subject,
    collects: input.collects,
    currency: input.currency,
    lines: input.lines,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(LIST_PATH);
  return { ok: true, id: result.id };
}

/** Refund a paid request. The fee-refund CASE decides Inklee's fee treatment, so
 *  an artist may only assert the artist-initiated subset (voluntary / cancellation);
 *  the route-level allowlist mirrors the mobile refund route. The core (with the
 *  M5/M11 fixes) computes amounts + fee handling from stored transaction state. */
export async function refundPaymentRequestAction(input: {
  id: string;
  refundType: "full" | "partial" | "by_line";
  case: string;
  amountMinor?: number;
  lineIds?: string[];
}): Promise<PaymentActionResult> {
  const auth = await currentArtistId();
  if (!auth.ok) return { ok: false, error: "Not signed in." };
  if (!isArtistInitiatedFeeRefundCase(input.case)) {
    return { ok: false, error: "That refund reason isn't available." };
  }
  const result = await refundPaymentRequestCore({
    artistId: auth.id,
    requestId: input.id,
    refundType: input.refundType,
    amountMinor: input.amountMinor,
    lineIds: input.lineIds,
    case: input.case,
  });
  if (result.status === "error") return { ok: false, error: result.message };
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${input.id}`);
  return { ok: true };
}
