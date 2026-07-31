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
import { getArtistHubAnalytics } from "@/lib/server/artist-analytics-query";
import { getArtistFeeSavings } from "@/lib/server/fee-savings-query";
import type { HubAnalyticsRange } from "@inklee/shared/artist-analytics";

export const runtime = "nodejs";

// GET /api/mobile/analytics?range=30|90|all — headline booking metrics + hub.
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

  const hubRange: HubAnalyticsRange =
    range === "30" ? "30" : range === "90" ? "90" : "all";
  const hubAnalytics = await getArtistHubAnalytics(userId, hubRange);

  const savingsRange = range === "30" ? 30 : range === "90" ? 90 : null;
  const feeSavings = await getArtistFeeSavings(userId, savingsRange);

  const responseBody: MobileAnalytics = {
    range,
    ...computeAnalytics(rows),
    hubAnalytics: hubAnalytics ?? undefined,
    feeSavings: feeSavings ?? undefined,
  };
  return mobileOk(responseBody);
}
