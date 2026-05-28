"use server";

import crypto from "crypto";
import type { User } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canTransition } from "@/lib/booking-fsm";
import {
  sendBookingEmail,
  sendWaitlistConversionEmail,
} from "@/lib/email/send-booking-email";
import { stripe } from "@/lib/stripe";

type ActionResult = { error: string } | { success: true };

type AuthorisedBooking = {
  status: string;
  artist_id: string;
  customer_email: string | null;
  customer_handle: string | null;
  preferred_date: string | null;
  slot_id: string | null;
  customer_token_hash: string | null;
  decided_at: string | null;
  form_data: Record<string, string> | null;
};

type AuthorisedBookingResult =
  | { error: string }
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: User;
      booking: AuthorisedBooking;
    };

async function getAuthorisedBooking(
  bookingId: string,
): Promise<AuthorisedBookingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  const { data: booking } = await supabase
    .from("booking_requests")
    .select(
      "status, artist_id, customer_email, customer_handle, preferred_date, slot_id, customer_token_hash, decided_at, form_data",
    )
    .eq("id", bookingId)
    .single();

  if (!booking) return { error: "Booking not found." };
  if (booking.artist_id !== user.id) return { error: "Not authorised." };

  return {
    supabase,
    user,
    booking: {
      status: String(booking.status),
      artist_id: String(booking.artist_id),
      customer_email: booking.customer_email,
      customer_handle: booking.customer_handle,
      preferred_date: booking.preferred_date,
      slot_id: booking.slot_id,
      customer_token_hash: booking.customer_token_hash,
      decided_at: booking.decided_at,
      form_data: booking.form_data as Record<string, string> | null,
    },
  };
}

async function restoreBookingAfterSlotFailure(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  booking: AuthorisedBooking,
  extra: Partial<Pick<AuthorisedBooking, "customer_token_hash">> & {
    deposit_paid_at?: string | null;
  } = {},
): Promise<void> {
  await supabase
    .from("booking_requests")
    .update({
      status: booking.status,
      updated_at: new Date().toISOString(),
      decided_at: booking.decided_at,
      customer_token_hash:
        extra.customer_token_hash ?? booking.customer_token_hash,
      ...(extra.deposit_paid_at !== undefined
        ? { deposit_paid_at: extra.deposit_paid_at }
        : {}),
    })
    .eq("id", bookingId);
}

export async function approveBooking(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user, booking } = authorised;
  const guard = canTransition(booking.status, "approved");
  if (!guard.ok) return { error: guard.reason };

  const newToken = booking.customer_email
    ? crypto.randomBytes(32).toString("hex")
    : null;
  const newHash = newToken
    ? crypto.createHash("sha256").update(newToken).digest("hex")
    : null;
  const decidedAt = new Date().toISOString();

  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: "approved",
      updated_at: decidedAt,
      decided_at: decidedAt,
      customer_token_hash: newHash,
    })
    .eq("id", id);

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (booking.slot_id) {
    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "booked" })
      .eq("id", booking.slot_id);

    if (slotError) {
      await restoreBookingAfterSlotFailure(supabase, id, booking);
      return { error: "The slot could not be confirmed. Please try again." };
    }
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to: "approved" },
  });

  if (booking.customer_email && newToken) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
    await sendBookingEmail({
      type: "customer_booking_approved",
      to: booking.customer_email,
      artistId: user.id,
      vars: {
        customer_handle: booking.customer_handle ?? "",
        artist_name: profile?.display_name ?? "",
        placement: booking.form_data?.placement ?? "",
        size: booking.form_data?.size ?? "",
        date: booking.preferred_date ?? "",
        magic_link: `${appUrl}/request/${newToken}`,
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/bookings/requests");
  revalidatePath(`/bookings/requests/${id}`);
  return { success: true };
}

export async function rejectBooking(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user, booking } = authorised;
  const guard = canTransition(booking.status, "rejected");
  if (!guard.ok) return { error: guard.reason };

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
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (booking.slot_id) {
    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "open" })
      .eq("id", booking.slot_id);

    if (slotError) {
      await restoreBookingAfterSlotFailure(supabase, id, booking);
      return { error: "The slot could not be released. Please try again." };
    }
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to: "rejected" },
  });

  if (booking.customer_email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    await sendBookingEmail({
      type: "customer_booking_rejected",
      to: booking.customer_email,
      artistId: user.id,
      vars: {
        customer_handle: booking.customer_handle ?? "",
        artist_name: profile?.display_name ?? "",
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/bookings/requests");
  revalidatePath(`/bookings/requests/${id}`);
  return { success: true };
}

export async function requestDeposit(
  id: string,
  amount: number,
  dueAt: string,
  note: string | null,
): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user, booking } = authorised;
  const guard = canTransition(booking.status, "deposit_pending");
  if (!guard.ok) return { error: guard.reason };

  const decidedAt = new Date().toISOString();
  const { data: fresh } = await supabase
    .from("booking_requests")
    .select("deposit_payment_intent_id, deposit_client_secret")
    .eq("id", id)
    .single();

  if (fresh?.deposit_payment_intent_id && fresh?.deposit_client_secret) {
    const { error: reuseError } = await supabase
      .from("booking_requests")
      .update({
        deposit_amount: amount,
        deposit_due_at: dueAt,
        deposit_note: note || null,
        status: "deposit_pending",
        decided_at: decidedAt,
        updated_at: decidedAt,
      })
      .eq("id", id);
    if (reuseError) return { error: reuseError.message };

    revalidatePath(`/bookings/requests/${id}`);
    return { success: true };
  }

  let paymentIntentId: string | null = null;
  let clientSecret: string | null = null;
  if (stripe && amount > 0) {
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: Math.round(amount * 100),
          currency: "eur",
          // Omit payment_method_types; this keeps dynamic payment methods on
          // explicitly + version-independently (Stripe best practice).
          automatic_payment_methods: { enabled: true },
          metadata: { booking_id: id, artist_id: user.id },
          description: `Tattoo deposit - booking ${id}`,
        },
        // One intent per booking even under rapid re-submits / retries.
        { idempotencyKey: `deposit-intent-${id}` },
      );
      paymentIntentId = intent.id;
      clientSecret = intent.client_secret;
    } catch (stripeErr) {
      Sentry.captureException(stripeErr, {
        tags: { action: "stripe_create_intent" },
      });
    }
  }

  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: "deposit_pending",
      deposit_amount: amount,
      deposit_due_at: dueAt,
      deposit_note: note || null,
      deposit_payment_intent_id: paymentIntentId,
      deposit_client_secret: clientSecret,
      decided_at: decidedAt,
      updated_at: decidedAt,
    })
    .eq("id", id);

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: {
      from: booking.status,
      to: "deposit_pending",
      amount,
      due_at: dueAt,
      stripe: !!paymentIntentId,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/bookings/requests");
  revalidatePath(`/bookings/requests/${id}`);
  return { success: true };
}

