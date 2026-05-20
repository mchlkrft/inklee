"use server";

import { headers } from "next/headers";
import { HONEYPOT_FIELD, isHoneypotTriggered } from "@/lib/honeypot";
import { sendEmail } from "@/lib/email/send";

export type ReportState =
  | { error: string; field?: string }
  | { sent: true; reference: string }
  | null;

const CATEGORY_LABELS: Record<string, string> = {
  illegal_content: "Illegal content",
  ip_infringement: "Intellectual property infringement",
  impersonation: "Impersonation",
  harassment: "Harassment or hate",
  spam_fraud: "Spam or fraud",
  other: "Other",
};

// Operator inbox. DSA Art. 11/12 single point of contact is the same address
// (see /imprint). If a dedicated abuse@ alias is ever added, swap here.
const OPERATOR_EMAIL = "support@inklee.app";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateReference(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DSA-${t}-${r}`;
}

/**
 * Accept a DSA Art. 16 notice-and-action submission, email the operator and a
 * confirmation copy to the reporter (Art. 16(5)). Honeypot quietly absorbs
 * bot submissions. The internal moderation procedure that turns this into an
 * action lives in `docs/dsa-moderation-procedure.md`.
 */
export async function submitReportAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  if (isHoneypotTriggered(formData.get(HONEYPOT_FIELD))) {
    // Fake success — bots don't learn anything from a failure response.
    return { sent: true, reference: "DSA-IGNORED" };
  }

  const category = String(formData.get("category") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const reporterName = String(formData.get("reporter_name") ?? "").trim();
  const reporterEmail = String(formData.get("reporter_email") ?? "").trim();
  const goodFaith = formData.get("good_faith");

  if (!CATEGORY_LABELS[category]) {
    return { error: "select a category", field: "category" };
  }
  if (!url || !/https?:\/\//i.test(url)) {
    return {
      error: "include at least one URL (starting with http or https)",
      field: "url",
    };
  }
  if (url.length > 2000) {
    return {
      error: "URL field is too long (max 2000 characters)",
      field: "url",
    };
  }
  if (description.length < 20) {
    return {
      error: "please add more detail (at least 20 characters)",
      field: "description",
    };
  }
  if (description.length > 5000) {
    return {
      error: "description too long (max 5000 characters)",
      field: "description",
    };
  }
  if (!reporterName || reporterName.length > 200) {
    return { error: "your name is required", field: "reporter_name" };
  }
  if (
    !reporterEmail ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(reporterEmail) ||
    reporterEmail.length > 200
  ) {
    return { error: "valid email is required", field: "reporter_email" };
  }
  if (goodFaith !== "yes") {
    return {
      error: "please confirm the good-faith declaration",
      field: "good_faith",
    };
  }

  const reference = generateReference();
  const submittedAt = new Date().toISOString();
  const ipHeader = (await headers()).get("x-forwarded-for") ?? "";

  const operatorHtml = [
    `<p><strong>DSA notice-and-action report</strong></p>`,
    `<p>Reference: <code>${escapeHtml(reference)}</code><br/>Submitted at: ${escapeHtml(submittedAt)}</p>`,
    `<p><strong>Category:</strong> ${escapeHtml(CATEGORY_LABELS[category])}</p>`,
    `<p><strong>URL(s):</strong></p>`,
    `<pre>${escapeHtml(url)}</pre>`,
    `<p><strong>Description:</strong></p>`,
    `<pre style="white-space: pre-wrap;">${escapeHtml(description)}</pre>`,
    `<hr/>`,
    `<p><strong>Submitter:</strong> ${escapeHtml(reporterName)} &lt;${escapeHtml(reporterEmail)}&gt;</p>`,
    `<p><strong>Good-faith declaration:</strong> confirmed</p>`,
    `<p><strong>IP (x-forwarded-for):</strong> ${escapeHtml(ipHeader.slice(0, 200))}</p>`,
  ].join("\n");

  try {
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `[DSA] ${CATEGORY_LABELS[category]} — ${reference}`,
      html: operatorHtml,
      replyTo: reporterEmail,
    });
  } catch (e) {
    console.error("[dsa report] operator email failed", e);
    return {
      error:
        "we couldn't send the report right now — please email support@inklee.app directly",
    };
  }

  // Confirmation to the reporter (Art. 16(5)). Best-effort: if it fails, the
  // report is still recorded on the operator side; do not surface an error.
  const ackHtml = [
    `<p>Hi ${escapeHtml(reporterName)},</p>`,
    `<p>We received your report. Your reference is <code>${escapeHtml(reference)}</code>. We will review and respond within a reasonable time, in line with our notice-and-action procedure under the EU Digital Services Act (Article 16).</p>`,
    `<p>For your records, the details you submitted:</p>`,
    `<p><strong>Category:</strong> ${escapeHtml(CATEGORY_LABELS[category])}</p>`,
    `<p><strong>URL(s):</strong></p>`,
    `<pre>${escapeHtml(url)}</pre>`,
    `<p><strong>Description:</strong></p>`,
    `<pre style="white-space: pre-wrap;">${escapeHtml(description)}</pre>`,
    `<p>If you need to add information, reply to this email and include the reference number.</p>`,
    `<p>— Inklee</p>`,
  ].join("\n");
  try {
    await sendEmail({
      to: reporterEmail,
      subject: `Your Inklee report — ${reference}`,
      html: ackHtml,
    });
  } catch (e) {
    console.warn("[dsa report] confirmation email failed", e);
  }

  return { sent: true, reference };
}
