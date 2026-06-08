import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { customerLabel } from "@/lib/booking-domain";
import { formatSize } from "@/lib/booking-schema";
import type {
  MobileClientDetail,
  MobileClientHistoryItem,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

type HistRow = {
  id: string;
  status: string;
  preferred_date: string | null;
  created_at: string;
  form_data: Record<string, string> | null;
  deposit_amount: string | number | null;
  customer_handle: string | null;
  customer_email: string | null;
};

// GET /api/mobile/clients/:email — one client's booking history + notes.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { email } = await params;
  const decoded = decodeURIComponent(email);

  const [histRes, notesRes] = await Promise.all([
    supabase
      .from("booking_requests")
      .select(
        "id, status, preferred_date, created_at, form_data, deposit_amount, customer_handle, customer_email",
      )
      .eq("artist_id", userId)
      .eq("customer_email", decoded)
      .order("created_at", { ascending: false }),
    supabase
      .from("client_notes")
      .select("notes")
      .eq("artist_id", userId)
      .eq("customer_email", decoded)
      .maybeSingle(),
  ]);

  if (histRes.error) return mobileError(500, histRes.error.message);
  const rows = (histRes.data ?? []) as HistRow[];
  if (rows.length === 0)
    return mobileError(404, "Client not found.", "not_found");

  const body: MobileClientDetail = {
    email: decoded,
    client: customerLabel(rows[0].customer_handle, rows[0].customer_email),
    notes: (notesRes.data?.notes as string | undefined) ?? null,
    bookingCount: rows.length,
    history: rows.map((r): MobileClientHistoryItem => {
      const fd = r.form_data ?? {};
      return {
        id: r.id,
        status: r.status,
        placement: fd.placement ?? null,
        size: fd.size ? formatSize(fd.size) : null,
        preferredDate: r.preferred_date,
        createdAt: r.created_at,
        depositAmount:
          r.deposit_amount != null ? Number(r.deposit_amount) : null,
      };
    }),
  };
  return mobileOk(body);
}