export async function markDepositReceived(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user, booking } = authorised;
  const guard = canTransition(booking.status, "approved");
  if (!guard.ok) return { error: guard.reason };

  const decidedAt = new Date().toISOString();
  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: "approved",
      updated_at: decidedAt,
      decided_at: booking.decided_at ?? decidedAt,
      deposit_paid_at: decidedAt,
    })
    .eq("id", id);

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (booking.slot_id) {
    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "booked" })
      .eq("id", booking.slot_id);

    if (slotError) {
      await restoreBookingAfterSlotFailure(supabase, id, booking, {
        deposit_paid_at: null,
      });
      return { error: "The slot could not be confirmed. Please try again." };
    }
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to: "approved", via: "deposit_received" },
  });

  revalidatePath("/dashboard");
  revalidatePath("/bookings/requests");
  revalidatePath(`/bookings/requests/${id}`);
  return { success: true };
}

export async function markWaitlistContacted(entryId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("waitlist_entries")
    .update({ status: "contacted" })
    .eq("id", entryId)
    .eq("artist_id", user.id);

  revalidatePath("/bookings/overview");
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

export async function dismissWaitlistEntry(entryId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("waitlist_entries")
    .update({ status: "dismissed" })
    .eq("id", entryId)
    .eq("artist_id", user.id);

  revalidatePath("/bookings/overview");
}

export async function convertWaitlistEntry({
  entryId,
  customerEmail,
  customerHandle,
  note,
}: {
  entryId: string;
  customerEmail: string;
  customerHandle: string;
  note: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const decidedAt = new Date().toISOString();

  const { error } = await supabase.from("booking_requests").insert({
    artist_id: user.id,
    status: "approved",
    origin: "artist_created",
    customer_email: customerEmail,
    customer_handle: customerHandle,
    customer_token_hash: tokenHash,
    form_data: { description: note || "" },
    decided_at: decidedAt,
    updated_at: decidedAt,
  });

  if (error) {
    Sentry.captureException(error, { tags: { action: "waitlist_convert" } });
    return { error: error.message };
  }

  await supabase
    .from("waitlist_entries")
    .update({ status: "converted" })
    .eq("id", entryId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  await sendWaitlistConversionEmail({
    to: customerEmail,
    artistName: profile?.display_name ?? "",
    magicLink: `${appUrl}/request/${token}`,
    customerHandle,
  });

  revalidatePath("/bookings/overview");
  return { success: true };
}
