import { serviceClient } from "@/lib/supabase/service";
import { sendEmail } from "./send";
import {
  DEFAULT_BODIES,
  DEFAULT_SUBJECTS,
  TemplateVars,
  buildEmailHtml,
  substituteVars,
  type EmailGoodsDecision,
} from "./booking-templates";
import type { CustomAnswerSnapshot } from "@/lib/custom-fields";
import {
  buildOrderReceiptBody,
  summarizeReturnDisclosure,
  type CompleteSellerData,
  type ReturnDisclosureItem,
} from "@inklee/shared/consumer-disclosures";
import { receiptTermsSection } from "@/lib/legal/receipt-terms";

type EmailType =
  | "customer_booking_submitted"
  | "customer_booking_approved"
  | "customer_booking_rejected"
  | "customer_booking_cancelled_by_artist"
  | "artist_new_booking_request";

// Warmer, action-specific button labels per email type (used for the link
// button). Types without a link (rejected/cancelled) are omitted.
const CTA_LABELS: Partial<Record<EmailType, string>> = {
  customer_booking_submitted: "View my request",
  customer_booking_approved: "View my booking",
  artist_new_booking_request: "Open bookings",
};

export async function sendBookingEmail({
  type,
  to,
  artistId,
  vars,
  customAnswers,
  studio,
  goodsDecisions,
}: {
  type: EmailType;
  to: string;
  artistId: string;
  vars: TemplateVars;
  customAnswers?: CustomAnswerSnapshot[];
  studio?: {
    name: string;
    address: string | null;
    mapsUrl: string | null;
  } | null;
  goodsDecisions?: EmailGoodsDecision[] | null;
}): Promise<void> {
  try {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("settings")
      .eq("id", artistId)
      .single();

    const settings = (profile?.settings ?? {}) as Record<string, unknown>;
    const disabled: string[] = Array.isArray(settings.disabled_emails)
      ? (settings.disabled_emails as string[])
      : [];
    if (disabled.includes(type)) return;

    // Fetch custom template if the artist has saved one
    const { data: custom } = await serviceClient
      .from("email_templates")
      .select("subject, body")
      .eq("artist_id", artistId)
      .eq("type", type)
      .single();

    const body = custom?.body ?? DEFAULT_BODIES[type] ?? "";
    const subjectTemplate =
      custom?.subject ?? DEFAULT_SUBJECTS[type] ?? "inklee";
    // Clients may give Instagram OR email, so a handle isn't guaranteed. Fall
    // back to a friendly name (customer greeting -> "there", artist notices ->
    // "a new client") so an email never renders "Hi ," or a bare "@".
    const rawHandle = (vars.customer_handle ?? "").trim();
    const displayVars: TemplateVars = {
      ...vars,
      customer_handle:
        rawHandle || (type.startsWith("customer_") ? "there" : "a new client"),
    };
    const subject = substituteVars(subjectTemplate, displayVars);
    const html = buildEmailHtml(body, displayVars, customAnswers, {
      ctaLabel: CTA_LABELS[type],
      studio,
      goodsDecisions,
    });

    await sendEmail({ to, subject, html });
  } catch (err) {
    // Emails are best-effort — log and continue, never block the state change
    console.error(`[email] failed to send ${type}:`, err);
  }
}

export async function sendWaitlistConfirmation({
  to,
  artistName,
}: {
  to: string;
  artistName: string;
}): Promise<void> {
  try {
    const body = `Hi,

You're on the waitlist for ${artistName}.

We'll email you when there's an opening.

Inklee`;
    const { buildEmailHtml: build } = await import("./booking-templates");
    await sendEmail({
      to,
      subject: `You're on the waitlist for ${artistName}`,
      html: build(body, {}),
    });
  } catch (err) {
    console.error("[email] failed to send waitlist confirmation:", err);
  }
}

export async function sendWaitlistConversionEmail({
  to,
  artistName,
  magicLink,
  customerHandle,
}: {
  to: string;
  artistName: string;
  magicLink: string;
  customerHandle: string;
}): Promise<void> {
  try {
    const body = `Hi @${customerHandle},

Good news. ${artistName} has a spot for you.

Use the link below to view your booking details. It's valid for 30 days.

${magicLink}`;
    const { buildEmailHtml: build } = await import("./booking-templates");
    await sendEmail({
      to,
      subject: `${artistName} has a spot for you`,
      html: build(body, {}, undefined, { ctaLabel: "View my booking" }),
    });
  } catch (err) {
    console.error("[email] failed to send waitlist conversion email:", err);
  }
}

