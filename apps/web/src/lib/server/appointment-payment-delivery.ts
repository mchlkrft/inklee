import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send";
import { buildEmailHtml } from "@/lib/email/booking-templates";
import {
  isPartialRefundForBuyer,
  partialRefundBuyerNotice,
} from "@/lib/server/refund-buyer-notice";

// LINK DELIVERY for appointment payment requests (Track A slice 3).
//
// `sendPaymentRequestCore` freezes a request and returns the customer token,
// but until now NOTHING delivered the /pay/<token> link to the client: the
// feature ended at "the artist holds a token". This module emails the link.
//
// Two properties are load-bearing:
//
// 1. BEST-EFFORT, NEVER A ROLLBACK. Delivery runs AFTER the send has already
//    succeeded (the request is frozen and payable). An email-provider outage
//    must not un-send a request, so a failure here reports `emailed: false`
//    rather than throwing, and the caller shows the artist the link to share
//    manually. This mirrors every other sender in lib/email.
//
// 2. THE CALLER CARRIES THE URL. The token is stored HASHED (0128), so this
//    send-time response is the only moment the plaintext link exists
//    server-side. Whatever happens to the email, `payUrl` goes back to the
//    artist so the link is never lost to them.
//
// The recipient comes from the request's subject: `booking_requests.customer_email`
// or `projects.customer_email`, read through the ARTIST'S OWN RLS-scoped client
// (both tables give the artist SELECT on their rows), so this module cannot be
// used to mail someone else's client.

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";

export function paymentRequestPayUrl(customerToken: string): string {
  return `${APP_ORIGIN}/pay/${customerToken}`;
}

export type PaymentLinkDelivery = {
  payUrl: string;
  emailed: boolean;
  /** Why the email was not sent, when it was not. `no_email` = the subject has
   *  no client email on file (e.g. an Instagram-handle-only booking); the
   *  artist shares the link themselves. `send_failed` = provider/setup error,
   *  captured to Sentry. */
  reason?: "no_email" | "send_failed";
};

function formatAmount(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

/** The client email for a request's subject (booking or project), through
 *  whatever client the caller runs as. At send time that is the artist's own
 *  RLS-scoped client; at settlement time it is the service client (webhook
 *  context has no user session), whose reads here are keyed by the ids the
 *  settlement verified against the PaymentIntent metadata + claim. */
async function resolveClientEmail(
  supabase: SupabaseClient,
  artistId: string,
  bookingId: string | null,
  projectId: string | null,
): Promise<string | null> {
  if (bookingId) {
    const { data } = await supabase
      .from("booking_requests")
      .select("customer_email")
      .eq("artist_id", artistId)
      .eq("id", bookingId)
      .maybeSingle();
    return (data?.customer_email as string | null) ?? null;
  }
  if (projectId) {
    const { data } = await supabase
      .from("projects")
      .select("customer_email")
      .eq("artist_id", artistId)
      .eq("id", projectId)
      .maybeSingle();
    return (data?.customer_email as string | null) ?? null;
  }
  return null;
}

async function resolveArtistName(
  supabase: SupabaseClient,
  artistId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", artistId)
    .maybeSingle();
  return (data?.display_name as string | null) || "Your artist";
}

/**
 * Email the /pay/<token> link to the request's client. Call AFTER a successful
 * `sendPaymentRequestCore`, with the same RLS-scoped client and the token it
 * returned.
 */
export async function deliverPaymentRequestLink(
  supabase: SupabaseClient,
  artistId: string,
  requestId: string,
  customerToken: string,
): Promise<PaymentLinkDelivery> {
  const payUrl = paymentRequestPayUrl(customerToken);

  try {
    const { data: request } = await supabase
      .from("payment_requests")
      .select("id, booking_id, project_id, total_minor, currency")
      .eq("artist_id", artistId)
      .eq("id", requestId)
      .maybeSingle();
    if (!request) return { payUrl, emailed: false, reason: "send_failed" };

    const clientEmail = await resolveClientEmail(
      supabase,
      artistId,
      (request.booking_id as string | null) ?? null,
      (request.project_id as string | null) ?? null,
    );
    if (!clientEmail || !clientEmail.includes("@")) {
      return { payUrl, emailed: false, reason: "no_email" };
    }

    const artistName = await resolveArtistName(supabase, artistId);

    const amount = formatAmount(
      Number(request.total_minor ?? 0),
      (request.currency as string) ?? "eur",
    );

    const body = `Hi,

${artistName} has sent you a payment request for ${amount}.

You can review the details and pay securely by card:

${payUrl}

This link is personal to you. If you were not expecting this, you can ignore this email.`;

    await sendEmail({
      to: clientEmail,
      subject: `Payment request from ${artistName}`,
      html: buildEmailHtml(body, {}, undefined, {
        ctaLabel: "Review and pay",
        footerNote: `Sent by Inklee on behalf of ${artistName}.`,
      }),
    });
    return { payUrl, emailed: true };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "payment_request_link_delivery" },
      extra: { requestId, artistId },
    });
    return { payUrl, emailed: false, reason: "send_failed" };
  }
}

