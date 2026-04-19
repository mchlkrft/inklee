import { z } from "zod";

export const ALLOWED_VARS = [
  "customer_handle",
  "artist_name",
  "artist_slug",
  "date",
  "placement",
  "size",
  "magic_link",
] as const;

export type TemplateVars = Partial<
  Record<(typeof ALLOWED_VARS)[number], string>
>;

// Zod schema for artist-editable body — plain text only, no HTML
export const templateBodySchema = z
  .string()
  .min(1, "body is required")
  .max(2000, "max 2000 characters")
  .refine((s) => !/<[^>]*>/.test(s), { message: "html tags are not allowed" })
  .refine((s) => !/javascript:/i.test(s), {
    message: "javascript: is not allowed",
  })
  .refine((s) => !/on\w+\s*=/i.test(s), {
    message: "event handlers are not allowed",
  });

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br/>");
}

export function substituteVars(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(ALLOWED_VARS as readonly string[]).includes(key)) {
      console.warn(
        `[email] unknown template var: {{${key}}} — rendering as empty`,
      );
      return "";
    }
    return vars[key as (typeof ALLOWED_VARS)[number]] ?? "";
  });
}

// Default template bodies (plain text, artist-editable)
export const DEFAULT_BODIES: Record<string, string> = {
  customer_booking_submitted: `hi @{{customer_handle}},

your booking request to {{artist_name}} has been received. they'll review it and get back to you soon.

details:
— placement: {{placement}}
— size: {{size}}
— preferred date: {{date}}

you can edit or cancel your request using the link below. it's valid for 30 days.

{{magic_link}}`,

  customer_booking_approved: `hi @{{customer_handle}},

great news — {{artist_name}} has approved your booking.

details:
— placement: {{placement}}
— size: {{size}}
— date: {{date}}

if you need to cancel, use the link below.

{{magic_link}}`,

  customer_booking_rejected: `hi @{{customer_handle}},

{{artist_name}} has reviewed your request but isn't able to take it at this time.

feel free to submit a new request in the future.`,

  customer_booking_cancelled_by_artist: `hi @{{customer_handle}},

{{artist_name}} has cancelled your booking.

if you have any questions, reach out to them directly on instagram.`,

  artist_new_booking_request: `you have a new booking request from @{{customer_handle}}.

— placement: {{placement}}
— size: {{size}}
— preferred date: {{date}}

review it in your dashboard:
https://inklee.app/dashboard`,
};

export const DEFAULT_SUBJECTS: Record<string, string> = {
  customer_booking_submitted: "booking request received",
  customer_booking_approved: "your booking has been approved",
  customer_booking_rejected: "about your booking request",
  customer_booking_cancelled_by_artist: "your booking has been cancelled",
  artist_new_booking_request: "new booking request from @{{customer_handle}}",
};

function renderBody(plainText: string): string {
  return escapeHtml(plainText);
}

export function buildEmailHtml(body: string, vars: TemplateVars): string {
  const substituted = substituteVars(body, vars);
  const rendered = renderBody(substituted);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0 0 24px;font-size:18px;font-weight:600;color:#0e0e10;letter-spacing:-0.02em;">inklee</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 40px;">
              <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;white-space:pre-line;">${rendered}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">inklee — booking requests without the dm chaos</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