// Goods order confirmation (Slice 75) — sent to the customer after a combined
// deposit + goods payment succeeds. Standalone (not artist-customisable),
// built on the shared branded HTML wrapper. No em-dashes in customer copy.
//
// GOODS-DISC-001: this add-on order sells the SAME custom_made-capable
// catalogue as the standalone shop, so its receipt needs the SAME C1.1/C1.3
// durable-record content the standalone shop's receipt already has
// (buildOrderReceiptBody) — a bare item/total list, with no seller identity
// and no return-right disclosure, is exactly the gap GOODS-DISC-001 named.
// `seller` is REQUIRED (not optional): the money path (prepareCheckoutAction,
// via addonGoodsSellerGate) refuses to create goods lines at all when the
// artist's seller data is incomplete, so a call reaching here with goods
// lines always has complete seller data by construction; a caller that
// somehow violates that invariant should fail loud rather than send a
// receipt silently missing its required disclosures.
export async function sendGoodsOrderConfirmation({
  to,
  artistName,
  lines,
  total,
  currency,
  seller,
  supportEmail,
}: {
  to: string;
  artistName: string;
  lines: {
    title: string;
    variant: string | null;
    quantity: number;
    total: number;
    customMade: boolean;
  }[];
  total: number;
  currency: string;
  seller: CompleteSellerData;
  supportEmail: string;
}): Promise<void> {
  try {
    const code = currency.toUpperCase();
    const disclosure = summarizeReturnDisclosure(
      lines.map((l): ReturnDisclosureItem => ({ customMade: l.customMade })),
    );
    const terms = receiptTermsSection();
    if (terms.error) {
      console.error(
        "[email] goods order confirmation sent without inline Terms text:",
        terms.error,
      );
    }
    const body = buildOrderReceiptBody({
      artistName,
      seller,
      supportEmail,
      // Q4: the per-line custom-made snapshot travels into the receipt so the
      // durable record MARKS the exempt lines. Without it the mixed-basket
      // lead-in ("Some items in your order are custom-made") is a blanket
      // claim over an unidentified subset, and the seller block's own
      // 'Items marked "custom-made"' sentence points at marks that are not
      // there.
      items: lines.map((l) => ({
        title: l.title,
        variant: l.variant,
        quantity: l.quantity,
        customMade: l.customMade,
      })),
      totalLabel: `${code} ${total.toFixed(2)}`,
      disclosure,
      // COUNSEL Q6(b), 2026-08-02: this receipt carried NO Terms text at all,
      // which counsel calls "non-compliant on its face" and NOT cured by the
      // buyer having accepted terms at checkout. Same helper the standalone
      // shop's receipt reads, so the two lanes reproduce the same document.
      termsSection: terms.section,
      fulfillmentNote:
        "Your goods will be waiting for you at your appointment.",
    });
    const { buildEmailHtml: build } = await import("./booking-templates");
    await sendEmail({
      to,
      subject: `Your goods are reserved with ${artistName}`,
      html: build(body, {}),
    });
  } catch (err) {
    console.error("[email] failed to send goods order confirmation:", err);
  }
}

// Deposit requested — sent to the customer when the artist requests a deposit,
// carrying a fresh magic link to the payment page. Standalone (not artist-
// customisable in v1). No em-dashes in customer copy.
export async function sendDepositRequestedEmail({
  to,
  artistName,
  customerHandle,
  amountEur,
  currency = "eur",
  dueDate,
  depositNote,
  magicLink,
}: {
  to: string;
  artistName: string;
  customerHandle: string;
  amountEur: number;
  currency?: string;
  dueDate: string | null;
  depositNote: string | null;
  magicLink: string;
}): Promise<void> {
  try {
    const handle = customerHandle ? `@${customerHandle}` : "there";
    const dueLine = dueDate ? `\nPlease pay by ${dueDate}.` : "";
    const noteLine = depositNote ? `\n\n${depositNote}` : "";
    const body = `Hi ${handle},

You recently sent a booking request to ${artistName} on Inklee. To confirm your appointment, ${artistName} has asked for a deposit.

Deposit due: ${currency.toUpperCase()} ${amountEur.toFixed(2)}${dueLine}${noteLine}

Payments are processed securely by Stripe, and the deposit goes directly to ${artistName}'s account. You pay exactly the deposit amount, with no added fees.

Pay your deposit through the link below. It is valid for 30 days:
${magicLink}

Inklee`;
    const { buildEmailHtml: build } = await import("./booking-templates");
    await sendEmail({
      to,
      subject: `Pay your deposit to confirm with ${artistName}`,
      html: build(body, {}, undefined, {
        ctaLabel: "Pay your deposit",
        footerNote: `Sent by Inklee on behalf of ${artistName}.`,
      }),
    });
  } catch (err) {
    console.error("[email] failed to send deposit requested email:", err);
  }
}

