import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { getAllArtistStats, getExcludedIds } from "@/lib/growth-queries";
import { loadGrowthSettings } from "@/lib/growth/settings";
import {
  addDays,
  dayKeyInTimeZone,
  isValidDayKey,
  startOfDayInTimeZone,
} from "@/lib/growth/date-range";
import { isActivated, isCountedArtist } from "@/lib/growth/metrics";
import type { BookingSeriesRow, SignupSeriesRow } from "@/lib/growth/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily growth snapshot (growth cockpit, migration 0067). Writes YESTERDAY's
// aggregate counts into growth_daily_snapshots so growth history survives the
// two deliberate data-erosion mechanisms:
//   • the 30-day cleanup cron deletes rejected/cancelled bookings without money
//   • the 24-month retention purge deletes non-booking audit rows
// Counts only, never per-artist rows or PII, so the table itself is exempt from
// account-deletion cascades by design. Idempotent: re-running a day upserts the
// same row. ?date=YYYY-MM-DD recomputes a specific day (manual backfill).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await loadGrowthSettings();
  const tz = settings.reporting_timezone;

  const url = new URL(request.url);
  const requestedDay = url.searchParams.get("date");
  // Explicit 400 instead of a silent fallback: a mistyped backfill date must
  // not quietly overwrite yesterday's snapshot.
  if (requestedDay && !isValidDayKey(requestedDay)) {
    return NextResponse.json(
      { error: "invalid date, expected a real YYYY-MM-DD" },
      { status: 400 },
    );
  }
  const day =
    requestedDay ?? dayKeyInTimeZone(new Date(Date.now() - 86_400_000), tz);

  const from = startOfDayInTimeZone(day, tz);
  const to = addDays(from, 1);
  const excluded = await getExcludedIds();

  let signup: SignupSeriesRow | undefined;
  let booking: BookingSeriesRow | undefined;
  let counted: Awaited<ReturnType<typeof getAllArtistStats>>;
  try {
    const [signupRows, bookingRows, statsRows] = await Promise.all([
      serviceClient.rpc("growth_signup_series", {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_tz: tz,
        p_bucket: "day",
        p_exclude: excluded,
      }),
      serviceClient.rpc("growth_booking_series", {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_tz: tz,
        p_bucket: "day",
        p_exclude: excluded,
      }),
      // Paged fetch (never a raw .range: PostgREST silently caps at 1000 rows,
      // which would permanently record wrong point-in-time history).
      getAllArtistStats(),
    ]);
    if (signupRows.error || bookingRows.error) {
      const message = signupRows.error?.message ?? bookingRows.error?.message;
      return NextResponse.json({ error: message }, { status: 500 });
    }
    signup = ((signupRows.data ?? []) as SignupSeriesRow[])[0];
    booking = ((bookingRows.data ?? []) as BookingSeriesRow[])[0];
    counted = statsRows.filter(isCountedArtist);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }

  const metrics = {
    // Point-in-time state at snapshot time.
    total_artists: counted.length,
    activated_artists: counted.filter(isActivated).length,
    onboarding_completed: counted.filter((row) => row.onboarding_completed)
      .length,
    books_open: counted.filter(
      (row) => row.books_configured && row.books_open_flag,
    ).length,
    // Day-of counts.
    auth_signups: signup?.auth_signups ?? 0,
    profiles_claimed: signup?.profiles_claimed ?? 0,
    requests: booking?.requests ?? 0,
    approvals: booking?.approvals ?? 0,
    declines: booking?.declines ?? 0,
    cancellations: booking?.cancellations ?? 0,
    deposits_requested: booking?.deposits_requested ?? 0,
    deposits_paid: booking?.deposits_paid ?? 0,
  };

  const { error: upsertError } = await serviceClient
    .from("growth_daily_snapshots")
    .upsert({
      snapshot_date: day,
      metrics,
      updated_at: new Date().toISOString(),
    });
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ snapshot_date: day, metrics });
}
