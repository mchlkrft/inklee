import { Resend } from "resend";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

// Warn once at module load if EMAIL_FROM looks misconfigured
const emailFrom = process.env.EMAIL_FROM ?? "inklee <noreply@inklee.app>";
if (!emailFrom.includes("@")) {
  console.warn(
    "[email] EMAIL_FROM does not contain an '@' — check configuration",
  );
}

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // In production a missing key must fail loud: the auth email-hook relies
    // on a throw to return 500 so Supabase retries instead of marking the
    // confirmation/reset email delivered; booking senders surface to Sentry.
    // In dev/test, skipping keeps flows runnable without a Resend account.
    if (process.env.NODE_ENV === "production") {
      throw new Error("email send failed: RESEND_API_KEY is not set");
    }
    console.warn("[email] RESEND_API_KEY not set; skipping send");
    return;
  }

  const resend = new Resend(apiKey);
  const from = emailFrom;
  const replyToAddress = replyTo ?? process.env.EMAIL_REPLY_TO;

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    ...(replyToAddress ? { replyTo: replyToAddress } : {}),
  });

  if (error) {
    console.error("[email] send failed", { error });
    throw new Error(`email send failed: ${error.message}`);
  }

  console.log("[email] sent", { id: data?.id });
}
