import { createClient } from "@/lib/supabase/server";
import {
  analyticsCutoffIso,
  computeAnalytics,
  type AnalyticsRow,
} from "@inklee/shared/analytics";
import AnalyticsClient from "./analytics-client";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range = "90" } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cutoff = analyticsCutoffIso(range);

  let query = supabase
    .from("booking_requests")
    .select("id, status, customer_email, deposit_amount, created_at")
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: true });

  if (cutoff) query = query.gte("created_at", cutoff);

  const { data: bookings } = await query;
  const rows = bookings ?? [];

  // --- Metrics (shared core, single-sourced with the mobile route) ---
  const m = computeAnalytics(rows as AnalyticsRow[]);

  // --- Monthly volume chart (the Intl label stays in this rendering layer) ---
  const months = m.months.map(({ month, count }) => ({
    label: new Date(month + "-01").toLocaleDateString("en", {
      month: "short",
      year: "2-digit",
    }),
    count,
  }));

  // --- Per-day calendar for the most recent active month (DT-4) ---
  const dayMap = new Map<string, number>();
  for (const r of rows) {
    const dayKey = r.created_at.slice(0, 10); // "YYYY-MM-DD"
    dayMap.set(dayKey, (dayMap.get(dayKey) ?? 0) + 1);
  }
  const latestMonthKey =
    m.months.at(-1)?.month ?? new Date().toISOString().slice(0, 7);
  const [calYear, calMonth] = latestMonthKey.split("-").map(Number); // calMonth 1-based
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  // Monday-start grid: JS getDay() is 0=Sun, shift so Mon=0.
  const firstWeekday = (new Date(calYear, calMonth - 1, 1).getDay() + 6) % 7;
  const calendarCells = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const key = `${latestMonthKey}-${String(day).padStart(2, "0")}`;
    return { day, count: dayMap.get(key) ?? 0 };
  });
  const calendar = {
    label: new Date(latestMonthKey + "-01").toLocaleDateString("en", {
      month: "long",
      year: "numeric",
    }),
    leadingBlanks: firstWeekday,
    cells: calendarCells,
    maxDay: Math.max(...calendarCells.map((c) => c.count), 1),
  };

  return (
    <AnalyticsClient
      range={range}
      metrics={{
        total: m.total,
        conversionRate: m.conversionRate,
        rejectionRate: m.rejectionRate,
        returnRate: m.returnRate,
        depositRate: m.depositRate,
      }}
      months={months}
      calendar={calendar}
    />
  );
}
