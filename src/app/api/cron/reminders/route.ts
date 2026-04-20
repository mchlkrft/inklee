import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import crypto from "crypto";
import {
  sendDepositOverdueCustomer,
  sendDepositOverdueArtist,
  sendAppointmentReminder,
  sendReconfirmationRequest,
} from "@/lib/email/reminder-emails";

export const runtime = "nodejs";

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = {
    deposit_overdue: 0,
    appointment_reminder: 0,
    reconfirmation: 0,
    errors: 0,
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";

  // ── 1. Deposit overdue ────────────────────────────────────────────────────
  // Bookings still deposit_pending where due date has passed.
  // Deduped via audit_log — won't resend if already sent today.
  {
    const { data: overdueBookings } = await serviceClient
      .from("booking_requests")
      .select(
        "id, customer_email, customer_handle, customer_token_hash, deposit_amount, deposit_due_at, deposit_note, artist_id",
      )
      .eq("status", "deposit_pending")
      .lt("deposit_due_at", today())
      .not("customer_email", "is", null);

    for (const booking of overdueBookings ?? []) {
      try {
        // Check if we already sent a reminder for this booking today
        const todayStr = today();
        const { count } = await serviceClient
          .from("audit_log")
          .select("id", { count: "exact", head: true })
          .eq("booking_id", booking.id)
          .eq("action", "reminder_sent")
          .filter("details->>type", "eq", "deposit_overdue")
          .gte("timestamp", `${todayStr}T00:00:00Z`);

        if ((count ?? 0) > 0) continue;

        // Fetch artist email
        const { data: artistAuth } = await serviceClient.auth.admin.getUserById(
          booking.artist_id,
        );
        const artistEmail = artistAuth?.user?.email;

        const { data: artistProfile } = await serviceClient
          .from("profiles")
          .select("display_name")
          .eq("id", booking.artist_id)
          .single();

        const artistName = artistProfile?.display_name ?? "the artist";
        const amount = booking.deposit_amount
          ? Number(booking.deposit_amount)
          : 0;

        // Email customer
        await sendDepositOverdueCustomer({
          to: booking.customer_email!,
          customerHandle: booking.customer_handle ?? "there",
          artistName,
          amountEur: amount,
          dueAt: booking.deposit_due_at ?? "",
          note: booking.deposit_note,
        });

        // Email artist
        if (artistEmail) {
          await sendDepositOverdueArtist({
            to: artistEmail,
            customerHandle: booking.customer_handle ?? "customer",
            amountEur: amount,
            dueAt: booking.deposit_due_at ?? "",
          });
        }

        await serviceClient.from("audit_log").insert({
          booking_id: booking.id,
          action: "reminder_sent",
          details: { type: "deposit_overdue" },
        });

        results.deposit_overdue++;
      } catch {
        results.errors++;
      }
    }
  }

  // ── 2. Appointment reminder (3 days out) ──────────────────────────────────
  {
    const targetDate = daysFromNow(3);

    const { data: upcoming } = await serviceClient
      .from("booking_requests")
      .select(
        "id, customer_email, customer_handle, preferred_date, form_data, artist_id",
      )
      .eq("status", "approved")
      .eq("preferred_date", targetDate)
      .not("customer_email", "is", null);

    for (const booking of upcoming ?? []) {
      try {
        const { data: profile } = await serviceClient
          .from("profiles")
          .select("display_name")
          .eq("id", booking.artist_id)
          .single();

        const fd = booking.form_data as Record<string, string> | null;

        await sendAppointmentReminder({
          to: booking.customer_email!,
          customerHandle: booking.customer_handle ?? "there",
          artistName: profile?.display_name ?? "the artist",
          date: booking.preferred_date ?? targetDate,
          placement: fd?.placement ?? "",
        });

        await serviceClient.from("audit_log").insert({
          booking_id: booking.id,
          action: "reminder_sent",
          details: { type: "appointment_reminder", days_out: 3 },
        });

        results.appointment_reminder++;
      } catch {
        results.errors++;
      }
    }
  }

  // ── 3. Reconfirmation request (14 days out) ───────────────────────────────
  {
    const targetDate = daysFromNow(14);

    const { data: upcoming } = await serviceClient
      .from("booking_requests")
      .select(
        "id, customer_email, customer_handle, customer_token_hash, preferred_date, form_data, artist_id",
      )
      .eq("status", "approved")
      .eq("preferred_date", targetDate)
      .not("customer_email", "is", null)
      .not("customer_token_hash", "is", null);

    for (const booking of upcoming ?? []) {
      try {
        const { data: profile } = await serviceClient
          .from("profiles")
          .select("display_name")
          .eq("id", booking.artist_id)
          .single();

        const fd = booking.form_data as Record<string, string> | null;

        // Issue a fresh token so the customer gets a working cancel link
        const newToken = crypto.randomBytes(32).toString("hex");
        const newHash = crypto
          .createHash("sha256")
          .update(newToken)
          .digest("hex");

        await serviceClient
          .from("booking_requests")
          .update({ customer_token_hash: newHash })
          .eq("id", booking.id);

        const magicLink = `${appUrl}/request/${newToken}`;

        await sendReconfirmationRequest({
          to: booking.customer_email!,
          customerHandle: booking.customer_handle ?? "there",
          artistName: profile?.display_name ?? "the artist",
          date: booking.preferred_date ?? targetDate,
          placement: fd?.placement ?? "",
          magicLink,
        });

        await serviceClient.from("audit_log").insert({
          booking_id: booking.id,
          action: "reminder_sent",
          details: { type: "reconfirmation", days_out: 14 },
        });

        results.reconfirmation++;
      } catch {
        results.errors++;
      }
    }
  }

  return NextResponse.json(results);
}