// Deposit paid — sent to the ARTIST when a customer's deposit (+ any goods)
// payment succeeds. Standalone system email. No em-dashes in copy.
export async function sendArtistDepositPaidEmail({
  artistEmail,
  customerHandle,
  amountEur,
  currency = "eur",
  goodsLines,
  goodsTotal,
  placement,
  date,
}: {
  artistEmail: string;
  customerHandle: string;
  amountEur: number;
  currency?: string;
  goodsLines: {
    title: string;
    variant: string | null;
    quantity: number;
    total: number;
  }[];
  goodsTotal: number;
  placement: string;
  date: string;
}): Promise<void> {
  try {
    // P0-6: honour the artist's settlement currency for goods lines too, like
    // the deposit line below. The webhook passes the real intent.currency.
    const code = currency.toUpperCase();
    const goodsBlock =
      goodsLines.length > 0
        ? `\n\nGoods reserved for pickup:\n${goodsLines
            .map(
              (l) =>
                `- ${l.title}${l.variant ? ` (${l.variant})` : ""} x${l.quantity}: ${code} ${l.total.toFixed(2)}`,
            )
            .join("\n")}\nGoods total: ${code} ${goodsTotal.toFixed(2)}`
        : "";
    const body = `${customerHandle} paid their deposit. The booking is confirmed.

Deposit: ${currency.toUpperCase()} ${amountEur.toFixed(2)}${placement ? `\nPlacement: ${placement}` : ""}${date ? `\nDate: ${date}` : ""}${goodsBlock}

Open Bookings:
https://inklee.app/bookings/overview`;
    const { buildEmailHtml: build } = await import("./booking-templates");
    await sendEmail({
      to: artistEmail,
      subject:
        goodsLines.length > 0
          ? `${customerHandle} paid their deposit and reserved goods`
          : `${customerHandle} paid their deposit`,
      html: build(body, {}, undefined, { ctaLabel: "Open bookings" }),
    });
  } catch (err) {
    console.error("[email] failed to send artist deposit-paid email:", err);
  }
}

// Q9 durable medium: deposit receipt to the CLIENT when their in-app deposit
// succeeds. Carries the booking reference, the amount, and the snapshotted
// deposit policy (as it stood when they paid). Standalone system email, not
// artist-customisable. No em-dashes in copy.
export async function sendClientDepositReceiptEmail({
  to,
  artistName,
  customerHandle,
  amountEur,
  currency = "eur",
  bookingRef,
  policySnapshot,
}: {
  to: string;
  artistName: string;
  customerHandle: string;
  amountEur: number;
  currency?: string;
  bookingRef: string;
  policySnapshot: string | null;
}): Promise<void> {
  try {
    const handle = customerHandle ? `@${customerHandle}` : "there";
    const policyBlock = policySnapshot
      ? `\n\nYour deposit policy:\n${policySnapshot}`
      : "";
    const body = `Hi ${handle},

Your deposit to ${artistName} has been received. Your booking is confirmed.

Booking reference: ${bookingRef}
Deposit paid: ${currency.toUpperCase()} ${amountEur.toFixed(2)}${policyBlock}

Inklee`;
    const { buildEmailHtml: build } = await import("./booking-templates");
    await sendEmail({
      to,
      subject: `Deposit received, your booking with ${artistName} is confirmed`,
      html: build(body, {}, undefined, {
        footerNote: `Sent by Inklee on behalf of ${artistName}.`,
      }),
    });
  } catch (err) {
    console.error("[email] failed to send client deposit receipt email:", err);
  }
}

// Hardcoded system notification — not artist-customisable
export async function sendArtistCancellationByCustomer({
  artistEmail,
  customerHandle,
  placement,
  date,
}: {
  artistEmail: string;
  customerHandle: string;
  placement: string;
  date: string;
}): Promise<void> {
  try {
    const body = `${customerHandle} has cancelled their booking request.

- Placement: ${placement}
- Date: ${date}

Open Bookings:
https://inklee.app/bookings/overview`;

    const { buildEmailHtml: build } = await import("./booking-templates");
    await sendEmail({
      to: artistEmail,
      subject: `${customerHandle} cancelled their booking`,
      html: build(body, {}, undefined, { ctaLabel: "Open bookings" }),
    });
  } catch (err) {
    console.error("[email] failed to send artist cancellation notice:", err);
  }
}
