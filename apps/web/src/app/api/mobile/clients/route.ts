import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import type { MobileClientListItem } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

type Row = {
  customer_email: string | null;
  customer_handle: string | null;
  status: string;
  created_at: string;
};

// GET /api/mobile/clients — unique clients derived from booking_requests
// (grouped by email), newest first. Mirrors the web clients view.
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

  const map = new Map<string, MobileClientListItem>();
  for (const b of (data ?? []) as Row[]) {
    const email = b.customer_email as string;
    const existing = map.get(email);
    if (!existing) {
      map.set(email, {
        email,
        handle: b.customer_handle ?? "",
        bookingCount: 1,
        lastBookingAt: b.created_at,
        latestStatus: b.status,
      });
    } else {
      existing.bookingCount++;
    }
  }

  const body: { items: MobileClientListItem[] } = {
    items: [...map.values()],
  };
  return mobileOk(body);
}
