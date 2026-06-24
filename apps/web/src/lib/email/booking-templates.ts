import type { CustomAnswerSnapshot } from "@/lib/custom-fields";
import { formatCustomAnswer } from "@/lib/custom-fields";
import { renderEmailShell, escapeHtml } from "./layout";
import {
  ALLOWED_VARS,
  type TemplateVars,
} from "@inklee/shared/email-templates";

// The editor-facing pieces (allowed vars, template types/labels, body
// validation) live in @inklee/shared/email-templates so the mobile app and
// the /api/mobile routes share them; re-exported here so existing imports
// keep working. The send-time rendering below stays server-only.
export {
  ALLOWED_VARS,
  templateBodySchema,
} from "@inklee/shared/email-templates";
export type { TemplateVars } from "@inklee/shared/email-templates";

// Only allow http(s) URLs and escape for an HTML href attribute. The studio
// row stores google_maps_url as free text (artist input, validated by length
// only at write time); without this guard an artist could store e.g.
// `javascript:...` or break out of the attribute with a stray quote.
export function sanitizeHrefForEmail(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return escapeHtml(parsed.toString());
}

export function substituteVars(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    if (!(ALLOWED_VARS as readonly string[]).includes(key)) {
      console.warn(
        `[email] unknown template var: {{${key}}} - rendering as empty`,
      );
      return "";
    }
    return vars[key as (typeof ALLOWED_VARS)[number]] ?? "";
  });
}

export const DEFAULT_BODIES: Record<string, string> = {
  customer_booking_submitted: `Hi {{customer_handle}},

Your booking request to {{artist_name}} has been received. They will review it and get back to you soon.

Details:
- Placement: {{placement}}
- Size: {{size}}
- Preferred date: {{date}}

You can edit or cancel your request using the link below. It's valid for 30 days.

{{magic_link}}`,

  customer_booking_approved: `Hi {{customer_handle}},

Good news. {{artist_name}} accepted your booking.

Details:
- Placement: {{placement}}
- Size: {{size}}
- Date: {{date}}

If you need to cancel, use the link below.

{{magic_link}}`,

  customer_booking_rejected: `Hi {{customer_handle}},

{{artist_name}} has reviewed your request but isn't able to take it at this time.

Feel free to submit a new request in the future.`,

  customer_booking_cancelled_by_artist: `Hi {{customer_handle}},

{{artist_name}} has cancelled your booking.

If you have any questions, reach out to them directly on Instagram.`,

  artist_new_booking_request: `You have a new booking request from {{customer_handle}}.

- Placement: {{placement}}
- Size: {{size}}
- Preferred date: {{date}}

Review it in Bookings:
https://inklee.app/bookings/overview`,
};

export const DEFAULT_SUBJECTS: Record<string, string> = {
  customer_booking_submitted: "Booking request received",
  customer_booking_approved: "Your booking has been accepted",
  customer_booking_rejected: "About your booking request",
  customer_booking_cancelled_by_artist: "Your booking has been cancelled",
  artist_new_booking_request: "New booking request from {{customer_handle}}",
};

// Render a plain-text body to HTML. Each standalone URL line becomes a tappable
// rounded button (brand mustard) PLUS the raw link beneath it, so the link still
// works in clients that strip styled buttons. Everything else is escaped text.
function ctaButton(url: string, label: string): string {
  return (
    `<a href="${url}" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">${label}</a>` +
    `<br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span>` +
    `<br/><a href="${url}" style="font-size:12px;color:#6b7280;word-break:break-all;">${url}</a>`
  );
}

function renderBody(plainText: string, ctaLabel: string): string {
  return plainText
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (/^https?:\/\/\S+$/.test(trimmed)) {
        // INJ-02: only build a CTA for a URL that parses as a clean http(s)
        // link (sanitizeHrefForEmail normalizes + HTML-escapes it); otherwise
        // fall back to escaped text so a crafted line can't break out of the
        // href attribute.
        const safeHref = sanitizeHrefForEmail(trimmed);
        if (safeHref) return ctaButton(safeHref, ctaLabel);
      }
      return escapeHtml(line);
    })
    .join("<br/>");
}

export type EmailGoodsDecision = {
  title: string;
  variant: string | null;
  quantity: number;
  available: boolean;
  declineNote: string | null;
};

export function buildEmailHtml(
  body: string,
  vars: TemplateVars,
  customAnswers?: CustomAnswerSnapshot[],
  opts?: {
    ctaLabel?: string;
    studio?: {
      name: string;
      address: string | null;
      mapsUrl: string | null;
    } | null;
    // Per-item availability decisions the artist made on Accept. Rendered as
    // an "About your goods" section in the approval email so the client knows
    // what's confirmed for the appointment + any decline reasons.
    goodsDecisions?: EmailGoodsDecision[] | null;
    // Overrides the default footer tagline. Used to add a "Sent by Inklee on
    // behalf of <artist>" line to customer-facing mail (anti-phishing signal).
    footerNote?: string;
  },
): string {
  const substituted = substituteVars(body, vars);
  let rendered = renderBody(substituted, opts?.ctaLabel ?? "View details");

  if (customAnswers && customAnswers.length > 0) {
    const lines = customAnswers.map(
      (a) => `- ${escapeHtml(a.label)}: ${escapeHtml(formatCustomAnswer(a))}`,
    );
    rendered += `<br/><br/>Additional details:<br/>${lines.join("<br/>")}`;
  }

  // Goods decisions — surfaced in the approval email when the client marked
  // interest at submit time. Lists what the artist confirmed for the
  // appointment plus any items they marked unavailable with the artist's note.
  if (opts?.goodsDecisions && opts.goodsDecisions.length > 0) {
    const available = opts.goodsDecisions.filter((g) => g.available);
    const declined = opts.goodsDecisions.filter((g) => !g.available);
    rendered += `<br/><br/><span style="color:#0e0e10;font-weight:600;">About your goods</span>`;
    if (available.length > 0) {
      const lines = available.map((g) => {
        const label = g.variant
          ? `${escapeHtml(g.title)} · ${escapeHtml(g.variant)}`
          : escapeHtml(g.title);
        return `- ${label} (qty ${g.quantity}) — ready for pickup`;
      });
      rendered += `<br/>${lines.join("<br/>")}`;
    }
    if (declined.length > 0) {
      const lines = declined.map((g) => {
        const label = g.variant
          ? `${escapeHtml(g.title)} · ${escapeHtml(g.variant)}`
          : escapeHtml(g.title);
        const note = g.declineNote ? ` — ${escapeHtml(g.declineNote)}` : "";
        return `- ${label}: not available${note}`;
      });
      rendered += `<br/>${lines.join("<br/>")}`;
    }
  }

  // Studio block — included in confirmation + reminder emails so the client
  // knows where to come (with a Google Maps link when the artist set one).
  if (opts?.studio) {
    const s = opts.studio;
    rendered +=
      `<br/><br/><span style="color:#0e0e10;font-weight:600;">Where to come</span>` +
      `<br/>${escapeHtml(s.name)}`;
    if (s.address) rendered += `<br/>${escapeHtml(s.address)}`;
    if (s.mapsUrl) {
      const safeHref = sanitizeHrefForEmail(s.mapsUrl);
      if (safeHref) {
        rendered += `<br/><a href="${safeHref}" style="color:#6b7280;font-size:13px;text-decoration:underline;">Open in Google Maps</a>`;
      }
    }
  }

  return renderEmailShell({
    contentHtml: `<p style="margin:0;font-size:14px;line-height:1.7;color:#374151;white-space:pre-line;">${rendered}</p>`,
    footerNote: opts?.footerNote,
  });
}
