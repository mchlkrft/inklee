import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send";
import { buildEmailHtml } from "@/lib/email/booking-templates";

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

    let clientEmail: string | null = null;
    if (request.booking_id) {
      const { data: booking } = await supabase
        .from("booking_requests")
        .select("customer_email")
        .eq("artist_id", artistId)
        .eq("id", request.booking_id)
        .maybeSingle();
      clientEmail = (booking?.customer_email as string | null) ?? null;
    } else if (request.project_id) {
      const { data: project } = await supabase
        .from("projects")
        .select("customer_email")
        .eq("artist_id", artistId)
        .eq("id", request.project_id)
        .maybeSingle();
      clientEmail = (project?.customer_email as string | null) ?? null;
    }

    if (!clientEmail || !clientEmail.includes("@")) {
      return { payUrl, emailed: false, reason: "no_email" };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", artistId)
      .maybeSingle();
    const artistName =
      (profile?.display_name as string | null) || "Your artist";

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
