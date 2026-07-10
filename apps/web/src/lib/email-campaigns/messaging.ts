// Compliance-critical per-recipient message construction, shared by the campaign send
// (/api/internal/email-jobs) and the lifecycle engine (lib/email-campaigns/lifecycle/engine)
// so there is EXACTLY one implementation of: token substitution, the unsubscribe/preferences
// footer (with the EMAIL_POSTAL_ADDRESS CAN-SPAM line), the renderEmailShell wrap, and the
// RFC 8058 List-Unsubscribe headers. Extracted from the campaign route's send loop (Email
// hub slice 11), preserving the original message construction exactly, with ONE deliberate
// exception: the EMAIL_POSTAL_ADDRESS fallback placeholder was rewritten to
// "Inklee (postal address not configured)" to drop the em dash (house style).
import "server-only";
import { getOrCreateUnsubToken } from "@/lib/email-campaigns/unsubscribe-token";
import { renderEmailShell, escapeHtml } from "@/lib/email/layout";

// The exact message object shape handed to resend.batch.send.
export type ResendMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: {
    "List-Unsubscribe": string;
    "List-Unsubscribe-Post": string;
  };
};

// Per-recipient token substitution. Control Tower ships INNER CONTENT with generic tokens
// already filled, leaving only these per-recipient tokens literal:
//   {{artist_name}} {{artist_email}} {{public_page_link}} {{booking_link}}
//   {{unsubscribe_link}} {{preferences_link}}
// A token whose value is null/undefined here (e.g. an artist with no slug) is LEFT LITERAL
// rather than blanked — a documented v1 limitation, never a broken/empty link.
export function substituteTokens(
  tpl: string,
  vars: Record<string, string | null | undefined>,
): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const v = vars[key];
    return v == null ? match : v;
  });
}

/**
 * Build one personalized, compliance-complete message for a recipient: resolve their stable
 * unsubscribe token, substitute the per-recipient tokens into subject/html/text, append the
 * always-on compliance footer (unsubscribe + preferences + physical postal address), wrap the
 * html in the branded shell exactly once, and set the one-click List-Unsubscribe headers.
 *
 * subjectTpl/htmlTpl/textTpl are INNER CONTENT (not a full HTML document). The postal address
 * comes from EMAIL_POSTAL_ADDRESS (CAN-SPAM / Gmail-Yahoo bulk-sender requirement) — while
 * unset, an obvious placeholder ships instead so a dry run flags it rather than silently
 * producing a non-compliant email.
 */
export async function buildRecipientMessage(args: {
  from: string;
  email: string;
  displayName: string;
  slug: string | null;
  artistId: string;
  subjectTpl: string;
  htmlTpl: string;
  textTpl: string;
}): Promise<ResendMessage> {
  const postalAddress =
    process.env.EMAIL_POSTAL_ADDRESS ??
    "Inklee (postal address not configured)";

  const rawToken = await getOrCreateUnsubToken(args.artistId);
  const unsubUrl = `https://inklee.app/unsubscribe/${rawToken}`;
  // public_page_link / booking_link both point at the artist's public page; left literal
  // (not blanked) when the artist has no slug.
  const pageLink = args.slug ? `https://inkl.ee/${args.slug}` : undefined;
  const vars = {
    artist_name: args.displayName,
    artist_email: args.email,
    public_page_link: pageLink,
    booking_link: pageLink,
    unsubscribe_link: unsubUrl,
    preferences_link: unsubUrl,
  };
  const subject = substituteTokens(args.subjectTpl, vars);
  const htmlBody = substituteTokens(args.htmlTpl, vars);
  const textBody = substituteTokens(args.textTpl, vars);
  // Always-appended compliance footer (marketing/lifecycle): unsubscribe + preferences +
  // physical postal address.
  const footerHtml = `<p style="margin-top:24px;font-size:12px;color:#9ca3af;">You're receiving this because you have an Inklee account. <a href="${unsubUrl}" style="color:#9ca3af;">Unsubscribe</a> &middot; <a href="${unsubUrl}" style="color:#9ca3af;">Email preferences</a><br/>${escapeHtml(postalAddress)}</p>`;
  const footerText = `\n\n---\nYou're receiving this because you have an Inklee account.\nUnsubscribe: ${unsubUrl}\nEmail preferences: ${unsubUrl}\n${postalAddress}`;
  return {
    from: args.from,
    to: args.email,
    subject,
    html: renderEmailShell({ contentHtml: htmlBody + footerHtml }),
    text: textBody + footerText,
    headers: {
      // Only the https one-click URL — no mailto: alternative (unsubscribe@inklee.app is
      // unmonitored, so a client that chose the mailto path would silently lose the opt-out).
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
