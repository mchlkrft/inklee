// Headline booking-analytics math — the ONE source for the web analytics page
// and the /api/mobile/analytics route, which computed byte-identical metrics from
// two copies. Pure + Intl-free: the web page keeps its Intl month labels and the
// per-day calendar in the rendering layer (this returns raw YYYY-MM months).
// (ME-10 D1)

export type AnalyticsRange = "30" | "90" | "all" | string;

export type AnalyticsRow = {
  status: string;
  customer_email: string | null;
  deposit_amount: string | number | null;
  created_at: string;
};

export type MonthVolume = { month: string; count: number };

export type AnalyticsMetrics = {
  total: number;
  approved: number;
  rejected: number;
  conversionRate: number;
  rejectionRate: number;
  uniqueClients: number;
  repeatClients: number;
  returnRate: number;
  depositRequested: number;
  depositPaid: number;
  depositRate: number | null;
  months: MonthVolume[];
};

/**
 * ISO cutoff for the range filter: 30 or 90 days back, or null for all-time
 * (the caller then skips the created_at >= filter). `now` is injectable for
 * deterministic tests.
 */
export function analyticsCutoffIso(
  range: AnalyticsRange,
  now: number = Date.now(),
): string | null {
  const days = range === "30" ? 30 : range === "90" ? 90 : null;
  return days === null ? null : new Date(now - days * 86_400_000).toISOString();
}

/**
 * Compute the headline metrics from the artist's booking rows. Note the
 * intentional asymmetry: `approved`/conversion count {approved, deposit_pending}
 * while `depositPaid` counts only status==="approved" with a deposit amount.
 */
export function computeAnalytics(rows: AnalyticsRow[]): AnalyticsMetrics {
  const total = rows.length;
  const approved = rows.filter(
    (r) => r.status === "approved" || r.status === "deposit_pending",
  ).length;
  const rejected = rows.filter((r) => r.status === "rejected").length;

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
  const repeatClients = [...emailCounts.values()].filter((n) => n > 1).length;

  const depositRequested = rows.filter((r) => r.deposit_amount !== null).length;
  const depositPaid = rows.filter(
    (r) => r.status === "approved" && r.deposit_amount !== null,
  ).length;

  const monthMap = new Map<string, number>();
  for (const r of rows) {
    const key = r.created_at.slice(0, 7); // "YYYY-MM"
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }
  const months = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, count]) => ({ month, count }));

  return {
    total,
    approved,
    rejected,
    conversionRate: total > 0 ? Math.round((approved / total) * 100) : 0,
    rejectionRate: total > 0 ? Math.round((rejected / total) * 100) : 0,
    uniqueClients,
    repeatClients,
    returnRate:
      uniqueClients > 0 ? Math.round((repeatClients / uniqueClients) * 100) : 0,
    depositRequested,
    depositPaid,
    depositRate:
      depositRequested > 0
        ? Math.round((depositPaid / depositRequested) * 100)
        : null,
    months,
  };
}
