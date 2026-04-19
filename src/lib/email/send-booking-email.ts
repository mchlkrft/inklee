import { serviceClient } from "@/lib/supabase/service";
import { sendEmail } from "./send";
import {
  DEFAULT_BODIES,
  DEFAULT_SUBJECTS,
  TemplateVars,
  buildEmailHtml,
  substituteVars,
} from "./booking-templates";

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
}: {
  type: EmailType;
  to: string;
  artistId: string;
  vars: TemplateVars;
}): Promise<void> {
  try {
    // Fetch custom template if the artist has saved one
    const { data: custom } = await serviceClient
      .from("email_templates")
      .select("subject, body")
      .eq("artist_id", artistId)
      .eq("type", type)
      .single();

    const body = custom?.body ?? DEFAULT_BODIES[type] ?? "";
    const subject = substituteVars(DEFAULT_SUBJECTS[type] ?? "inklee", vars);
    const html = buildEmailHtml(body, vars);

    await sendEmail({ to, subject, html });
  } catch (err) {
    // Emails are best-effort — log and continue, never block the state change
    console.error(`[email] failed to send ${type} to ${to}:`, err);
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

— placement: ${placement}
— date: ${date}

view your dashboard:
https://inklee.app/dashboard`;

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
