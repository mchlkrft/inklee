"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { bookingSchema } from "@/lib/booking-schema";
import {
  sendArtistCancellationByCustomer,
  sendBookingEmail,
} from "@/lib/email/send-booking-email";
import crypto from "crypto";
import { redirect } from "next/navigation";
import { createNotification } from "@/lib/notifications";
import { checkPortalRateLimit } from "@/lib/ratelimit";
import { canTransition } from "@/lib/booking-fsm";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

type State = { error: string; field?: string } | null;

export async function editCustomerBookingAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const token = formData.get("_token") as string;
  if (!token) return { error: "invalid link" };

  const tokenHash = hashToken(token);
  // anon client: RLS allows SELECT on rows with a non-null customer_token_hash
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("booking_requests")
    .select(
      "id, status, created_at, form_data, customer_email, preferred_date, artist_id",
    )
    .eq("customer_token_hash", tokenHash)
    .single();

  if (!booking) return { error: "this link is no longer valid" };

  const expired =
    Date.now() - new Date(booking.created_at).getTime() >
    30 * 24 * 60 * 60 * 1000;
  if (expired) return { error: "this link has expired" };

  if (booking.status !== "pending") {
    return { error: "this request can no longer be edited" };
  }

  const raw = {
    instagram_handle: formData.get("instagram_handle"),
    email: formData.get("email"),
    reference_link: formData.get("reference_link"),
    placement: formData.get("placement"),
    size: formData.get("size"),
    description: formData.get("description"),
    preferred_date: formData.get("preferred_date"),
    website: formData.get("website"),
  };

  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first.message, field: first.path[0] as string };
  }

  const data = parsed.data;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(data.preferred_date) <= today) {
    return {
      error: "preferred date must be a future date",
      field: "preferred_date",
    };
  }

  const newToken = crypto.randomBytes(32).toString("hex");
  const newHash = hashToken(newToken);
  const fd = booking.form_data as Record<string, string> | null;

  // anon client: RLS allows UPDATE on rows with a non-null customer_token_hash
  const { error: updateError } = await supabase
    .from("booking_requests")
    .update({
      customer_handle: data.instagram_handle,
      customer_email: data.email,
      preferred_date: data.preferred_date,
      customer_token_hash: newHash,
      form_data: {
        ...fd,
        placement: data.placement,
        size: data.size,
        description: data.description,
        reference_link: data.reference_link || null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", booking.id);

  if (updateError) return { error: "something went wrong — try again" };

  // service client: anon cannot INSERT into audit_log (no anon INSERT policy by design)
  await serviceClient.from("audit_log").insert({
    booking_id: booking.id,
    action: "token_rotated",
    details: { old_hash: tokenHash, new_hash: newHash, by: "customer" },
  });
  await serviceClient.from("audit_log").insert({
    booking_id: booking.id,
    action: "customer_edited",
    details: { by: "customer" },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const { data: artistProfile } = await serviceClient
    .from("profiles")
    .select("display_name, slug")
    .eq("id", booking.artist_id)
    .single();
  await sendBookingEmail({
    type: "customer_booking_submitted",
    to: data.email,
    artistId: booking.artist_id,
    vars: {
      customer_handle: data.instagram_handle,
      artist_name: artistProfile?.display_name ?? "",
      artist_slug: artistProfile?.slug ?? "",
      placement: data.placement,
      size: data.size,
      date: data.preferred_date,
      magic_link: `${appUrl}/request/${newToken}`,
    },
  });

  redirect(`/request/submitted?id=${booking.id}&edited=1`);
}

export async function cancelCustomerBookingAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const token = formData.get("_token") as string;
  if (!token) return { error: "invalid link" };

  const tokenHash = hashToken(token);

  const { allowed } = await checkPortalRateLimit(tokenHash);
  if (!allowed) return { error: "too many requests — please try again later" };
  // anon client: RLS allows SELECT on rows with a non-null customer_token_hash
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("booking_requests")
    .select("id, status, created_at, customer_email, artist_id, slot_id")
    .eq("customer_token_hash", tokenHash)
    .single();

  if (!booking) return { error: "this link is no longer valid" };

  const expired =
    Date.now() - new Date(booking.created_at).getTime() >
    30 * 24 * 60 * 60 * 1000;
  if (expired) return { error: "this link has expired" };

  const guard = canTransition(booking.status, "cancelled");
  if (!guard.ok) return { error: guard.reason };

  // anon client: RLS allows UPDATE on rows with a non-null customer_token_hash
  const { error: updateError } = await supabase
    .from("booking_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", booking.id);

  if (updateError) return { error: "something went wrong — try again" };

  // Slot: return to open on customer cancel (use service client — anon can't update slots directly)
  if (booking.slot_id) {
    await serviceClient
      .from("slots")
      .update({ status: "open" })
      .eq("id", booking.slot_id);
  }

  // service client: only for audit_log — anon INSERT is intentionally blocked
  await serviceClient.from("audit_log").insert({
    booking_id: booking.id,
    action: "customer_cancelled",
    details: { from: booking.status, to: "cancelled", by: "customer" },
  });

  // Notify artist via email
  const { data: artistAuth } = await serviceClient.auth.admin.getUserById(
    booking.artist_id,
  );
  if (artistAuth?.user?.email) {
    const { data: cancelledBooking } = await serviceClient
      .from("booking_requests")
      .select("customer_handle, preferred_date, form_data")
      .eq("id", booking.id)
      .single();
    const fd = cancelledBooking?.form_data as Record<string, string> | null;
    await sendArtistCancellationByCustomer({
      artistEmail: artistAuth.user.email,
      customerHandle: cancelledBooking?.customer_handle ?? "unknown",
      placement: fd?.placement ?? "",
      date: cancelledBooking?.preferred_date ?? "",
    });
  }

  // Notify artist of customer cancellation
  const { data: cancelledBooking } = await serviceClient
    .from("booking_requests")
    .select("customer_handle, preferred_date, form_data")
    .eq("id", booking.id)
    .single();
  const fd2 = cancelledBooking?.form_data as Record<string, string> | null;
  void createNotification({
    artistId: booking.artist_id,
    type: "booking_cancelled_by_client",
    category: "client_update",
    priority: "high",
    title: "Booking cancelled by client",
    message: `@${cancelledBooking?.customer_handle ?? "client"} cancelled their ${fd2?.placement ?? "booking"}${cancelledBooking?.preferred_date ? ` on ${cancelledBooking.preferred_date}` : ""}.`,
    ctaLabel: "View request",
    ctaHref: `/bookings/requests/${booking.id}`,
    metadata: { booking_id: booking.id },
  });

  redirect(`/request/submitted?id=${booking.id}&cancelled=1`);
}
