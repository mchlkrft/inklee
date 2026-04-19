"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { error: string } | { success: true };

async function transitionStatus(
  bookingId: string,
  to: "approved" | "rejected" | "deposit_pending",
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { data: booking } = await supabase
    .from("booking_requests")
    .select("status, artist_id")
    .eq("id", bookingId)
    .single();

  if (!booking) return { error: "booking not found" };
  if (booking.artist_id !== user.id) return { error: "not authorised" };

  const decidedNow = ["approved", "rejected"].includes(to);

  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: to,
      updated_at: new Date().toISOString(),
      ...(decidedNow ? { decided_at: new Date().toISOString() } : {}),
    })
    .eq("id", bookingId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    booking_id: bookingId,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to },
  });

  // Placeholder — real email send in slice 6
  console.log(`[email] status changed to ${to} for booking ${bookingId}`);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/requests/${bookingId}`);
  return { success: true };
}

export const approveBooking = (id: string) => transitionStatus(id, "approved");
export const rejectBooking = (id: string) => transitionStatus(id, "rejected");
export const markDepositPending = (id: string) =>
  transitionStatus(id, "deposit_pending");
