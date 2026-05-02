"use server";

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
import { portalEditSupport } from "@/lib/booking-domain";
import { isDateKeyOnOrBefore, todayInTimeZone } from "@/lib/date-utils";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isExpired(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > 30 * 24 * 60 * 60 * 1000;
}

type State = { error: string; field?: string } | null;

export async function editCustomerBookingAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const token = formData.get("_token") as string;
  if (!token) return { error: "invalid link" };

  const tokenHash = hashToken(token);
  const { allowed } = await checkPortalRateLimit(tokenHash);
  if (!allowed) return { error: "too many requests — please try again later" };

  const { data: booking } = await serviceClient
    .from("booking_requests")
    .select(
      "id, status, created_at, form_data, customer_email, preferred_date, artist_id, slot_id, trip_id, flash_item_id, customer_handle",
    )
    .eq("customer_token_hash", tokenHash)
    .single();

  if (!booking) return { error: "this link is no longer valid" };
  if (isExpired(booking.created_at)) return { error: "this link has expired" };

  const support = portalEditSupport({
    status: booking.status,
    customerEmail: booking.customer_email,
    preferredDate: booking.preferred_date,
    customerHandle: booking.customer_handle,
    slotId: booking.slot_id,
    tripId: booking.trip_id,
    flashItemId: booking.flash_item_id,
    formData: booking.form_data as Record<string, unknown> | null,
  });
  if (!support.editable) {
    return { error: support.reason };
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

  const { data: artistProfile } = await serviceClient
    .from("profiles")
    .select("display_name, slug, timezone")
    .eq("id", booking.artist_id)
    .single();

  const artistTimeZone = artistProfile?.timezone ?? "Europe/Berlin";
  if (
    isDateKeyOnOrBefore(data.preferred_date, todayInTimeZone(artistTimeZone))
  ) {
    return {
      error: "preferred date must be a future date",
      field: "preferred_date",
    };
  }

  const newToken = crypto.randomBytes(32).toString("hex");
  const newHash = hashToken(newToken);
  const fd = (booking.form_data ?? {}) as Record<string, string>;

  const { error: updateError } = await serviceClient
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
    .eq("id", booking.id)
    .eq("customer_token_hash", tokenHash);

  if (updateError) return { error: "something went wrong — try again" };

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

  redirect(`/request/submitted?id=${booking.id}&edited=1&email=1`);
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

  const { data: booking } = await serviceClient
    .from("booking_requests")
    .select(
      "id, status, created_at, customer_email, artist_id, slot_id, customer_handle, preferred_date, form_data",
    )
    .eq("customer_token_hash", tokenHash)
    .single();

  if (!booking) return { error: "this link is no longer valid" };
  if (isExpired(booking.created_at)) return { error: "this link has expired" };

  const guard = canTransition(booking.status, "cancelled");
  if (!guard.ok) return { error: guard.reason };

  const cancelledAt = new Date().toISOString();
  const { error: updateError } = await serviceClient
    .from("booking_requests")
    .update({ status: "cancelled", updated_at: cancelledAt })
    .eq("id", booking.id)
    .eq("customer_token_hash", tokenHash);

  if (updateError) return { error: "something went wrong — try again" };

  if (booking.slot_id) {
    const { error: slotError } = await serviceClient
      .from("slots")
      .update({ status: "open" })
      .eq("id", booking.slot_id);

    if (slotError) {
      await serviceClient
        .from("booking_requests")
        .update({
          status: booking.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);
      return { error: "the slot could not be released — please try again" };
    }
  }

  await serviceClient.from("audit_log").insert({
    booking_id: booking.id,
    action: "customer_cancelled",
    details: { from: booking.status, to: "cancelled", by: "customer" },
  });

  const { data: artistAuth } = await serviceClient.auth.admin.getUserById(
    booking.artist_id,
  );
  if (artistAuth?.user?.email) {
    const fd = booking.form_data as Record<string, string> | null;
    await sendArtistCancellationByCustomer({
      artistEmail: artistAuth.user.email,
      customerHandle: booking.customer_handle ?? "unknown",
      placement: fd?.placement ?? "",
      date: booking.preferred_date ?? "",
    });
  }

  const fd = booking.form_data as Record<string, string> | null;
  const notificationResult = await createNotification({
    artistId: booking.artist_id,
    type: "booking_cancelled_by_client",
    category: "client_update",
    priority: "high",
    title: "Booking cancelled by client",
    message: `@${booking.customer_handle ?? "client"} cancelled their ${fd?.placement ?? "booking"}${booking.preferred_date ? ` on ${booking.preferred_date}` : ""}.`,
    ctaLabel: "View request",
    ctaHref: `/bookings/requests/${booking.id}`,
    metadata: { booking_id: booking.id },
  });
  if (!notificationResult.ok) {
    console.error("[customer-cancel] notification failed", {
      artistId: booking.artist_id,
      bookingId: booking.id,
      error: notificationResult.error,
    });
  }

  redirect(
    `/request/submitted?id=${booking.id}&cancelled=1&email=${booking.customer_email ? "1" : "0"}`,
  );
}
