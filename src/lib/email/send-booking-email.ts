import { serviceClient } from "@/lib/supabase/service";
import { sendEmail } from "./send";
import {
  DEFAULT_BODIES,
  DEFAULT_SUBJECTS,
  TemplateVars,
  buildEmailHtml,
  substituteVars,
} from "./booking-templates";
import type { CustomAnswerSnapshot } from "@/lib/custom-fields";

type EmailType =
  | "customer_booking_submitted"
  | "customer_booking_approved"
  | "customer_booking_rejected"
  | "customer_booking_cancelled_by_artist"
  | "artist_new_booking_request";

export async function sendBookingEmail({
  type,
  to,
  artistId,
  vars,
  customAnswers,
}: {
  type: EmailType;
  to: string;
  artistId: string;
  vars: TemplateVars;
  customAnswers?: CustomAnswerSnapshot[];
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
    const subject = substituteVars(subjectTemplate, vars);
    const html = buildEmailHtml(body, vars, customAnswers);

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
      html: build(body, {}),
    });
  } catch (err) {
    console.error("[email] failed to send waitlist conversion email:", err);
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
    const body = `@${customerHandle} has cancelled their booking request.

- Placement: ${placement}
- Date: ${date}

Open Bookings:
https://inklee.app/bookings/overview`;

    const { buildEmailHtml: build } = await import("./booking-templates");
    await sendEmail({
      to: artistEmail,
      subject: `@${customerHandle} cancelled their booking`,
      html: build(body, {}),
    });
  } catch (err) {
    console.error("[email] failed to send artist cancellation notice:", err);
  }
}
