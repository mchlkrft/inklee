"use server";

import { createClient } from "@/lib/supabase/server";
import { bookingSchema } from "@/lib/booking-schema";
import crypto from "crypto";
import { redirect } from "next/navigation";

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

  // Generate new token for next edit
  const newToken = crypto.randomBytes(32).toString("hex");
  const newHash = hashToken(newToken);

  const fd = booking.form_data as Record<string, string> | null;

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

  await supabase.from("audit_log").insert({
    booking_id: booking.id,
    action: "token_rotated",
    details: { old_hash: tokenHash, new_hash: newHash, by: "customer" },
  });

  await supabase.from("audit_log").insert({
    booking_id: booking.id,
    action: "booking_edited",
    details: { by: "customer" },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  console.log(
    `[email] updated confirmation for ${data.email}, new magic link: ${appUrl}/request/${newToken}`,
  );

  redirect(`/request/submitted?id=${booking.id}&edited=1`);
}

export async function cancelCustomerBookingAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const token = formData.get("_token") as string;
  if (!token) return { error: "invalid link" };

  const tokenHash = hashToken(token);
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("booking_requests")
    .select("id, status, created_at, customer_email, artist_id")
    .eq("customer_token_hash", tokenHash)
    .single();

  if (!booking) return { error: "this link is no longer valid" };

  const expired =
    Date.now() - new Date(booking.created_at).getTime() >
    30 * 24 * 60 * 60 * 1000;
  if (expired) return { error: "this link has expired" };

  if (booking.status === "cancelled") {
    return { error: "this request is already cancelled" };
  }

  const { error: updateError } = await supabase
    .from("booking_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", booking.id);

  if (updateError) return { error: "something went wrong — try again" };

  await supabase.from("audit_log").insert({
    booking_id: booking.id,
    action: "status_changed",
    details: { from: booking.status, to: "cancelled", by: "customer" },
  });

  console.log(`[email] artist cancellation notice for booking ${booking.id}`);

  redirect(`/request/submitted?id=${booking.id}&cancelled=1`);
}
