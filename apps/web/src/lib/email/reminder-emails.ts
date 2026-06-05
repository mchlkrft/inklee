import { sendEmail } from "./send";
import { buildEmailHtml } from "./booking-templates";

function html(
  body: string,
  studio?: {
    name: string;
    address: string | null;
    mapsUrl: string | null;
  } | null,
  footerNote?: string,
): string {
  return buildEmailHtml(body, {}, undefined, { studio, footerNote });
}

// Anti-phishing footer for customer-facing mail Inklee sends on the artist's
// behalf (matches the deposit-request + receipt emails). Reused across the
// reminder set so a "pay now"-style message can't be cheaply impersonated.
function onBehalfOf(artistName: string): string {
  return `Sent by Inklee on behalf of ${artistName}.`;
}

export async function sendDepositOverdueCustomer({
  to,
  customerHandle,
  artistName,
  amountEur,
  currency = "eur",
  dueAt,
  note,
}: {
  to: string;
  customerHandle: string;
  artistName: string;
  amountEur: number;
  currency?: string;
  dueAt: string;
  note: string | null;
}): Promise<void> {
  const greeting = customerHandle ? `@${customerHandle}` : "there";
  const body = `Hi ${greeting},

Your deposit of ${currency.toUpperCase()} ${amountEur.toFixed(2)} for your booking with ${artistName} was due on ${dueAt} and hasn't been received yet.

${note ? `Payment instructions from ${artistName}:\n${note}\n\n` : ""}Please arrange payment as soon as possible to keep your booking. If you can no longer proceed, you can cancel using your booking link.`;

  await sendEmail({
    to,
    subject: `Deposit overdue: booking with ${artistName}`,
    html: html(body, null, onBehalfOf(artistName)),
  });
}

export async function sendDepositOverdueArtist({
  to,
  customerHandle,
  amountEur,
  currency = "eur",
  dueAt,
}: {
  to: string;
  customerHandle: string;
  amountEur: number;
  currency?: string;
  dueAt: string;
}): Promise<void> {
  const body = `${customerHandle}'s deposit of ${currency.toUpperCase()} ${amountEur.toFixed(2)} was due on ${dueAt} and hasn't been received.

You may want to follow up or cancel the booking.

Open Bookings:
https://inklee.app/bookings/overview`;

  await sendEmail({
    to,
    subject: `Deposit overdue: ${customerHandle}`,
    html: html(body),
  });
}

export async function sendAppointmentReminder({
  to,
  customerHandle,
  artistName,
  date,
  placement,
  studio,
}: {
  to: string;
  customerHandle: string;
  artistName: string;
  date: string;
  placement: string;
  studio?: {
    name: string;
    address: string | null;
    mapsUrl: string | null;
  } | null;
}): Promise<void> {
  const greeting = customerHandle ? `@${customerHandle}` : "there";
  const body = `Hi ${greeting},

A quick reminder: your tattoo appointment with ${artistName} is in 3 days.

- Date: ${date}
- Placement: ${placement}

If anything changes, get in touch with ${artistName} directly.`;

  await sendEmail({
    to,
    subject: `Reminder: appointment with ${artistName} in 3 days`,
    html: html(body, studio, onBehalfOf(artistName)),
  });
}

export async function sendReconfirmationRequest({
  to,
  customerHandle,
  artistName,
  date,
  placement,
  magicLink,
  studio,
}: {
  to: string;
  customerHandle: string;
  artistName: string;
  date: string;
  placement: string;
  magicLink: string;
  studio?: {
    name: string;
    address: string | null;
    mapsUrl: string | null;
  } | null;
}): Promise<void> {
  const greeting = customerHandle ? `@${customerHandle}` : "there";
  const body = `Hi ${greeting},

Your tattoo with ${artistName} is coming up on ${date} (${placement}).

Just checking in: are you still good to go? No action needed if everything is fine.

If your plans have changed, please cancel using the link below so ${artistName} can offer the slot to someone else.

${magicLink}`;

  await sendEmail({
    to,
    subject: `Upcoming appointment with ${artistName}: confirming in 2 weeks`,
    html: html(body, studio, onBehalfOf(artistName)),
  });
}
