import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "inklee <noreply@inklee.app>";

  const { data, error } = await resend.emails.send({ from, to, subject, html });

  if (error) {
    console.error("[email] send failed", { to, subject, error });
    throw new Error(`email send failed: ${error.message}`);
  }

  console.log("[email] sent", { to, subject, id: data?.id });
}
