"use server";

import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { sendBookingEmail } from "@/lib/email/send-booking-email";
import { revalidateBookingViews } from "@/lib/revalidate-bookings";
import { cancelBookingCore, editAppointmentCore } from "@/lib/server/bookings";

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
