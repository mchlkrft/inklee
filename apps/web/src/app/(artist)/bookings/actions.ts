"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { revalidateBookingViews } from "@/lib/revalidate-bookings";
import { convertWaitlistEntryCore } from "@/lib/server/waitlist";
import {
  approveBookingCore,
  approveBookingWithInterestDecisionsCore,
  applyInterestDecisionsCore,
  rejectBookingCore,
  requestDepositCore,
  markDepositReceivedCore,
  refundDepositCore,
  cancelBookingCore,
  type InterestDecisionPayload,
} from "@/lib/server/bookings";

// Re-export so existing component imports (`import { ..., type
// InterestDecisionPayload } from "../actions"`) keep working after the
// money-path logic moved to @/lib/server/bookings.
export type { InterestDecisionPayload };

type ActionResult = { error: string } | { success: true };

// All money-path / status-change actions are thin wrappers: resolve the
// cookie-session artist, delegate to the shared core in @/lib/server/bookings
// (the SAME implementation the mobile API calls), then revalidate the web cache
// on success. Keep the business logic in the core — not here — so web and mobile
// never diverge.
async function cookieUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function approveBooking(id: string): Promise<ActionResult> {
  const { supabase, user } = await cookieUser();
  if (!user) return { error: "Not authenticated." };
  const result = await approveBookingCore(supabase, user.id, id);
  if ("success" in result) revalidateBookingViews(id);
  return result;
}

export async function approveBookingWithInterestDecisions(
  id: string,
  decisions: InterestDecisionPayload[],
): Promise<ActionResult> {
  const { supabase, user } = await cookieUser();
  if (!user) return { error: "Not authenticated." };
  const result = await approveBookingWithInterestDecisionsCore(
    supabase,
    user.id,
    id,
    decisions,
  );
  if ("success" in result) revalidateBookingViews(id);
  return result;
}

export async function applyInterestDecisions(
  id: string,
  decisions: InterestDecisionPayload[],
): Promise<ActionResult> {
  const { supabase, user } = await cookieUser();
  if (!user) return { error: "Not authenticated." };
  const result = await applyInterestDecisionsCore(
    supabase,
    user.id,
    id,
    decisions,
  );
  if ("success" in result) revalidateBookingViews(id);
  return result;
}

export async function rejectBooking(id: string): Promise<ActionResult> {
  const { supabase, user } = await cookieUser();
  if (!user) return { error: "Not authenticated." };
  const result = await rejectBookingCore(supabase, user.id, id);
  if ("success" in result) revalidateBookingViews(id);
  return result;
}

export async function requestDeposit(
  id: string,
  amount: number,
  dueAt: string,
  note: string | null,
): Promise<ActionResult> {
  const { supabase, user } = await cookieUser();
  if (!user) return { error: "Not authenticated." };
  const result = await requestDepositCore(
    supabase,
    user.id,
    id,
    amount,
    dueAt,
    note,
  );
  if ("success" in result) revalidateBookingViews(id);
  return result;
}

export async function markDepositReceived(id: string): Promise<ActionResult> {
  const { supabase, user } = await cookieUser();
  if (!user) return { error: "Not authenticated." };
  const result = await markDepositReceivedCore(supabase, user.id, id);
  if ("success" in result) revalidateBookingViews(id);
  return result;
}

export async function refundDeposit(id: string): Promise<ActionResult> {
  const { supabase, user } = await cookieUser();
  if (!user) return { error: "Not authenticated." };
  const result = await refundDepositCore(supabase, user.id, id);
  if ("success" in result) revalidateBookingViews(id);
  return result;
}

export async function cancelBooking(id: string): Promise<ActionResult> {
  const { supabase, user } = await cookieUser();
  if (!user) return { error: "Not authenticated." };
  const result = await cancelBookingCore(supabase, user.id, id);
  if ("success" in result) revalidateBookingViews(id);
  return result;
}

export async function markWaitlistContacted(
  entryId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("waitlist_entries")
    .update({ status: "contacted" })
    .eq("id", entryId)
    .eq("artist_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/bookings/overview");
  return { success: true };
}

// Slice 75 — mark a paid order's goods as collected at the appointment.
export async function markGoodsPickedUp(
  orderId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: order } = await supabase
    .from("orders")
    .select("id, booking_id, status")
    .eq("id", orderId)
    .eq("artist_id", user.id)
    .single();
  if (!order) return { error: "Order not found." };
  if (order.status !== "paid") {
    return { error: "Only paid orders can be marked picked up." };
  }

  const { error } = await supabase
    .from("orders")
    .update({
      fulfillment_status: "picked_up",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("artist_id", user.id);
  if (error) return { error: error.message };

  revalidatePath(`/bookings/requests/${order.booking_id}`);
  return { success: true };
}

export async function dismissWaitlistEntry(
  entryId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("waitlist_entries")
    .update({ status: "dismissed" })
    .eq("id", entryId)
    .eq("artist_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/bookings/overview");
  return { success: true };
}

export async function convertWaitlistEntry({
  entryId,
}: {
  entryId: string;
  // Accepted for backward-compat with the existing caller but unused: the shared
  // core reads the entry from the DB and never trusts client-passed values, so
  // the guards (already-converted, missing-email, concurrent-convert claim)
  // can't be bypassed. See convertWaitlistEntryCore.
  customerEmail?: string;
  customerHandle?: string;
  note?: string;
}): Promise<ActionResult> {
  const { supabase, user } = await cookieUser();
  if (!user) return { error: "Not authenticated." };

  const result = await convertWaitlistEntryCore(supabase, user.id, entryId);
  if (!result.ok) return { error: result.error };

  revalidateBookingViews();
  return { success: true };
}
