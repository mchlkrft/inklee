import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { customerLabel } from "@/lib/booking-domain";
import { formatSize } from "@/lib/booking-schema";

export const runtime = "nodejs";

const ALLOWED_STATUS = new Set([
  "pending",
  "approved",
  "rejected",
  "deposit_pending",
  "cancelled",
]);

type BookingRow = {
  id: string;
  status: string;
  customer_handle: string | null;
  customer_email: string | null;
  preferred_date: string | null;
  form_data: Record<string, string> | null;
  created_at: string;
  deposit_amount: string | number | null;
  deposit_currency: string | null;
  deposit_paid_at: string | null;
};

// GET /api/mobile/bookings?status=&cursor=&limit= — the booking inbox.
// Keyset-paginated by created_at (descending). RLS scopes to the artist.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const cursor = url.searchParams.get("cursor"); // created_at ISO of the last item
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
    50,
  );

  let query = supabase
    .from("booking_requests")
    .select(
      "id, status, customer_handle, customer_email, preferred_date, form_data, created_at, deposit_amount, deposit_currency, deposit_paid_at",
    )
    .eq("artist_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit + 1); // fetch one extra to detect "has more"

  if (status && ALLOWED_STATUS.has(status)) query = query.eq("status", status);
  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error) return mobileError(500, error.message);

  const rows = (data ?? []) as BookingRow[];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  const items = page.map((b) => {
    const fd = b.form_data ?? {};
    return {
      id: b.id,
      status: b.status,
      client: customerLabel(b.customer_handle, b.customer_email),
      placement: fd.placement ?? null,
      size: fd.size ? formatSize(fd.size) : null,
      preferredDate: b.preferred_date,
      createdAt: b.created_at,
      depositAmount: b.deposit_amount != null ? Number(b.deposit_amount) : null,
      depositCurrency: b.deposit_currency ?? "eur",
      depositPaid: !!b.deposit_paid_at,
    };
  });

  return mobileOk({
    items,
    nextCursor: hasMore ? page[page.length - 1].created_at : null,
  });
}
