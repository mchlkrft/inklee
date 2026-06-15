"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  approveBookingCore,
  rejectBookingCore,
  markDepositReceivedCore,
} from "@/lib/server/bookings";

// Inline quick actions for the dashboard "Action required" feed. Each wraps the
// SAME booking core the detail screen + mobile routes use (one source of truth)
// and revalidates the dashboard so the acted row drops out on the next render.
type ActionResult = { error: string } | { success: true };

export async function acceptRequestAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  // Plain approve (no goods-interest decisions); the detail Accept popup handles
  // the rare booking that carries pending interests.
  const result = await approveBookingCore(supabase, user.id, id);
  revalidatePath("/dashboard");
  return result;
}

export async function passRequestAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const result = await rejectBookingCore(supabase, user.id, id);
  revalidatePath("/dashboard");
  return result;
}

export async function markDepositReceivedAction(
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const result = await markDepositReceivedCore(supabase, user.id, id);
  revalidatePath("/dashboard");
  return result;
}
