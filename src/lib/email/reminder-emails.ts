import { sendEmail } from "./send";
import { buildEmailHtml } from "./booking-templates";

function html(body: string): string {
  return buildEmailHtml(body, {});
}

export async function sendDepositOverdueCustomer({
  to,
  customerHandle,
  artistName,
  amountEur,
  dueAt,
  note,
}: {
  to: string;
  customerHandle: string;
  artistName: string;
  amountEur: number;
  dueAt: string;
  note: string | null;
}): Promise<void> {
  const body = `Hi ${customerHandle},

Your deposit of EUR ${amountEur.toFixed(2)} for your booking with ${artistName} was due on ${dueAt} and hasn't been received yet.

${note ? `Payment instructions from ${artistName}:\n${note}\n\n` : ""}Please arrange payment as soon as possible to keep your booking. If you can no longer proceed, you can cancel using your booking link.`;

  await sendEmail({
    to,
    subject: `Deposit overdue: booking with ${artistName}`,
    html: html(body),
  });
}

export async function sendDepositOverdueArtist({
  to,
  customerHandle,
  amountEur,
  dueAt,
}: {
  to: string;
  customerHandle: string;
  amountEur: number;
  dueAt: string;
}): Promise<void> {
  const body = `${customerHandle}'s deposit of EUR ${amountEur.toFixed(2)} was due on ${dueAt} and hasn't been received.

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
}: {
  to: string;
  customerHandle: string;
  artistName: string;
  date: string;
  placement: string;
}): Promise<void> {
  const body = `Hi ${customerHandle},

A quick reminder: your tattoo appointment with ${artistName} is in 3 days.

- Date: ${date}
- Placement: ${placement}

If anything changes, get in touch with ${artistName} directly.`;

  await sendEmail({
    to,
    subject: `Reminder: appointment with ${artistName} in 3 days`,
    html: html(body),
  });
}

export async function sendReconfirmationRequest({
  to,
  customerHandle,
  artistName,
  date,
  placement,
  magicLink,
}: {
  to: string;
  customerHandle: string;
  artistName: string;
  date: string;
  placement: string;
  magicLink: string;
}): Promise<void> {
  const body = `Hi ${customerHandle},

Your tattoo with ${artistName} is coming up on ${date} (${placement}).

Just checking in: are you still good to go? No action needed if everything is fine.

If your plans have changed, please cancel using the link below so ${artistName} can offer the slot to someone else.

${magicLink}`;

  await sendEmail({
    to,
    subject: `Upcoming appointment with ${artistName}: confirming in 2 weeks`,
    html: html(body),
  });
}
