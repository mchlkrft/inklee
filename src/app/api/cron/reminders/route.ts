import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import crypto from "crypto";
import {
  sendDepositOverdueCustomer,
  sendDepositOverdueArtist,
  sendAppointmentReminder,
  sendReconfirmationRequest,
} from "@/lib/email/reminder-emails";
import { parseReminderSettings } from "@/lib/reminder-settings";

// Per-artist reminder settings cache for this cron run
const artistSettingsCache = new Map<
  string,
  ReturnType<typeof parseReminderSettings>
>();

async function getArtistReminderSettings(artistId: string) {
  if (artistSettingsCache.has(artistId))
    return artistSettingsCache.get(artistId)!;
  const { data } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", artistId)
    .single();
  const profileSettings = (data?.settings ?? {}) as Record<string, unknown>;
  const settings = parseReminderSettings(profileSettings.reminder_settings);
  artistSettingsCache.set(artistId, settings);
  return settings;
}

export const runtime = "nodejs";

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

async function alreadySentToday(
  bookingId: string,
  type: "deposit_overdue" | "appointment_reminder" | "reconfirmation",
): Promise<boolean> {
  const todayStr = today();
  const { count } = await serviceClient
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("action", "reminder_sent")
    .filter("details->>type", "eq", type)
    .gte("timestamp", `${todayStr}T00:00:00Z`);

  return (count ?? 0) > 0;
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
    capped: 0,
  };

  // Per-artist email cap for this cron run — prevents a bug from spamming one artist
  const ARTIST_EMAIL_CAP = 10;
  const artistEmailCount = new Map<string, number>();
  function withinCap(artistId: string): boolean {
    const n = artistEmailCount.get(artistId) ?? 0;
    if (n >= ARTIST_EMAIL_CAP) return false;
    artistEmailCount.set(artistId, n + 1);
    return true;
  }

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
        const artistSettings = await getArtistReminderSettings(
          booking.artist_id,
        );
        if (!artistSettings.deposit_overdue_enabled) continue;
        if (await alreadySentToday(booking.id, "deposit_overdue")) continue;
        if (!withinCap(booking.artist_id)) {
          results.capped++;
          continue;
        }

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

  // ── 2. Appointment reminder (per-artist configurable days out) ────────────
  // Collect all distinct reminder_days values to minimise queries
  {
    // Fetch all approved bookings in the relevant window (1-14 days out)
    const { data: candidateBookings } = await serviceClient
      .from("booking_requests")
      .select(
        "id, customer_email, customer_handle, preferred_date, form_data, artist_id",
      )
      .eq("status", "approved")
      .gte("preferred_date", daysFromNow(1))
      .lte("preferred_date", daysFromNow(14))
      .not("customer_email", "is", null);

    const upcoming = [];
    for (const booking of candidateBookings ?? []) {
      const artistSettings = await getArtistReminderSettings(booking.artist_id);
      if (!artistSettings.appointment_reminder_enabled) continue;
      const targetDate = daysFromNow(artistSettings.appointment_reminder_days);
      if (booking.preferred_date === targetDate) upcoming.push(booking);
    }

    for (const booking of upcoming) {
      try {
        if (await alreadySentToday(booking.id, "appointment_reminder"))
          continue;
        if (!withinCap(booking.artist_id)) {
          results.capped++;
          continue;
        }

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
          date: booking.preferred_date ?? "",
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

  // ── 3. Reconfirmation request (per-artist configurable days out) ──────────
  {
    const { data: candidateReconfirm } = await serviceClient
      .from("booking_requests")
      .select(
        "id, customer_email, customer_handle, customer_token_hash, preferred_date, form_data, artist_id",
      )
      .eq("status", "approved")
      .gte("preferred_date", daysFromNow(3))
      .lte("preferred_date", daysFromNow(30))
      .not("customer_email", "is", null)
      .not("customer_token_hash", "is", null);

    const upcoming = [];
    for (const booking of candidateReconfirm ?? []) {
      const artistSettings = await getArtistReminderSettings(booking.artist_id);
      if (!artistSettings.reconfirmation_enabled) continue;
      const targetDate = daysFromNow(artistSettings.reconfirmation_days);
      if (booking.preferred_date === targetDate) upcoming.push(booking);
    }

    for (const booking of upcoming) {
      try {
        if (await alreadySentToday(booking.id, "reconfirmation")) continue;
        if (!withinCap(booking.artist_id)) {
          results.capped++;
          continue;
        }

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

        const oldHash = booking.customer_token_hash;

        const { error: tokenUpdateError } = await serviceClient
          .from("booking_requests")
          .update({ customer_token_hash: newHash })
          .eq("id", booking.id);

        if (tokenUpdateError) {
          results.errors++;
          continue;
        }

        const magicLink = `${appUrl}/request/${newToken}`;

        try {
          await sendReconfirmationRequest({
            to: booking.customer_email!,
            customerHandle: booking.customer_handle ?? "there",
            artistName: profile?.display_name ?? "the artist",
            date: booking.preferred_date ?? "",
            placement: fd?.placement ?? "",
            magicLink,
          });
        } catch (error) {
          await serviceClient
            .from("booking_requests")
            .update({ customer_token_hash: oldHash })
            .eq("id", booking.id);
          throw error;
        }

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
