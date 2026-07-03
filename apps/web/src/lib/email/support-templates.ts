// Support-ticket notification emails. Email is a notification layer only: no
// template ever contains the conversation body — the platform is the source of
// truth and every email links back into Inklee. User-provided values (subject,
// names) are escaped; ticket references and URLs are system-generated.

import { renderEmailShell, escapeHtml } from "./layout";

function base({
  headline,
  body,
  ctaText,
  ctaUrl,
  detailsHtml,
  footerNote,
}: {
  headline: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  detailsHtml?: string;
  footerNote: string;
}) {
  return renderEmailShell({
    contentHtml: `<h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#0e0e10;letter-spacing:-0.01em;">${headline}</h1>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#6b7280;">${body}</p>
              ${detailsHtml ?? ""}
              <a href="${ctaUrl}"
                 style="display:inline-block;background:#0e0e10;color:#ffffff;font-size:14px;font-weight:500;padding:12px 24px;border-radius:6px;text-decoration:none;">
                ${ctaText}
              </a>
              <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">
                Or copy this link:<br/>
                <span style="word-break:break-all;color:#6b7280;">${ctaUrl}</span>
              </p>`,
    footerNote,
  });
}

function detailRows(rows: Array<[string, string]>): string {
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;font-size:13px;color:#9ca3af;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:4px 0;font-size:13px;color:#0e0e10;">${v}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" style="margin:0 0 24px;border-collapse:collapse;">${tr}</table>`;
}

const ARTIST_FOOTER =
  "You're receiving this because you have a support ticket with Inklee. Replies happen inside Inklee, not over email.";
const TEAM_FOOTER = "Internal Inklee support notification.";

/** Artist confirmation after creating a ticket. */
export function supportTicketCreatedArtistEmail({
  reference,
  subject,
  ticketUrl,
}: {
  reference: string;
  subject: string;
  ticketUrl: string;
}) {
  return base({
    headline: `Support request ${escapeHtml(reference)} received`,
    body: `We received your request "${escapeHtml(subject)}". The Inklee team will review it and reply inside Inklee. We'll email you when there's an update; the full conversation stays on your ticket page.`,
    ctaText: "View your ticket",
    ctaUrl: ticketUrl,
    footerNote: ARTIST_FOOTER,
  });
}

/** Team notification for a new ticket. */
export function supportTicketCreatedTeamEmail({
  reference,
  subject,
  categoryLabel,
  artistName,
  artistEmail,
  createdAt,
  adminUrl,
}: {
  reference: string;
  subject: string;
  categoryLabel: string;
  artistName: string;
  artistEmail: string;
  createdAt: string;
  adminUrl: string;
}) {
  return base({
    headline: `New support ticket ${escapeHtml(reference)}`,
    body: "A new support request needs review.",
    detailsHtml: detailRows([
      ["Reference", escapeHtml(reference)],
      ["Subject", escapeHtml(subject)],
      ["Category", escapeHtml(categoryLabel)],
      ["Artist", escapeHtml(artistName)],
      ["Email", escapeHtml(artistEmail)],
      ["Created", escapeHtml(createdAt)],
    ]),
    ctaText: "Open in admin",
    ctaUrl: adminUrl,
    footerNote: TEAM_FOOTER,
  });
}

/** Artist notification that support replied. No conversation content. */
export function supportAdminRepliedEmail({
  reference,
  subject,
  ticketUrl,
}: {
  reference: string;
  subject: string;
  ticketUrl: string;
}) {
  return base({
    headline: `Support replied on ${escapeHtml(reference)}`,
    body: `There's a new reply from the Inklee team on your ticket "${escapeHtml(subject)}". Read it and respond inside Inklee.`,
    ctaText: "Read the reply",
    ctaUrl: ticketUrl,
    footerNote: ARTIST_FOOTER,
  });
}

/** Team notification that the artist replied. */
export function supportArtistRepliedTeamEmail({
  reference,
  subject,
  artistName,
  artistEmail,
  adminUrl,
}: {
  reference: string;
  subject: string;
  artistName: string;
  artistEmail: string;
  adminUrl: string;
}) {
  return base({
    headline: `Artist replied on ${escapeHtml(reference)}`,
    body: `${escapeHtml(artistName)} (${escapeHtml(artistEmail)}) added a reply on "${escapeHtml(subject)}".`,
    ctaText: "Open in admin",
    ctaUrl: adminUrl,
    footerNote: TEAM_FOOTER,
  });
}

/** Artist notification for a resolved or closed ticket. */
export function supportStatusChangedEmail({
  reference,
  subject,
  statusLabel,
  ticketUrl,
}: {
  reference: string;
  subject: string;
  statusLabel: string;
  ticketUrl: string;
}) {
  const lower = statusLabel.toLowerCase();
  return base({
    headline: `Ticket ${escapeHtml(reference)} ${escapeHtml(lower)}`,
    body: `Your support ticket "${escapeHtml(subject)}" was marked ${escapeHtml(lower)}. You can review the full conversation inside Inklee${lower === "resolved" ? ", and replying will reopen the ticket if the problem comes back" : ""}.`,
    ctaText: "View your ticket",
    ctaUrl: ticketUrl,
    footerNote: ARTIST_FOOTER,
  });
}
