"use server";

import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { sendBookingEmail } from "@/lib/email/send-booking-email";
import { revalidateBookingViews } from "@/lib/revalidate-bookings";

type ActionResult = { error: string } | { success: true };

export async function createAppointmentAction(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

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

  if (!handle) return { error: "Instagram handle is required." };
  if (!date) return { error: "Date is required." };
  if (!placement) return { error: "Placement is required." };
  if (!size) return { error: "Size is required." };

  const bookingId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const decidedAt = new Date().toISOString();

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
    decided_at: decidedAt,
    updated_at: decidedAt,
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

  revalidateBookingViews(bookingId);
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

  const { data: booking } = await supabase
    .from("booking_requests")
    .select("artist_id, form_data, customer_email")
    .eq("id", id)
    .single();

  if (!booking || booking.artist_id !== user.id) return { error: "Not found." };

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

  revalidateBookingViews(id);
  return { success: true };
}

export async function cancelAppointmentAction(
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: booking } = await supabase
    .from("booking_requests")
    .select("artist_id, customer_email, slot_id")
    .eq("id", id)
    .single();

  if (!booking || booking.artist_id !== user.id) return { error: "Not found." };

  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("booking_requests")
    .update({ status: "cancelled", updated_at: updatedAt })
    .eq("id", id);

  if (error) return { error: error.message };

  if (booking.slot_id) {
    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "open" })
      .eq("id", booking.slot_id);

    if (slotError) {
      await supabase
        .from("booking_requests")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", id);
      return { error: "The slot could not be released. Please try again." };
    }
  }

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

  revalidateBookingViews(id);
  return { success: true };
}
