import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentRequestStatus } from "@inklee/shared/appointment-payments";

// THE READ LAYER for appointment payments (P9 follow-on, GC-independent).
//
// Until now every export in appointment-payments.ts was a WRITE: an artist (or
// the app) could create/revise/send/cancel a payment request but had no way to
// LIST or READ back what they created. This is that missing half, kept separate
// from the write cores because it is RLS-SCOPED to the caller's own client
// rather than service-role: payment_requests / payment_request_lines both carry
// an `artist_id = auth.uid()` SELECT policy (0125), so the passed client (web
// cookie or mobile JWT) already enforces ownership. The explicit
// `.eq("artist_id", artistId)` is belt-and-suspenders, and it also makes the
// query use the (artist_id, status, created_at) index.

export type PaymentRequestSummary = {
  id: string;
  status: PaymentRequestStatus;
  /** Derived: exactly one of booking_id / project_id is set (0125 check). */
  subject: "appointment" | "project";
  bookingId: string | null;
  projectId: string | null;
  currency: string;
  totalMinor: number;
  revision: number;
  /** Whether a client payment link has been issued (the request was sent). */
  linkSent: boolean;
  createdAt: string;
  sentAt: string | null;
  /** FD12: exposed so a caller with no OTHER way to read this frozen-set
   *  column (the native app, which has no raw table access) can prefill a
   *  revise form. The web revise page reads it separately, through its own
   *  RLS-scoped client; this is additive, not a replacement for that. */
  collects: string;
};

export type PaymentRequestLineView = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unitAmountMinor: number;
  lineTotalMinor: number;
  classification: string;
  refundStatus: string;
  position: number;
};

export type PaymentRequestDetail = PaymentRequestSummary & {
  lines: PaymentRequestLineView[];
};

const SUMMARY_COLS =
  "id, status, booking_id, project_id, currency, total_minor, revision, sent_at, created_at, collects";

function toSummary(row: Record<string, unknown>): PaymentRequestSummary {
  const bookingId = (row.booking_id as string | null) ?? null;
  return {
    id: row.id as string,
    status: row.status as PaymentRequestStatus,
    subject: bookingId ? "appointment" : "project",
    bookingId,
    projectId: (row.project_id as string | null) ?? null,
    currency: (row.currency as string) ?? "eur",
    totalMinor: Number(row.total_minor ?? 0),
    revision: Number(row.revision ?? 1),
    linkSent: Boolean(row.sent_at),
    createdAt: row.created_at as string,
    sentAt: (row.sent_at as string | null) ?? null,
    collects: (row.collects as string | null) ?? "deposit",
  };
}

function toLineView(row: Record<string, unknown>): PaymentRequestLineView {
  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    description: (row.description as string | null) ?? null,
    quantity: Number(row.quantity ?? 1),
    unitAmountMinor: Number(row.unit_amount_minor ?? 0),
    lineTotalMinor: Number(row.line_total_minor ?? 0),
    classification: (row.classification as string) ?? "unspecified",
    refundStatus: (row.refund_status as string) ?? "none",
    position: Number(row.position ?? 0),
  };
}

/** The artist's payment requests, newest first. Fail-loud: a read error throws
 *  rather than masquerading as an empty list (an artist must not be told they
 *  have no requests when the query failed). */
export async function listPaymentRequestsForArtist(
  supabase: SupabaseClient,
  artistId: string,
): Promise<PaymentRequestSummary[]> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select(SUMMARY_COLS)
    .eq("artist_id", artistId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Could not load payment requests: ${error.message}`);
  }
  return (data ?? []).map((r) => toSummary(r as Record<string, unknown>));
}

/** One request with its lines, or null when it does not exist / is not the
 *  artist's (RLS + the explicit artist_id filter both scope it). */
export async function getPaymentRequestForArtist(
  supabase: SupabaseClient,
  artistId: string,
  requestId: string,
): Promise<PaymentRequestDetail | null> {
  const { data: row, error } = await supabase
    .from("payment_requests")
    .select(SUMMARY_COLS)
    .eq("artist_id", artistId)
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not load the payment request: ${error.message}`);
  }
  if (!row) return null;

  const { data: lineRows, error: lineErr } = await supabase
    .from("payment_request_lines")
    .select(
      "id, name, description, quantity, unit_amount_minor, line_total_minor, classification, refund_status, position",
    )
    .eq("artist_id", artistId)
    .eq("request_id", requestId)
    .order("position", { ascending: true });
  if (lineErr) {
    throw new Error(
      `Could not load the payment request lines: ${lineErr.message}`,
    );
  }

  return {
    ...toSummary(row as Record<string, unknown>),
    lines: (lineRows ?? []).map((l) =>
      toLineView(l as Record<string, unknown>),
    ),
  };
}
