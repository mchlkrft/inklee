// App origin for absolute asset URLs in email (inklee.app in prod). Mirrors
// the fallback used elsewhere in the email layer; email clients need a fully
// qualified URL for the logo image.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";

// Shared branded shell for every Inklee email (booking, deposit, auth). One
// place for the logo, card, and footer so all mail looks consistent and
// carries the real logo. The logo is a hosted PNG, not the SVG wordmark:
// most email clients (Gmail, Outlook) refuse to render inline/linked SVG.
//
// `contentHtml` is dropped into the white card as-is (already-escaped body).
// `footerNote` overrides the default tagline — used to add a "Sent by Inklee
// on behalf of <artist>" line to customer-facing mail, which is a strong
// anti-phishing signal on the highest-trust-risk message (deposit requests).
export function renderEmailShell({
  contentHtml,
  footerNote,
}: {
  contentHtml: string;
  footerNote?: string;
}): string {
  const logoUrl = `${APP_ORIGIN}/branding/logos/inklee-email-logo.png`;
  const footer = footerNote ?? "Inklee. Tattoo bookings, clearly organized.";
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
            <td style="padding:32px 40px 24px;border-bottom:1px solid #f3f4f6;">
              <img src="${logoUrl}" width="140" height="40" alt="Inklee" style="display:block;border:0;height:40px;width:140px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 36px;">
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">${footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
