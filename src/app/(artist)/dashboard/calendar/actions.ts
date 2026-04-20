"use server";

import { createClient } from "@/lib/supabase/server";
import { sendBookingEmail } from "@/lib/email/send-booking-email";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

type ActionResult = { error: string } | { success: true };

export async function createAppointmentAction(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const handle = (formData.get("customer_handle") as string)
    .replace(/^@/, "")
    .trim();
  const date = formData.get("preferred_date") as string;
  const placement = (formData.get("placement") as string).trim();
  const size = formData.get("size") as string;
  const description =
    (formData.get("description") as string | null)?.trim() ?? "";
  const email =
    (formData.get("customer_email") as string | null)?.trim() || null;
  const sendEmail = formData.get("send_email") === "on";

  if (!handle) return { error: "instagram handle is required" };
  if (!date) return { error: "date is required" };
  if (!placement) return { error: "placement is required" };
  if (!size) return { error: "size is required" };

  const bookingId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const { error } = await supabase.from("booking_requests").insert({
    id: bookingId,
    artist_id: user.id,
    status: "approved",
    origin: "artist_created",
    customer_handle: handle,
    customer_email: email || null,
    customer_token_hash: email ? tokenHash : null,
    preferred_date: date,
    form_data: { placement, size, description },
  });

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    booking_id: bookingId,
    action: "booking_created",
    actor: user.id,
    details: { origin: "artist_created" },
  });

  if (email && sendEmail) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, slug")
      .eq("id", user.id)
      .single();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
    await sendBookingEmail({
      type: "customer_booking_approved",
      to: email,
      artistId: user.id,
      vars: {
        customer_handle: handle,
        artist_name: profile?.display_name ?? "",
        artist_slug: profile?.slug ?? "",
        placement,
        size,
        date,
        magic_link: `${appUrl}/request/${token}`,
      },
    });
  }

  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
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
  if (!user) return { error: "not authenticated" };

  const { data: booking } = await supabase
    .from("booking_requests")
    .select("artist_id, form_data, customer_email")
    .eq("id", id)
    .single();

  if (!booking || booking.artist_id !== user.id) return { error: "not found" };

  const fd = booking.form_data as Record<string, string> | null;
  const handle = (formData.get("customer_handle") as string)
    .replace(/^@/, "")
    .trim();
  const date = formData.get("preferred_date") as string;
  const placement = (formData.get("placement") as string).trim();
  const size = formData.get("size") as string;
  const description =
    (formData.get("description") as string | null)?.trim() ?? "";
  const email =
    (formData.get("customer_email") as string | null)?.trim() || null;

  const { error } = await supabase
    .from("booking_requests")
    .update({
      customer_handle: handle,
      customer_email: email || null,
      preferred_date: date,
      form_data: { ...fd, placement, size, description },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "booking_edited",
    actor: user.id,
    details: { by: "artist" },
  });

  // No dedicated "artist edited" template — skip email on artist edit

  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/requests/${id}`);
  return { success: true };
}

export async function cancelAppointmentAction(
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { data: booking } = await supabase
    .from("booking_requests")
    .select("artist_id, customer_email, slot_id")
    .eq("id", id)
    .single();

  if (!booking || booking.artist_id !== user.id) return { error: "not found" };

  const { error } = await supabase
    .from("booking_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: "approved", to: "cancelled", by: "artist" },
  });

  if (booking.customer_email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, slug")
      .eq("id", user.id)
      .single();
    const { data: cancelledBooking } = await supabase
      .from("booking_requests")
      .select("customer_handle, preferred_date, form_data")
      .eq("id", id)
      .single();
    const fd = cancelledBooking?.form_data as Record<string, string> | null;
    await sendBookingEmail({
      type: "customer_booking_cancelled_by_artist",
      to: booking.customer_email,
      artistId: user.id,
      vars: {
        customer_handle: cancelledBooking?.customer_handle ?? "",
        artist_name: profile?.display_name ?? "",
        artist_slug: profile?.slug ?? "",
        placement: fd?.placement ?? "",
        date: cancelledBooking?.preferred_date ?? "",
      },
    });
  }

  // Slot: return to open on artist cancel
  if (booking.slot_id) {
    await supabase
      .from("slots")
      .update({ status: "open" })
      .eq("id", booking.slot_id);
  }

  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  return { success: true };
}
