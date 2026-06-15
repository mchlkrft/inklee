import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { getDepositsOverview } from "@/lib/server/deposits";

export const runtime = "nodejs";

// GET /api/mobile/bookings/deposits — the cross-booking deposits overview. The
// query + classification + rollups live in the shared getDepositsOverview
// (apps/web/src/lib/server/deposits.ts), consumed by BOTH this route and the web
// /bookings/deposits page so the two surfaces can never disagree
// (one-source-of-truth). RLS scopes everything to the artist via the client.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  try {
    const body = await getDepositsOverview(supabase, userId);
    return mobileOk(body);
  } catch (e) {
    return mobileError(500, e instanceof Error ? e.message : "Failed to load.");
  }
}
