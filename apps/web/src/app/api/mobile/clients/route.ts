import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import type { MobileClientListItem } from "@inklee/shared/mobile-api";
import {
  aggregateClients,
  type ClientBookingRow,
} from "@inklee/shared/clients";

export const runtime = "nodejs";

// GET /api/mobile/clients — unique clients derived from booking_requests
// (grouped by email), newest first. Shares aggregateClients with the web view.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("booking_requests")
    .select("customer_email, customer_handle, status, created_at")
    .eq("artist_id", userId)
    .not("customer_email", "is", null)
    .order("created_at", { ascending: false });
  if (error) return mobileError(500, error.message);

  const body: { items: MobileClientListItem[] } = {
    items: aggregateClients((data ?? []) as ClientBookingRow[]),
  };
  return mobileOk(body);
}
