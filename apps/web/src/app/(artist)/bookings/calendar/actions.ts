"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateBookingViews } from "@/lib/revalidate-bookings";
import {
  cancelBookingCore,
  editAppointmentCore,
  createAppointmentCore,
} from "@/lib/server/bookings";

type ActionResult = { error: string } | { success: true };

export async function createAppointmentAction(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Delegate to the shared core (the SAME path the mobile POST calls) so the
  // magic-link token + inserted row + approval email live in one place.
  const result = await createAppointmentCore(supabase, user.id, {
    handle: (formData.get("customer_handle") as string | null) ?? "",
    email: (formData.get("customer_email") as string | null)?.trim() || null,
    date: (formData.get("preferred_date") as string | null) ?? "",
    placement: (formData.get("placement") as string | null) ?? "",
    size: (formData.get("size") as string | null) ?? "",
    description: (formData.get("description") as string | null) ?? "",
    sendEmail: formData.get("send_email") === "on",
  });
  if ("error" in result) return result;

  revalidateBookingViews(result.id);
  return { success: true };
}

export async function editAppointmentAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Delegate to the shared core (the SAME path the mobile PATCH calls) so the
  // approved-only status gate + required-field validation live in one place.
  const result = await editAppointmentCore(supabase, user.id, id, {
    handle: (formData.get("customer_handle") as string | null) ?? "",
    email: (formData.get("customer_email") as string | null)?.trim() || null,
    date: (formData.get("preferred_date") as string | null) ?? "",
    placement: (formData.get("placement") as string | null) ?? "",
    size: (formData.get("size") as string | null) ?? "",
    description: (formData.get("description") as string | null) ?? "",
  });
  if ("success" in result) revalidateBookingViews(id);
  return result;
}

export async function cancelAppointmentAction(
  id: string,
): Promise<ActionResult> {
  // Delegate to the shared mutation core so the calendar cancel behaves exactly
  // like the booking-detail and mobile cancel paths: it enforces the FSM guard,
  // refunds a paid card deposit BEFORE cancelling (and cancels a live unpaid
  // intent), releases the slot with rollback, and emails the client. The
  // previous bespoke implementation did none of that — it cancelled
  // deposit-paid bookings with no refund and hardcoded from:"approved".
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const result = await cancelBookingCore(supabase, user.id, id);
  if ("success" in result) revalidateBookingViews(id);
  return result;
}
