import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { customerLabel } from "@/lib/booking-domain";
import { formatSize } from "@/lib/booking-schema";
import type { MobileBookingDetail } from "@inklee/shared/mobile-api";

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
  let depositRefundedAt: string | null = null;
  if (b.deposit_payment_intent_id && b.deposit_paid_at) {
    // audit_log's time column is `timestamp` (db/schema.ts auditLog), NOT
    // created_at — selecting the wrong column errors the query and silently
    // reads every refund as "not refunded" (re-arming the refund button).
    const { data: log } = await supabase
      .from("audit_log")
      .select("timestamp")
      .eq("booking_id", id)
      .eq("action", "deposit_refunded")
      .order("timestamp", { ascending: false })
      .limit(1);
    if (log && log.length > 0) {
      depositRefunded = true;
      depositRefundedAt = (log[0] as { timestamp: string }).timestamp;
    }
  }

  const body: MobileBookingDetail = {
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
            refundedAt: depositRefundedAt,
          }
        : null,
  };
  return mobileOk(body);
}

// PATCH /api/mobile/bookings/:id — edit appointment fields (artist-authored or
// any booking). Ports editAppointmentAction: updates handle/email/date +
// placement/size/description in form_data, writes the audit row. RLS-scoped.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const { data: booking } = await supabase
    .from("booking_requests")
    .select("artist_id, status, form_data")
    .eq("id", id)
    .single();
  if (!booking || booking.artist_id !== userId) {
    return mobileError(404, "Booking not found.", "not_found");
  }
  // Appointment editing is an approved-booking surface (the web drawer and the
  // mobile Edit link both only exist there). Refusing other statuses keeps a
  // raw API call from rewriting a terminal or deposit-pending booking's fields.
  if (booking.status !== "approved") {
    return mobileError(409, "Only accepted appointments can be edited.");
  }
  const fd = (booking.form_data ?? {}) as Record<string, string>;

  const handle = String(raw.handle ?? "")
    .replace(/^@/, "")
    .trim();
  const date = String(raw.date ?? "").trim();
  const placement = String(raw.placement ?? "").trim();
  const size = String(raw.size ?? "").trim();
  const description = String(raw.description ?? "").trim();
  const email = (raw.email ? String(raw.email).trim() : "") || null;

  if (!handle) return mobileError(400, "Instagram handle is required.");
  if (!date) return mobileError(400, "Date is required.");
  if (!placement) return mobileError(400, "Placement is required.");
  if (!size) return mobileError(400, "Size is required.");

  const { error } = await supabase
    .from("booking_requests")
    .update({
      customer_handle: handle,
      customer_email: email,
      preferred_date: date,
      form_data: { ...fd, placement, size, description },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return mobileError(500, error.message);

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "booking_edited",
    actor: userId,
    details: { by: "artist" },
  });

  return mobileOk({ id });
}
