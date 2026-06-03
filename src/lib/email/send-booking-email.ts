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
export async function sendGoodsOrderConfirmation({
  to,
  artistName,
  lines,
  total,
  currency,
}: {
  to: string;
  artistName: string;
  lines: {
    title: string;
    variant: string | null;
    quantity: number;
    total: number;
  }[];
  total: number;
  currency: string;
}): Promise<void> {
  try {
    const code = currency.toUpperCase();
    const itemsText = lines
      .map(
        (l) =>
          `- ${l.title}${l.variant ? ` (${l.variant})` : ""} x${l.quantity}: ${code} ${l.total.toFixed(2)}`,
      )
      .join("\n");
    const body = `Your payment to ${artistName} is confirmed.

Goods reserved for pickup at your appointment:
${itemsText}

Total paid: ${code} ${total.toFixed(2)}

Your goods will be waiting for you at your appointment.

Inklee`;
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
  dueDate,
  depositNote,
  magicLink,
}: {
  to: string;
  artistName: string;
  customerHandle: string;
  amountEur: number;
  dueDate: string | null;
  depositNote: string | null;
  magicLink: string;
}): Promise<void> {
  try {
    const handle = customerHandle ? `@${customerHandle}` : "there";
    const dueLine = dueDate ? `\nPlease pay by ${dueDate}.` : "";
    const noteLine = depositNote ? `\n\n${depositNote}` : "";
    const body = `Hi ${handle},

${artistName} has requested a deposit to confirm your booking.

Deposit due: EUR ${amountEur.toFixed(2)}${dueLine}${noteLine}

Pay securely through the link below. It is valid for 30 days:
${magicLink}

Inklee`;
    const { buildEmailHtml: build } = await import("./booking-templates");
    await sendEmail({
      to,
      subject: `Pay your deposit to confirm with ${artistName}`,
      html: build(body, {}, undefined, { ctaLabel: "Pay your deposit" }),
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
  goodsLines,
  goodsTotal,
  placement,
  date,
}: {
  artistEmail: string;
  customerHandle: string;
  amountEur: number;
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
    const goodsBlock =
      goodsLines.length > 0
        ? `\n\nGoods reserved for pickup:\n${goodsLines
            .map(
              (l) =>
                `- ${l.title}${l.variant ? ` (${l.variant})` : ""} x${l.quantity}: EUR ${l.total.toFixed(2)}`,
            )
            .join("\n")}\nGoods total: EUR ${goodsTotal.toFixed(2)}`
        : "";
    const body = `${customerHandle} paid their deposit. The booking is confirmed.

Deposit: EUR ${amountEur.toFixed(2)}${placement ? `\nPlacement: ${placement}` : ""}${date ? `\nDate: ${date}` : ""}${goodsBlock}

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
  bookingRef,
  policySnapshot,
}: {
  to: string;
  artistName: string;
  customerHandle: string;
  amountEur: number;
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
Deposit paid: EUR ${amountEur.toFixed(2)}${policyBlock}

Inklee`;
    const { buildEmailHtml: build } = await import("./booking-templates");
    await sendEmail({
      to,
      subject: `Deposit received, your booking with ${artistName} is confirmed`,
      html: build(body, {}),
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
