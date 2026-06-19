import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import type { MobileAnalytics } from "@inklee/shared/mobile-api";
import {
  analyticsCutoffIso,
  computeAnalytics,
  type AnalyticsRow,
} from "@inklee/shared/analytics";

export const runtime = "nodejs";

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
  const cutoff = analyticsCutoffIso(range);
  if (cutoff) query = query.gte("created_at", cutoff);

  const { data, error } = await query;
  if (error) return mobileError(500, error.message);
  const rows = (data ?? []) as AnalyticsRow[];

  const responseBody: MobileAnalytics = {
    range,
    ...computeAnalytics(rows),
  };
  return mobileOk(responseBody);
}
