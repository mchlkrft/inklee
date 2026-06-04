import { createClient } from "@/lib/supabase/server";
import AnalyticsClient from "./analytics-client";

function getCutoff(range: string): string | null {
  const now = Date.now();
  if (range === "30") return new Date(now - 30 * 86400000).toISOString();
  if (range === "90") return new Date(now - 90 * 86400000).toISOString();
  return null;
}

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

  const cutoff = getCutoff(range);

  let query = supabase
    .from("booking_requests")
    .select("id, status, customer_email, deposit_amount, created_at")
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: true });

  if (cutoff) query = query.gte("created_at", cutoff);

  const { data: bookings } = await query;
  const rows = bookings ?? [];

  // --- Metrics ---
  const total = rows.length;
  const approved = rows.filter(
    (r) => r.status === "approved" || r.status === "deposit_pending",
  ).length;
  const rejected = rows.filter((r) => r.status === "rejected").length;
  const conversionRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const rejectionRate = total > 0 ? Math.round((rejected / total) * 100) : 0;

  const emailCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.customer_email) {
      emailCounts.set(
        r.customer_email,
        (emailCounts.get(r.customer_email) ?? 0) + 1,
      );
    }
  }
  const uniqueClients = emailCounts.size;
  const repeatClients = [...emailCounts.values()].filter((c) => c > 1).length;
  const returnRate =
    uniqueClients > 0 ? Math.round((repeatClients / uniqueClients) * 100) : 0;

  const depositRequested = rows.filter((r) => r.deposit_amount !== null).length;
  const depositPaid = rows.filter(
    (r) => r.status === "approved" && r.deposit_amount !== null,
  ).length;
  const depositRate =
    depositRequested > 0
      ? Math.round((depositPaid / depositRequested) * 100)
      : null;

  // --- Monthly volume chart ---
  const monthMap = new Map<string, number>();
  for (const r of rows) {
    const key = r.created_at.slice(0, 7); // "YYYY-MM"
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }
  const months = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, count]) => ({
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
    [...monthMap.keys()].sort().at(-1) ?? new Date().toISOString().slice(0, 7);
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
        total,
        conversionRate,
        rejectionRate,
        returnRate,
        depositRate,
      }}
      months={months}
      calendar={calendar}
    />
  );
}
