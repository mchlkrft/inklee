"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { todayInTimeZone } from "@/lib/date-utils";
import {
  sendAppointmentReminder,
  sendDepositOverdueArtist,
  sendDepositOverdueCustomer,
  sendReconfirmationRequest,
} from "@/lib/email/reminder-emails";
import { resolveStudioForBooking } from "@/lib/booking-studio";
import { checkReminderRateLimit } from "@/lib/ratelimit";
import type { ReminderSettings } from "@/lib/reminder-settings";
import { serviceClient } from "@/lib/supabase/service";
import { localToUTC } from "@/lib/timezone";

type State = { error: string } | { success: true } | null;

function startOfTodayUtc(timezone: string): string {
  return localToUTC(todayInTimeZone(timezone), "00:00", timezone);
}

async function alreadySentTodayManual(
  bookingId: string,
  type: string,
  timezone: string,
): Promise<boolean> {
  const { count } = await serviceClient
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("action", "reminder_sent")
    .filter("details->>type", "eq", type)
    .gte("timestamp", startOfTodayUtc(timezone));

  return (count ?? 0) > 0;
}

export async function saveReminderSettingsAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const currentSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const reminderSettings: ReminderSettings = {
    deposit_overdue_enabled: formData.get("deposit_overdue_enabled") === "true",
    appointment_reminder_enabled:
      formData.get("appointment_reminder_enabled") === "true",
    appointment_reminder_days: Math.min(
      14,
      Math.max(
        1,
        parseInt(formData.get("appointment_reminder_days") as string, 10) || 3,
      ),
    ),
    reconfirmation_enabled: formData.get("reconfirmation_enabled") === "true",
    reconfirmation_days: Math.min(
      30,
      Math.max(
        3,
        parseInt(formData.get("reconfirmation_days") as string, 10) || 14,
      ),
    ),
  };

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...currentSettings, reminder_settings: reminderSettings },
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  revalidatePath("/settings/emails");
  return { success: true };
}

export async function sendManualDepositReminderAction(
  bookingId: string,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { data: booking } = await supabase
    .from("booking_requests")
    .select(
      "id, customer_email, customer_handle, deposit_amount, deposit_due_at, deposit_note, artist_id",
    )
    .eq("id", bookingId)
    .eq("artist_id", user.id)
    .single();

  if (!booking) return { error: "booking not found" };
  if (!booking.customer_email) {
    return { error: "no customer email on this booking" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone")
    .eq("id", user.id)
    .single();
  const timezone = profile?.timezone ?? "Europe/Berlin";

  if (await alreadySentTodayManual(bookingId, "deposit_overdue", timezone)) {
    return { error: "a deposit reminder was already sent today" };
  }

  const { allowed } = await checkReminderRateLimit(
    user.id,
    bookingId,
    "deposit",
  );
  if (!allowed) {
    return { error: "reminder already sent recently - try again later" };
  }

  const { data: artistAuth } = await serviceClient.auth.admin.getUserById(
    user.id,
  );
  const artistEmail = artistAuth?.user?.email;
  const artistName = profile?.display_name ?? "the artist";
  const amount = booking.deposit_amount ? Number(booking.deposit_amount) : 0;

  await sendDepositOverdueCustomer({
    to: booking.customer_email,
    customerHandle: booking.customer_handle ?? "there",
    artistName,
    amountEur: amount,
    dueAt: booking.deposit_due_at ?? "",
    note: booking.deposit_note,
  });

  if (artistEmail) {
    await sendDepositOverdueArtist({
      to: artistEmail,
      customerHandle: booking.customer_handle ?? "customer",
      amountEur: amount,
      dueAt: booking.deposit_due_at ?? "",
    });
  }

  await writeAudit({
    bookingId,
    action: "reminder_sent",
    actor: user.id,
    category: "booking",
    details: { type: "deposit_overdue", manual: true },
  });

  revalidatePath(`/bookings/requests/${bookingId}`);
  return { success: true };
}

export async function sendManualReconfirmationAction(
  bookingId: string,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { data: booking } = await supabase
    .from("booking_requests")
    .select(
      "id, customer_email, customer_handle, customer_token_hash, preferred_date, form_data, artist_id",
    )
    .eq("id", bookingId)
    .eq("artist_id", user.id)
    .single();

  if (!booking) return { error: "booking not found" };
  if (!booking.customer_email)
    return { error: "no customer email on this booking" };
  if (!booking.customer_token_hash) return { error: "no magic link token" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone")
    .eq("id", user.id)
    .single();
  const timezone = profile?.timezone ?? "Europe/Berlin";

  if (await alreadySentTodayManual(bookingId, "reconfirmation", timezone)) {
    return { error: "a reconfirmation was already sent today" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const newToken = crypto.randomBytes(32).toString("hex");
  const newHash = crypto.createHash("sha256").update(newToken).digest("hex");
  const oldHash = booking.customer_token_hash;

  const { error: updateError } = await supabase
    .from("booking_requests")
    .update({ customer_token_hash: newHash })
    .eq("id", bookingId);
  if (updateError) return { error: updateError.message };

  const fd = booking.form_data as Record<string, string> | null;

  try {
    await sendReconfirmationRequest({
      to: booking.customer_email,
      customerHandle: booking.customer_handle ?? "there",
      artistName: profile?.display_name ?? "the artist",
      date: booking.preferred_date ?? "",
      placement: fd?.placement ?? "",
      magicLink: `${appUrl}/request/${newToken}`,
      studio: await resolveStudioForBooking(bookingId),
    });
  } catch {
    await supabase
      .from("booking_requests")
      .update({ customer_token_hash: oldHash })
      .eq("id", bookingId);
    return { error: "could not send the reconfirmation email" };
  }

  await writeAudit({
    bookingId,
    action: "reminder_sent",
    actor: user.id,
    category: "booking",
    details: { type: "reconfirmation", manual: true },
  });

  revalidatePath(`/bookings/requests/${bookingId}`);
  return { success: true };
}

export async function sendManualAppointmentReminderAction(
  bookingId: string,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { data: booking } = await supabase
    .from("booking_requests")
    .select(
      "id, customer_email, customer_handle, preferred_date, form_data, artist_id",
    )
    .eq("id", bookingId)
    .eq("artist_id", user.id)
    .single();

  if (!booking) return { error: "booking not found" };
  if (!booking.customer_email)
    return { error: "no customer email on this booking" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone")
    .eq("id", user.id)
    .single();
  const timezone = profile?.timezone ?? "Europe/Berlin";

  if (
    await alreadySentTodayManual(bookingId, "appointment_reminder", timezone)
  ) {
    return { error: "an appointment reminder was already sent today" };
  }

  const fd = booking.form_data as Record<string, string> | null;
  await sendAppointmentReminder({
    to: booking.customer_email,
    customerHandle: booking.customer_handle ?? "there",
    artistName: profile?.display_name ?? "the artist",
    date: booking.preferred_date ?? "",
    placement: fd?.placement ?? "",
    studio: await resolveStudioForBooking(bookingId),
  });

  await writeAudit({
    bookingId,
    action: "reminder_sent",
    actor: user.id,
    category: "booking",
    details: { type: "appointment_reminder", manual: true },
  });

  revalidatePath(`/bookings/requests/${bookingId}`);
  return { success: true };
}
