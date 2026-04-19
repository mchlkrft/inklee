"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type ActionResult = { error: string } | { success: true };
type AuthorisedBookingResult =
  | { error: string }
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: User;
      booking: { status: string; artist_id: string };
    };

async function getAuthorisedBooking(
  bookingId: string,
): Promise<AuthorisedBookingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "not authenticated" };
  }

  const { data: booking } = await supabase
    .from("booking_requests")
    .select("status, artist_id")
    .eq("id", bookingId)
    .single();

  if (!booking) {
    return { error: "booking not found" };
  }

  if (booking.artist_id !== user.id) {
    return { error: "not authorised" };
  }

  return {
    supabase,
    user,
    booking: {
      status: String(booking.status),
      artist_id: String(booking.artist_id),
    },
  };
}

export async function approveBooking(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) {
    return authorised;
  }

  const { supabase, user, booking } = authorised;
  const decidedAt = new Date().toISOString();
  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: "approved",
      updated_at: decidedAt,
      decided_at: decidedAt,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to: "approved" },
  });

  console.log(`[email] status changed to approved for booking ${id}`);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/requests/${id}`);

  return { success: true };
}

export async function rejectBooking(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) {
    return authorised;
  }

  const { supabase, user, booking } = authorised;
  const decidedAt = new Date().toISOString();
  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: "rejected",
      updated_at: decidedAt,
      decided_at: decidedAt,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to: "rejected" },
  });

  console.log(`[email] status changed to rejected for booking ${id}`);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/requests/${id}`);

  return { success: true };
}

export async function markDepositPending(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) {
    return authorised;
  }

  const { supabase, user, booking } = authorised;
  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: "deposit_pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to: "deposit_pending" },
  });

  console.log(`[email] status changed to deposit_pending for booking ${id}`);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/requests/${id}`);

  return { success: true };
}
