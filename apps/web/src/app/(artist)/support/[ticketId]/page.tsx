import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markTicketSeen } from "@/lib/server/support";
import { UUID_RE } from "@/lib/mobile-booking-form";
import {
  SUPPORT_CATEGORY_LABELS,
  canArtistReply,
  type SupportCategory,
  type SupportStatus,
} from "@/lib/support";
import SupportStatusChip from "../support-status-chip";
import ReplyForm from "./reply-form";

export const metadata = { title: "Support ticket" };

type TicketRow = {
  id: string;
  reference: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  description: string;
  expected_behavior: string;
  actual_behavior: string;
  reproduction_steps: string | null;
  relevant_area: string | null;
  device_info: string | null;
  platform_info: string | null;
  additional_context: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  author_role: "artist" | "admin";
  body: string;
  created_at: string;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RequestField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {value}
      </dd>
    </div>
  );
}

export default async function SupportTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { ticketId } = await params;
  const { created } = await searchParams;
  if (!UUID_RE.test(ticketId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  // RLS: this returns null for tickets the artist does not own.
  const { data: ticketData } = await supabase
    .from("support_tickets")
    .select(
      "id, reference, subject, category, status, description, expected_behavior, actual_behavior, reproduction_steps, relevant_area, device_info, platform_info, additional_context, created_at, updated_at",
    )
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticketData) notFound();
  const ticket = ticketData as TicketRow;

  // RLS: internal notes never reach this query.
  const { data: messageData } = await supabase
    .from("support_ticket_messages")
    .select("id, author_role, body, created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });
  const messages = (messageData ?? []) as MessageRow[];

  await markTicketSeen(ticket.id, user.id);

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="space-y-3">
        <Link
          href="/support"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← All tickets
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted-foreground">
              {ticket.reference}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {ticket.subject}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {SUPPORT_CATEGORY_LABELS[ticket.category]} · opened{" "}
              {formatDateTime(ticket.created_at)} · last update{" "}
              {formatDateTime(ticket.updated_at)}
            </p>
          </div>
          <SupportStatusChip status={ticket.status} />
        </div>
      </div>

      {created === "1" && (
        <div className="rounded-md border border-brand-mustard/50 bg-brand-mustard/10 px-4 py-3">
          <p className="text-sm text-foreground">
            Your support request has been created. We will email you when there
            is an update, and the full conversation stays inside Inklee.
          </p>
        </div>
      )}

      <section className="space-y-4 rounded-md border border-border px-4 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Your report
        </h2>
        <dl className="space-y-4">
          <RequestField
            label="What is going wrong"
            value={ticket.description}
          />
          <RequestField label="Expected" value={ticket.expected_behavior} />
          <RequestField
            label="Actually happened"
            value={ticket.actual_behavior}
          />
          <RequestField
            label="Steps to reproduce"
            value={ticket.reproduction_steps}
          />
          <RequestField
            label="Relevant page or feature"
            value={ticket.relevant_area}
          />
          <RequestField label="Device" value={ticket.device_info} />
          <RequestField label="Browser or app" value={ticket.platform_info} />
          <RequestField
            label="Additional context"
            value={ticket.additional_context}
          />
        </dl>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border pb-3">
          Conversation
        </h2>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No replies yet. The Inklee team has been notified and will respond
            here.
          </p>
        ) : (
          <ol className="space-y-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-border px-4 py-3"
              >
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {m.author_role === "admin" ? "Inklee support" : "You"}
                  </span>{" "}
                  · {formatDateTime(m.created_at)}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                  {m.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        {canArtistReply(ticket.status) ? (
          <ReplyForm
            ticketId={ticket.id}
            resolved={ticket.status === "resolved"}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            This ticket is closed. If you need more help, open a new support
            request from the{" "}
            <Link
              href="/support"
              className="text-foreground underline underline-offset-4"
            >
              support page
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
