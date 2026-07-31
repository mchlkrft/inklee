"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  sendPaymentRequestCore,
  cancelPaymentRequestCore,
} from "@/lib/server/appointment-payments";

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
