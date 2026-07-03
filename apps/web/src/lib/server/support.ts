// Support-ticket server core: the ONLY write path for support_tickets and
// support_ticket_messages. RLS gives artists read-only access, so every
// mutation here runs on the service role AFTER explicit authorization
// (artist ownership or admin identity is checked by the caller AND re-checked
// here against the row). Sequencing over transactions: the message/row is
// persisted first, then dependent bookkeeping, then notifications — an email
// failure is logged and never rolls back a stored ticket or reply.

import { serviceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email/send";
import { writeAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  canArtistReply,
  statusAfterArtistReply,
  statusAfterAdminReply,
  type SupportCategory,
  type SupportStatus,
  type SupportTicketInput,
} from "@/lib/support";
import {
  supportTicketCreatedArtistEmail,
  supportTicketCreatedTeamEmail,
  supportAdminRepliedEmail,
  supportArtistRepliedTeamEmail,
  supportStatusChangedEmail,
} from "@/lib/email/support-templates";

export const SUPPORT_INBOX_EMAIL = "support@inklee.app";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
}
function artistTicketUrl(id: string): string {
  return `${appUrl()}/support/${id}`;
}
function adminTicketUrl(id: string): string {
  return `${appUrl()}/admin/support/${id}`;
}

/** Notification failures must never surface as action failures. */
async function safeNotify(kind: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[support] ${kind} notification failed:`, err);
  }
}

type TicketRow = {
  id: string;
  reference: string;
  artist_id: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
};

const TICKET_CORE_FIELDS =
  "id, reference, artist_id, subject, category, status";

/** Current-state entry timestamps: set when entering resolved/closed, cleared
 *  when leaving, so the columns always describe the CURRENT state. */
function statusTimestamps(next: SupportStatus, nowIso: string) {
  return {
    resolved_at: next === "resolved" ? nowIso : null,
    closed_at: next === "closed" ? nowIso : null,
  };
}

/** Best-effort artist identity for team-facing emails. */
async function artistIdentity(
  artistId: string,
): Promise<{ name: string; email: string }> {
  const [{ data: profile }, userRes] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("display_name, slug")
      .eq("id", artistId)
      .maybeSingle(),
    serviceClient.auth.admin.getUserById(artistId).catch(() => null),
  ]);
  return {
    name:
      (profile?.display_name as string | null) ||
      (profile?.slug as string | null) ||
      "Unknown artist",
    email: userRes?.data?.user?.email ?? "unknown",
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createSupportTicket({
  artistId,
  artistEmail,
  input,
}: {
  artistId: string;
  artistEmail: string;
  input: SupportTicketInput & { category: SupportCategory };
}): Promise<{ id: string; reference: string } | { error: string }> {
  const opt = (v: string) => (v.trim() ? v.trim() : null);

  const { data: ticket, error } = await serviceClient
    .from("support_tickets")
    .insert({
      artist_id: artistId,
      subject: input.subject.trim(),
      category: input.category,
      description: input.description.trim(),
      expected_behavior: input.expectedBehavior.trim(),
      actual_behavior: input.actualBehavior.trim(),
      reproduction_steps: opt(input.reproductionSteps),
      relevant_area: opt(input.relevantArea),
      device_info: opt(input.deviceInfo),
      platform_info: opt(input.platformInfo),
      additional_context: opt(input.additionalContext),
    })
    .select("id, reference, created_at")
    .single();
  if (error || !ticket) {
    console.error("[support] ticket creation failed:", error?.message);
    return { error: "Couldn't create your support request. Try again." };
  }

  const { name } = await artistIdentity(artistId);

  await safeNotify("team ticket-created", () =>
    sendEmail({
      to: SUPPORT_INBOX_EMAIL,
      subject: `[${ticket.reference}] New support ticket: ${input.subject.trim()}`,
      html: supportTicketCreatedTeamEmail({
        reference: ticket.reference,
        subject: input.subject.trim(),
        categoryLabel: SUPPORT_CATEGORY_LABELS[input.category],
        artistName: name,
        artistEmail,
        createdAt: ticket.created_at as string,
        adminUrl: adminTicketUrl(ticket.id),
      }),
      replyTo: artistEmail,
    }),
  );
  await safeNotify("artist ticket-confirmation", () =>
    sendEmail({
      to: artistEmail,
      subject: `[${ticket.reference}] We received your support request`,
      html: supportTicketCreatedArtistEmail({
        reference: ticket.reference,
        subject: input.subject.trim(),
        ticketUrl: artistTicketUrl(ticket.id),
      }),
    }),
  );

  void writeAudit({
    action: "support_ticket_created",
    actor: artistId,
    category: "system",
    details: { reference: ticket.reference, category: input.category },
  });

  return { id: ticket.id as string, reference: ticket.reference as string };
}

// ─── Artist reply ────────────────────────────────────────────────────────────

export async function addArtistReply({
  ticketId,
  artistId,
  artistEmail,
  body,
}: {
  ticketId: string;
  artistId: string;
  artistEmail: string;
  body: string;
}): Promise<{ ok: true } | { error: string }> {
  // Ownership is enforced here (service role bypasses RLS): the ticket must
  // belong to the calling artist, or it does not exist for them.
  const { data: ticket } = await serviceClient
    .from("support_tickets")
    .select(TICKET_CORE_FIELDS)
    .eq("id", ticketId)
    .eq("artist_id", artistId)
    .maybeSingle<TicketRow>();
  if (!ticket) return { error: "Ticket not found." };

  if (!canArtistReply(ticket.status)) {
    return {
      error:
        "This ticket is closed. Open a new support request if you need more help.",
    };
  }

  const { error: msgError } = await serviceClient
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticket.id,
      author_id: artistId,
      author_role: "artist",
      body: body.trim(),
    });
  if (msgError) {
    console.error("[support] artist reply failed:", msgError.message);
    return { error: "Couldn't save your reply. Try again." };
  }

  const nowIso = new Date().toISOString();
  const nextStatus = statusAfterArtistReply(ticket.status) ?? ticket.status;
  const { error: updateError } = await serviceClient
    .from("support_tickets")
    .update({
      status: nextStatus,
      ...statusTimestamps(nextStatus, nowIso),
      last_artist_reply_at: nowIso,
      // The artist obviously saw the thread while replying.
      artist_seen_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", ticket.id);
  if (updateError) {
    // The reply itself persisted; the stale status self-heals on the next
    // action. Log rather than fail the artist.
    console.error("[support] status update failed:", updateError.message);
  }

  const { name } = await artistIdentity(artistId);
  await safeNotify("team artist-replied", () =>
    sendEmail({
      to: SUPPORT_INBOX_EMAIL,
      subject: `[${ticket.reference}] Artist replied: ${ticket.subject}`,
      html: supportArtistRepliedTeamEmail({
        reference: ticket.reference,
        subject: ticket.subject,
        artistName: name,
        artistEmail,
        adminUrl: adminTicketUrl(ticket.id),
      }),
      replyTo: artistEmail,
    }),
  );

  void writeAudit({
    action: "support_artist_reply",
    actor: artistId,
    category: "system",
    details: { reference: ticket.reference },
  });

  return { ok: true };
}

// ─── Admin reply (public or internal note) ──────────────────────────────────

export async function addAdminReply({
  ticketId,
  adminId,
  body,
  explicitStatus,
  internal,
}: {
  ticketId: string;
  adminId: string;
  body: string;
  explicitStatus: SupportStatus | null;
  internal: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const { data: ticket } = await serviceClient
    .from("support_tickets")
    .select(TICKET_CORE_FIELDS)
    .eq("id", ticketId)
    .maybeSingle<TicketRow>();
  if (!ticket) return { error: "Ticket not found." };

  const { error: msgError } = await serviceClient
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticket.id,
      author_id: adminId,
      author_role: "admin",
      visibility: internal ? "internal" : "public",
      body: body.trim(),
    });
  if (msgError) {
    console.error("[support] admin reply failed:", msgError.message);
    return { error: "Couldn't save the reply. Try again." };
  }

  const nowIso = new Date().toISOString();

  if (internal) {
    // Internal notes never change status, never notify the artist, and never
    // count as an admin reply for the unread derivation.
    await serviceClient
      .from("support_tickets")
      .update({ updated_at: nowIso })
      .eq("id", ticket.id);
    void writeAudit({
      action: "support_internal_note",
      actor: adminId,
      category: "admin",
      details: { reference: ticket.reference },
    });
    return { ok: true };
  }

  const nextStatus = statusAfterAdminReply(explicitStatus);
  const { error: updateError } = await serviceClient
    .from("support_tickets")
    .update({
      status: nextStatus,
      ...statusTimestamps(nextStatus, nowIso),
      last_admin_reply_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", ticket.id);
  if (updateError) {
    console.error("[support] status update failed:", updateError.message);
  }

  // One notification per action: the reply email covers a combined
  // reply-and-resolve, so no separate status email is sent here.
  const { email } = await artistIdentity(ticket.artist_id);
  if (email !== "unknown") {
    await safeNotify("artist admin-replied", () =>
      sendEmail({
        to: email,
        subject: `[${ticket.reference}] Support replied: ${ticket.subject}`,
        html: supportAdminRepliedEmail({
          reference: ticket.reference,
          subject: ticket.subject,
          ticketUrl: artistTicketUrl(ticket.id),
        }),
      }),
    );
  }
  await safeNotify("artist in-app", () =>
    createNotification({
      artistId: ticket.artist_id,
      type: "support_reply",
      category: "info",
      priority: "medium",
      title: `Support replied on ${ticket.reference}`,
      message: ticket.subject,
      ctaLabel: "View ticket",
      ctaHref: `/support/${ticket.id}`,
    }),
  );

  void writeAudit({
    action: "support_admin_reply",
    actor: adminId,
    category: "admin",
    details: { reference: ticket.reference, status: nextStatus },
  });

  return { ok: true };
}

// ─── Admin status change (no reply) ─────────────────────────────────────────

export async function setTicketStatus({
  ticketId,
  adminId,
  status,
}: {
  ticketId: string;
  adminId: string;
  status: SupportStatus;
}): Promise<{ ok: true } | { error: string }> {
  const { data: ticket } = await serviceClient
    .from("support_tickets")
    .select(TICKET_CORE_FIELDS)
    .eq("id", ticketId)
    .maybeSingle<TicketRow>();
  if (!ticket) return { error: "Ticket not found." };
  if (ticket.status === status) return { ok: true };

  const nowIso = new Date().toISOString();
  const { error } = await serviceClient
    .from("support_tickets")
    .update({
      status,
      ...statusTimestamps(status, nowIso),
      updated_at: nowIso,
    })
    .eq("id", ticket.id);
  if (error) {
    console.error("[support] status change failed:", error.message);
    return { error: "Couldn't update the status. Try again." };
  }

  // Artists are notified only for the states that end their waiting.
  if (status === "resolved" || status === "closed") {
    const { email } = await artistIdentity(ticket.artist_id);
    if (email !== "unknown") {
      await safeNotify("artist status-changed", () =>
        sendEmail({
          to: email,
          subject: `[${ticket.reference}] Ticket ${SUPPORT_STATUS_LABELS[status].toLowerCase()}: ${ticket.subject}`,
          html: supportStatusChangedEmail({
            reference: ticket.reference,
            subject: ticket.subject,
            statusLabel: SUPPORT_STATUS_LABELS[status],
            ticketUrl: artistTicketUrl(ticket.id),
          }),
        }),
      );
    }
    await safeNotify("artist in-app status", () =>
      createNotification({
        artistId: ticket.artist_id,
        type: "info",
        category: "info",
        priority: "low",
        title: `Ticket ${ticket.reference} ${SUPPORT_STATUS_LABELS[status].toLowerCase()}`,
        message: ticket.subject,
        ctaLabel: "View ticket",
        ctaHref: `/support/${ticket.id}`,
      }),
    );
  }

  void writeAudit({
    action: "support_status_changed",
    actor: adminId,
    category: "admin",
    details: { reference: ticket.reference, from: ticket.status, to: status },
  });

  return { ok: true };
}

// ─── Admin dashboard summary ─────────────────────────────────────────────────

export async function getSupportSummary(): Promise<{
  needsAttention: number;
  total: number;
}> {
  const [attention, total] = await Promise.all([
    serviceClient
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "awaiting_support"]),
    serviceClient
      .from("support_tickets")
      .select("id", { count: "exact", head: true }),
  ]);
  return {
    needsAttention: attention.count ?? 0,
    total: total.count ?? 0,
  };
}

// ─── Artist read-state ───────────────────────────────────────────────────────

/** Stamp the artist's last view of a ticket they own. Idempotent. */
export async function markTicketSeen(
  ticketId: string,
  artistId: string,
): Promise<void> {
  await serviceClient
    .from("support_tickets")
    .update({ artist_seen_at: new Date().toISOString() })
    .eq("id", ticketId)
    .eq("artist_id", artistId);
}
