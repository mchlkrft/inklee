import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { customerLabel } from "@/lib/booking-domain";
import { formatSize } from "@/lib/booking-schema";
import { editAppointmentCore } from "@/lib/server/bookings";
import { depositState, isDepositRefunded } from "@/lib/deposit-state";
import { formatCustomAnswer, type CustomFieldType } from "@/lib/custom-fields";
import { describeBookingActivity } from "@inklee/shared/booking-activity";
import type {
  MobileBookingDetail,
  MobileBookingImage,
  MobileBookingTimelineEvent,
  MobileImageAnnotation,
} from "@inklee/shared/mobile-api";

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
  booking_images:
    | {
        storage_path: string;
        annotations: unknown;
        width: number | null;
        height: number | null;
      }[]
    | null;
};

// The annotations column holds whatever the public booking form sent (the
// write path only checks Array.isArray), so each item must be validated before
// it ships to the device — a crafted submission with a non-string comment
// would otherwise crash the artist's lightbox render.
function sanitizeAnnotations(raw: unknown): MobileImageAnnotation[] | null {
  if (!Array.isArray(raw)) return null;
  const clean = raw.flatMap((a): MobileImageAnnotation[] => {
    if (typeof a !== "object" || a === null) return [];
    const { id, x, y, comment } = a as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      typeof comment !== "string" ||
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return [];
    }
    return [
      {
        id,
        comment,
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      },
    ];
  });
  return clean.length > 0 ? clean : null;
}

// The custom_answers blob is whatever the public booking form wrote (validated
// at submit, but defensively re-checked here). Each answer is formatted
// SERVER-SIDE because formatCustomAnswer uses Intl for date fields, which Hermes
// iOS lacks; malformed entries are dropped rather than shipped to the device.
function readCustomAnswers(
  formData: unknown,
): { label: string; value: string }[] {
  const raw = (formData as Record<string, unknown> | null)?.custom_answers;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a): { label: string; value: string }[] => {
    if (typeof a !== "object" || a === null) return [];
    const { key, label, type, value } = a as Record<string, unknown>;
    if (
      typeof key !== "string" ||
      typeof label !== "string" ||
      typeof type !== "string" ||
      (typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean")
    ) {
      return [];
    }
    return [
      {
        label,
        value: formatCustomAnswer({
          key,
          label,
          type: type as CustomFieldType,
          value,
        }),
      },
    ];
  });
}

// GET /api/mobile/bookings/:id — full request detail (the core screen).
// Reference images are signed server-side (1h TTL) exactly like the web detail
// page; the RLS-scoped client passes the bookings_owner_select storage policy.
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
      "id, status, customer_handle, customer_email, preferred_date, form_data, created_at, deposit_amount, deposit_currency, deposit_due_at, deposit_note, deposit_paid_at, deposit_payment_intent_id, booking_images(storage_path, annotations, width, height)",
    )
    .eq("id", id)
    .eq("artist_id", userId)
    .single();

  if (error || !data)
    return mobileError(404, "Booking not found.", "not_found");
  const b = data as unknown as BookingDetail;
  const fd = b.form_data ?? {};

  // One audit-log read feeds BOTH the activity timeline and the refund state,
  // mirroring the web detail page's query exactly (newest-first, capped 30).
  // audit_log's time column is `timestamp` (db/schema.ts auditLog), NOT
  // created_at — selecting the wrong column errors the query and silently
  // reads every refund as "not refunded" (re-arming the refund button).
  const { data: log } = await supabase
    .from("audit_log")
    .select("action, timestamp, details")
    .eq("booking_id", id)
    .order("timestamp", { ascending: false })
    .limit(30);
  const auditRows = (log ?? []) as {
    action: string;
    timestamp: string;
    details: Record<string, unknown> | null;
  }[];

  // Labels resolve server-side via the shared describe helper; raw `details`
  // never ship to the device (they can carry IPs, token hashes and Stripe
  // internals). Stays newest-first; clients must not re-sort.
  const timeline: MobileBookingTimelineEvent[] = auditRows.flatMap((r) => {
    const d = describeBookingActivity(r.action, r.details ?? {});
    return d
      ? [{ action: r.action, kind: d.kind, label: d.label, at: r.timestamp }]
      : [];
  });

  // RS-6: refund state is derived from the audit log (no dedicated column). The
  // paid-card gate (intent + paid) lives in the shared `isDepositRefunded` so
  // the web detail page, this route, and the deposits overview all classify
  // refunds identically.
  const refundRow = auditRows.find((r) => r.action === "deposit_refunded");
  const depositRefunded = isDepositRefunded(b, !!refundRow);
  const depositRefundedAt = depositRefunded
    ? (refundRow?.timestamp ?? null)
    : null;

  // Batch-sign the private-bucket reference images (one storage round-trip;
  // createSignedUrls preserves input order). Entries whose file is gone (the
  // stale-booking cleanup job) sign to null and are dropped, never a 500. A
  // wholesale storage failure is logged and yields an empty list; the app
  // falls back to the referenceImagePaths count notice in that case.
  const images = b.booking_images ?? [];
  let referenceImages: MobileBookingImage[] = [];
  if (images.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from("bookings")
      .createSignedUrls(
        images.map((i) => i.storage_path),
        3600,
      );
    if (signError) {
      console.error("mobile booking detail: signing reference images failed", {
        bookingId: id,
        error: signError.message,
      });
    }
    referenceImages = images.flatMap((img, i) => {
      const url = signed?.[i]?.signedUrl;
      if (!url) return [];
      return [
        {
          url,
          width: img.width ?? null,
          height: img.height ?? null,
          annotations: sanitizeAnnotations(img.annotations),
        },
      ];
    });
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
    customAnswers: readCustomAnswers(b.form_data),
    referenceLink: fd.reference_link ?? null,
    referenceImagePaths: images.map((i) => i.storage_path),
    referenceImages,
    timeline,
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
            // Same classifier the deposits overview uses, so the detail card and
            // the overview can never disagree on this booking's deposit state.
            state: depositState(b, !!refundRow, Date.now(), b.status),
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

  // Delegate to the shared core (the SAME path the web calendar drawer calls)
  // so the approved-only status gate + required-field validation live in one
  // place. The core normalizes (strips a leading @, trims) and validates.
  const result = await editAppointmentCore(supabase, userId, id, {
    handle: String(raw.handle ?? ""),
    email: raw.email != null ? String(raw.email) : null,
    date: String(raw.date ?? ""),
    placement: String(raw.placement ?? ""),
    size: String(raw.size ?? ""),
    description: String(raw.description ?? ""),
  });
  if ("error" in result) {
    const status =
      result.errorCode === "not_found" || result.error === "Booking not found."
        ? 404
        : 400;
    return mobileError(status, result.error, result.errorCode ?? "error");
  }
  return mobileOk({ id });
}
