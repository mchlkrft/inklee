import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  relativeDateKeyFromToday,
  addDaysToDateKey,
  localDateKey,
  todayInTimeZone,
} from "@/lib/date-utils";
import {
  sendAppointmentReminder,
  sendDepositOverdueArtist,
  sendDepositOverdueCustomer,
  sendReconfirmationRequest,
} from "@/lib/email/reminder-emails";
import { parseReminderSettings } from "@/lib/reminder-settings";
import { serviceClient } from "@/lib/supabase/service";
import { resolveStudioForBooking } from "@/lib/booking-studio";
import { localToUTC } from "@/lib/timezone";

export const runtime = "nodejs";

type ReminderSettingsSnapshot = ReturnType<typeof parseReminderSettings>;
type ArtistSnapshot = {
  displayName: string;
  timezone: string;
  settings: ReminderSettingsSnapshot;
};

const artistSnapshotCache = new Map<string, ArtistSnapshot>();
const artistEmailCache = new Map<string, string | null>();

async function getArtistSnapshot(artistId: string): Promise<ArtistSnapshot> {
  const cached = artistSnapshotCache.get(artistId);
  if (cached) return cached;

  const { data } = await serviceClient
    .from("profiles")
    .select("display_name, timezone, settings")
    .eq("id", artistId)
    .single();

  const profileSettings = (data?.settings ?? {}) as Record<string, unknown>;
  const snapshot = {
    displayName: data?.display_name ?? "the artist",
    timezone: data?.timezone ?? "Europe/Berlin",
    settings: parseReminderSettings(profileSettings.reminder_settings),
  };
  artistSnapshotCache.set(artistId, snapshot);
  return snapshot;
}

async function getArtistEmail(artistId: string): Promise<string | null> {
  if (artistEmailCache.has(artistId)) {
    return artistEmailCache.get(artistId) ?? null;
  }

  const { data } = await serviceClient.auth.admin.getUserById(artistId);
  const email = data.user?.email ?? null;
  artistEmailCache.set(artistId, email);
  return email;
}

function startOfTodayUtc(timezone: string): string {
  return localToUTC(todayInTimeZone(timezone), "00:00", timezone);
}

