import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";

export const runtime = "nodejs";

type Row = {
  id: string;
  status: string;
  customer_email: string | null;
  deposit_amount: string | number | null;
  created_at: string;
};

function cutoffIso(range: string): string | null {
  const days = range === "30" ? 30 : range === "90" ? 90 : null; // else = all
  return days === null
    ? null
    : new Date(Date.now() - days * 86400000).toISOString();
}

// GET /api/mobile/analytics?range=30|90|all — headline booking metrics.
// Mirrors the web analytics computation; kept mobile-readable (no day grid).
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const range = new URL(req.url).searchParams.get("range") ?? "90";
  let query = supabase
    .from("booking_requests")
    .select("id, status, customer_email, deposit_amount, created_at")
    .eq("artist_id", userId);
  const cutoff = cutoffIso(range);
  if (cutoff) query = query.gte("created_at", cutoff);

  const { data, error } = await query;
  if (error) return mobileError(500, error.message);
  const rows = (data ?? []) as Row[];

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
    const key = r.created_at.slice(0, 7);
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }
  const months = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, count]) => ({ month, count }));

  return mobileOk({
    range,
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
  });
}
