"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  sendBookingEmail,
  sendWaitlistConversionEmail,
} from "@/lib/email/send-booking-email";
import crypto from "crypto";
import type { User } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { stripe } from "@/lib/stripe";

type ActionResult = { error: string } | { success: true };
type AuthorisedBookingResult =
  | { error: string }
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: User;
      booking: {
        status: string;
        artist_id: string;
        customer_email: string | null;
        customer_handle: string | null;
        preferred_date: string | null;
        slot_id: string | null;
        form_data: Record<string, string> | null;
      };
    };

async function getAuthorisedBooking(
  bookingId: string,
): Promise<AuthorisedBookingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "not authenticated" };

  const { data: booking } = await supabase
    .from("booking_requests")
    .select(
      "status, artist_id, customer_email, customer_handle, preferred_date, slot_id, form_data",
    )
    .eq("id", bookingId)
    .single();

  if (!booking) return { error: "booking not found" };
  if (booking.artist_id !== user.id) return { error: "not authorised" };

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
      form_data: booking.form_data as Record<string, string> | null,
    },
  };
}

export async function approveBooking(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user, booking } = authorised;

  // Generate new token so customer gets a fresh cancel link
  const newToken = crypto.randomBytes(32).toString("hex");
  const newHash = crypto.createHash("sha256").update(newToken).digest("hex");

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

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to: "approved" },
  });

  if (booking.customer_email) {
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

  // Slot: locked → booked
  if (booking.slot_id) {
    await supabase
      .from("slots")
      .update({ status: "booked" })
      .eq("id", booking.slot_id);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/requests/${id}`);
  return { success: true };
}

export async function rejectBooking(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

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
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
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

  // Slot: locked → open (rejection frees the slot)
  if (booking.slot_id) {
    await supabase
      .from("slots")
      .update({ status: "open" })
      .eq("id", booking.slot_id);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/requests/${id}`);
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

  // Create a Stripe PaymentIntent when Stripe is configured
  let paymentIntentId: string | null = null;
  let clientSecret: string | null = null;
  if (stripe && amount > 0) {
    try {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // EUR cents
        currency: "eur",
        metadata: { booking_id: id, artist_id: user.id },
        description: `Tattoo deposit — booking ${id}`,
      });
      paymentIntentId = intent.id;
      clientSecret = intent.client_secret;
    } catch (stripeErr) {
      Sentry.captureException(stripeErr, {
        tags: { action: "stripe_create_intent" },
      });
      // Non-fatal: fall back to manual deposit tracking
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
      updated_at: new Date().toISOString(),
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
  revalidatePath(`/dashboard/requests/${id}`);
  return { success: true };
}

export async function markDepositReceived(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

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
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to: "approved", via: "deposit_received" },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/requests/${id}`);
  return { success: true };
}

// --- Waitlist actions ---

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
  revalidatePath("/dashboard/waitlist");
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
  revalidatePath("/dashboard/waitlist");
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
  if (!user) return { error: "not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const { error } = await supabase.from("booking_requests").insert({
    artist_id: user.id,
    status: "approved",
    origin: "artist_created",
    customer_email: customerEmail,
    customer_handle: customerHandle,
    customer_token_hash: tokenHash,
    form_data: { description: note || "" },
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

  revalidatePath("/dashboard/waitlist");
  return { success: true };
}
