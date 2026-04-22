function base({
  headline,
  body,
  ctaText,
  ctaUrl,
}: {
  headline: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 0;border-bottom:1px solid #ebebeb;">
              <p style="margin:0 0 24px;font-size:18px;font-weight:600;color:#0e0e10;letter-spacing:-0.02em;">inklee</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#0e0e10;letter-spacing:-0.01em;">${headline}</h1>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#6b7280;">${body}</p>
              <a href="${ctaUrl}"
                 style="display:inline-block;background:#0e0e10;color:#ffffff;font-size:14px;font-weight:500;padding:12px 24px;border-radius:6px;text-decoration:none;">
                ${ctaText}
              </a>
              <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">
                Or copy this link:<br/>
                <span style="word-break:break-all;color:#6b7280;">${ctaUrl}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #ebebeb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You're receiving this because you signed up for inklee.
                If you didn't, ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function confirmationEmail(confirmUrl: string) {
  return base({
    headline: "Confirm your email",
    body: "Click the button below to confirm your email address and activate your inklee account.",
    ctaText: "Confirm email",
    ctaUrl: confirmUrl,
  });
}

export function passwordResetEmail(resetUrl: string) {
  return base({
    headline: "Reset your password",
    body: "Click below to choose a new password. This link expires in 1 hour.",
    ctaText: "Reset password",
    ctaUrl: resetUrl,
  });
}

export function magicLinkEmail(magicUrl: string) {
  return base({
    headline: "Sign in to inklee",
    body: "Click the button below to sign in. This link expires in 1 hour and can only be used once.",
    ctaText: "Sign in",
    ctaUrl: magicUrl,
  });
}
