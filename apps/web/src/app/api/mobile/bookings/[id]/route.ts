import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { customerLabel } from "@/lib/booking-domain";
import { formatSize } from "@/lib/booking-schema";

export const runtime = "nodejs";

type BookingDetail = {
  id: string;
  status: string;
  customer_handle: string | null;
  customer_email: string | null;
  preferred_date: string | null;
  form_data: Record<string, string> | null;
  created_at: string;
  deposit_amount: string | number | null;
  deposit_currency: string | null;
  deposit_due_at: string | null;
  deposit_note: string | null;
  deposit_paid_at: string | null;
  deposit_payment_intent_id: string | null;
  booking_images: { storage_path: string }[] | null;
};

// GET /api/mobile/bookings/:id — full request detail (the core screen).
// Reference-image *paths* are returned for now; signed URLs are a follow-up.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { data, error } = await supabase
    .from("booking_requests")
    .select(
      "id, status, customer_handle, customer_email, preferred_date, form_data, created_at, deposit_amount, deposit_currency, deposit_due_at, deposit_note, deposit_paid_at, deposit_payment_intent_id, booking_images(storage_path)",
    )
    .eq("id", id)
    .eq("artist_id", userId)
    .single();

  if (error || !data)
    return mobileError(404, "Booking not found.", "not_found");
  const b = data as unknown as BookingDetail;
  const fd = b.form_data ?? {};

  // RS-6: refund state is derived from the audit log (no dedicated column),
  // exactly as the web detail page does. Only meaningful for a paid card
  // deposit, so we only look it up then. Gates the in-app refund button and the
  // cancel-copy so the artist isn't told a deposit will be refunded twice.
  let depositRefunded = false;
  if (b.deposit_payment_intent_id && b.deposit_paid_at) {
    const { data: log } = await supabase
      .from("audit_log")
      .select("action")
      .eq("booking_id", id)
      .eq("action", "deposit_refunded")
      .limit(1);
    depositRefunded = !!log && log.length > 0;
  }

  return mobileOk({
    id: b.id,
    status: b.status,
    client: customerLabel(b.customer_handle, b.customer_email),
    handle: b.customer_handle,
    email: b.customer_email,
    placement: fd.placement ?? null,
    size: fd.size ? formatSize(fd.size) : null,
    sizeRaw: fd.size ?? null,
    description: fd.description ?? null,
    referenceLink: fd.reference_link ?? null,
    referenceImagePaths: (b.booking_images ?? []).map((i) => i.storage_path),
    preferredDate: b.preferred_date,
    createdAt: b.created_at,
    deposit:
      b.deposit_amount != null
        ? {
            amount: Number(b.deposit_amount),
            currency: b.deposit_currency ?? "eur",
            dueAt: b.deposit_due_at,
            note: b.deposit_note,
            paid: !!b.deposit_paid_at,
            hasCardIntent: !!b.deposit_payment_intent_id,
            refunded: depositRefunded,
          }
        : null,
  });
}
