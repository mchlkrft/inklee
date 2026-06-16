import { renderEmailShell } from "./layout";

// Inklee brand tokens for email (mirrors apps/web globals.css / mobile tokens).
// Email needs literal hex (no CSS vars/classes), and the signature CTA is the
// brand mustard pill with charcoal text — the strongest brand signal in mail.
const CHARCOAL = "#1e1e1e"; // brand foreground (headline, CTA text)
const MUSTARD = "#e9b22b"; // brand accent (CTA fill)
const BODY = "#52525b"; // readable muted body on the white card
const FAINT = "#9ca3af"; // helper / copy-link line

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
  return renderEmailShell({
    contentHtml: `<h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:${CHARCOAL};letter-spacing:-0.01em;">${headline}</h1>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:${BODY};">${body}</p>
              <a href="${ctaUrl}"
                 style="display:inline-block;background:${MUSTARD};color:${CHARCOAL};font-size:14px;font-weight:600;padding:14px 28px;border-radius:9999px;text-decoration:none;">
                ${ctaText}
              </a>
              <p style="margin:24px 0 0;font-size:12px;color:${FAINT};">
                Or copy this link into your browser:<br/>
                <span style="word-break:break-all;color:${BODY};">${ctaUrl}</span>
              </p>`,
    footerNote:
      "You're receiving this because you signed up for Inklee. If that wasn't you, ignore this email.",
  });
}

export function confirmationEmail(confirmUrl: string) {
  return base({
    headline: "Confirm your email",
    body: "Confirm your email address to finish setting up your Inklee artist account.",
    ctaText: "Confirm email",
    ctaUrl: confirmUrl,
  });
}

export function emailChangeEmail(confirmUrl: string) {
  return base({
    headline: "Confirm your new email",
    body: "Confirm this email address to use it for your Inklee account.",
    ctaText: "Confirm email",
    ctaUrl: confirmUrl,
  });
}

export function passwordResetEmail(resetUrl: string) {
  return base({
    headline: "Reset your password",
    body: "Use the button below to choose a new password. This link expires in 1 hour.",
    ctaText: "Reset password",
    ctaUrl: resetUrl,
  });
}

export function magicLinkEmail(magicUrl: string) {
  return base({
    headline: "Sign in to Inklee",
    body: "Use the button below to sign in. This link expires in 1 hour and works only once.",
    ctaText: "Sign in",
    ctaUrl: magicUrl,
  });
}