async function alreadySentToday(
  bookingId: string,
  type: "deposit_overdue" | "appointment_reminder" | "reconfirmation",
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

  const ARTIST_EMAIL_CAP = 10;
  const artistEmailCount = new Map<string, number>();
  function withinCap(artistId: string): boolean {
    const count = artistEmailCount.get(artistId) ?? 0;
    if (count >= ARTIST_EMAIL_CAP) return false;
    artistEmailCount.set(artistId, count + 1);
    return true;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";

  {
    const { data: overdueBookings } = await serviceClient
      .from("booking_requests")
      .select(
        "id, customer_email, customer_handle, deposit_amount, deposit_due_at, deposit_note, artist_id",
      )
      .eq("status", "deposit_pending")
      .not("customer_email", "is", null);

    for (const booking of overdueBookings ?? []) {
      try {
        const snapshot = await getArtistSnapshot(booking.artist_id);
        if (!snapshot.settings.deposit_overdue_enabled) continue;
        if (
          !booking.deposit_due_at ||
          booking.deposit_due_at >= todayInTimeZone(snapshot.timezone)
        ) {
          continue;
        }
        if (
          await alreadySentToday(
            booking.id,
            "deposit_overdue",
            snapshot.timezone,
          )
        ) {
          continue;
        }
        if (!withinCap(booking.artist_id)) {
          results.capped++;
          continue;
        }

        const artistEmail = await getArtistEmail(booking.artist_id);
        const amount = booking.deposit_amount
          ? Number(booking.deposit_amount)
          : 0;

        await sendDepositOverdueCustomer({
          to: booking.customer_email!,
          customerHandle: booking.customer_handle ?? "there",
          artistName: snapshot.displayName,
          amountEur: amount,
          dueAt: booking.deposit_due_at,
          note: booking.deposit_note,
        });

        if (artistEmail) {
          await sendDepositOverdueArtist({
            to: artistEmail,
            customerHandle: booking.customer_handle ?? "customer",
            amountEur: amount,
            dueAt: booking.deposit_due_at,
          });
        }

        await serviceClient.from("audit_log").insert({
          booking_id: booking.id,
          action: "reminder_sent",
          details: { type: "deposit_overdue" },
        });

        results.deposit_overdue++;
      } catch (error) {
        console.error("[cron/reminders][deposit_overdue]", error, {
          bookingId: booking.id,
        });
        results.errors++;
      }
    }
  }

  {
    const windowStart = addDaysToDateKey(localDateKey(), 1);
    const windowEnd = addDaysToDateKey(localDateKey(), 15);

    const { data: candidateBookings } = await serviceClient
      .from("booking_requests")
      .select(
        "id, customer_email, customer_handle, preferred_date, form_data, artist_id",
      )
      .eq("status", "approved")
      .gte("preferred_date", windowStart)
      .lte("preferred_date", windowEnd)
      .not("customer_email", "is", null);

    for (const booking of candidateBookings ?? []) {
      try {
        const snapshot = await getArtistSnapshot(booking.artist_id);
        if (!snapshot.settings.appointment_reminder_enabled) continue;
        if (
          booking.preferred_date !==
          relativeDateKeyFromToday(
            snapshot.settings.appointment_reminder_days,
            snapshot.timezone,
          )
        ) {
          continue;
        }
        if (
          await alreadySentToday(
            booking.id,
            "appointment_reminder",
            snapshot.timezone,
          )
        ) {
          continue;
        }
        if (!withinCap(booking.artist_id)) {
          results.capped++;
          continue;
        }

        const formData = booking.form_data as Record<string, string> | null;
        await sendAppointmentReminder({
          to: booking.customer_email!,
          customerHandle: booking.customer_handle ?? "there",
          artistName: snapshot.displayName,
          date: booking.preferred_date ?? "",
          placement: formData?.placement ?? "",
          studio: await resolveStudioForBooking(booking.id),
        });

        await serviceClient.from("audit_log").insert({
          booking_id: booking.id,
          action: "reminder_sent",
          details: {
            type: "appointment_reminder",
            days_out: snapshot.settings.appointment_reminder_days,
          },
        });

        results.appointment_reminder++;
      } catch (error) {
        console.error("[cron/reminders][appointment_reminder]", error, {
          bookingId: booking.id,
        });
        results.errors++;
      }
    }
  }

  {
    const windowStart = addDaysToDateKey(localDateKey(), 3);
    const windowEnd = addDaysToDateKey(localDateKey(), 31);

    const { data: candidateBookings } = await serviceClient
      .from("booking_requests")
      .select(
        "id, customer_email, customer_handle, customer_token_hash, preferred_date, form_data, artist_id",
      )
      .eq("status", "approved")
      .gte("preferred_date", windowStart)
      .lte("preferred_date", windowEnd)
      .not("customer_email", "is", null)
      .not("customer_token_hash", "is", null);

    for (const booking of candidateBookings ?? []) {
      try {
        const snapshot = await getArtistSnapshot(booking.artist_id);
        if (!snapshot.settings.reconfirmation_enabled) continue;
        if (
          booking.preferred_date !==
          relativeDateKeyFromToday(
            snapshot.settings.reconfirmation_days,
            snapshot.timezone,
          )
        ) {
          continue;
        }
        if (
          await alreadySentToday(
            booking.id,
            "reconfirmation",
            snapshot.timezone,
          )
        ) {
          continue;
        }
        if (!withinCap(booking.artist_id)) {
          results.capped++;
          continue;
        }

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

        const formData = booking.form_data as Record<string, string> | null;
        try {
          await sendReconfirmationRequest({
            to: booking.customer_email!,
            customerHandle: booking.customer_handle ?? "there",
            artistName: snapshot.displayName,
            date: booking.preferred_date ?? "",
            placement: formData?.placement ?? "",
            magicLink: `${appUrl}/request/${newToken}`,
            studio: await resolveStudioForBooking(booking.id),
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
          details: {
            type: "reconfirmation",
            days_out: snapshot.settings.reconfirmation_days,
          },
        });

        results.reconfirmation++;
      } catch (error) {
        console.error("[cron/reminders][reconfirmation]", error, {
          bookingId: booking.id,
        });
        results.errors++;
      }
    }
  }

  return NextResponse.json(results);
}
