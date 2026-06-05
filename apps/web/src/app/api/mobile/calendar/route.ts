import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { customerLabel } from "@/lib/booking-domain";

export const runtime = "nodejs";

type Row = {
  id: string;
  customer_handle: string | null;
  customer_email: string | null;
  preferred_date: string | null;
  form_data: Record<string, string> | null;
};

// GET /api/mobile/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — confirmed
// appointments (approved bookings with a date) in the range. Both bounds
// optional. (Slots/holds are a later addition.)
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = supabase
    .from("booking_requests")
    .select("id, customer_handle, customer_email, preferred_date, form_data")
    .eq("artist_id", userId)
    .eq("status", "approved")
    .not("preferred_date", "is", null)
    .order("preferred_date", { ascending: true });
  if (from) query = query.gte("preferred_date", from);
  if (to) query = query.lte("preferred_date", to);

  const { data, error } = await query;
  if (error) return mobileError(500, error.message);

  const items = ((data ?? []) as Row[]).map((b) => {
    const fd = b.form_data ?? {};
    return {
      id: b.id,
      client: customerLabel(b.customer_handle, b.customer_email),
      placement: fd.placement ?? null,
      date: b.preferred_date,
    };
  });

  return mobileOk({ items });
}