/**
 * CLIENT RECEIPT on settlement (Track A slice 4).
 *
 * Emailed to the client when their appointment payment actually settles. Called
 * from `settlePaymentRequestSuccess` AFTER its claim gate, which returns true
 * exactly once per collection (a webhook redelivery loses the claim and never
 * reaches this), so the once-only property is inherited rather than re-invented.
 * Both settlement callers (the Stripe webhook and the reconciliation backstop)
 * therefore produce a receipt, whichever one lands the claim.
 *
 * BEST-EFFORT: a receipt failure must never fail the settlement (the money HAS
 * moved; refusing to record that because an email bounced would be backwards).
 * Failures go to Sentry and return false. Runs on the service client (webhook
 * context has no user session); the ids come from the settlement's own verified
 * metadata + claim, not from any client input.
 */
export async function sendPaymentReceiptEmail(
  supabase: SupabaseClient,
  args: {
    artistId: string;
    requestId: string;
    bookingId: string | null;
    projectId: string | null;
    amountMinor: number;
    currency: string;
    paidAt: string;
  },
): Promise<boolean> {
  try {
    const clientEmail = await resolveClientEmail(
      supabase,
      args.artistId,
      args.bookingId,
      args.projectId,
    );
    if (!clientEmail || !clientEmail.includes("@")) return false;

    const artistName = await resolveArtistName(supabase, args.artistId);
    const amount = formatAmount(args.amountMinor, args.currency);
    const paidDate = args.paidAt.slice(0, 10);

    const body = `Hi,

This confirms your payment of ${amount} to ${artistName}.

Paid on ${paidDate}.

Keep this email as your receipt. If anything looks wrong, contact ${artistName} directly.`;

    await sendEmail({
      to: clientEmail,
      subject: `Your payment to ${artistName}`,
      html: buildEmailHtml(body, {}, undefined, {
        footerNote: `Sent by Inklee on behalf of ${artistName}.`,
      }),
    });
    return true;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "payment_receipt_email" },
      extra: { requestId: args.requestId, artistId: args.artistId },
    });
    return false;
  }
}

/**
 * REFUND CONFIRMATION (FD12: the founder's list names "buyer confirmation" as
 * a required behaviour, matching `sendPaymentReceiptEmail`'s existing pattern
 * for the collection side). Called from `refundPaymentRequestCore` after
 * Stripe has confirmed the refund; best-effort for the same reason a receipt
 * is: the money has already moved, so a bounced email is a delivery gap, not
 * a reason to report the refund as failed.
 */
export async function sendRefundConfirmationEmail(
  supabase: SupabaseClient,
  args: {
    artistId: string;
    requestId: string;
    bookingId: string | null;
    projectId: string | null;
    refundedMinor: number;
    remainingRefundableMinor: number;
    currency: string;
    /** C1.8: the named lines THIS refund covered (by-line refunds only).
     *  Empty for a full/bare-amount refund — the notice falls back to
     *  counsel's "part of your order" wording, or is not needed at all when
     *  the refund is not partial (see isPartialRefundForBuyer). */
    lineNames?: string[];
  },
): Promise<boolean> {
  try {
    const clientEmail = await resolveClientEmail(
      supabase,
      args.artistId,
      args.bookingId,
      args.projectId,
    );
    if (!clientEmail || !clientEmail.includes("@")) return false;

    const artistName = await resolveArtistName(supabase, args.artistId);
    const amount = formatAmount(args.refundedMinor, args.currency);

    // C1.8: a refund that leaves a remaining balance gets counsel's verbatim
    // partial-refund paragraph instead of the plain full-refund wording — see
    // refund-buyer-notice.ts's own doc comment for why this is exactly
    // `remainingRefundableMinor > 0` and not a check on `refundType`.
    const mainParagraph = isPartialRefundForBuyer(args.remainingRefundableMinor)
      ? partialRefundBuyerNotice({
          amountLabel: amount,
          lineNames: args.lineNames ?? [],
        })
      : `${artistName} has refunded ${amount} to your original payment method.\n\nRefunds typically appear on your statement within 5 to 10 business days, depending on your bank.`;

    const body = `Hi,

${mainParagraph}

If anything looks wrong, contact ${artistName} directly.`;

    await sendEmail({
      to: clientEmail,
      subject: `Refund from ${artistName}`,
      html: buildEmailHtml(body, {}, undefined, {
        footerNote: `Sent by Inklee on behalf of ${artistName}.`,
      }),
    });
    return true;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "payment_refund_confirmation_email" },
      extra: { requestId: args.requestId, artistId: args.artistId },
    });
    return false;
  }
}
