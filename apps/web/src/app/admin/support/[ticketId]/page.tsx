import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { serviceClient } from "@/lib/supabase/service";
import { UUID_RE } from "@/lib/mobile-booking-form";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  type SupportCategory,
  type SupportStatus,
} from "@/lib/support";
import { AdminReplyForm, AdminStatusForm } from "./admin-ticket-controls";

export const metadata = { title: "Admin · Support ticket" };

type TicketRow = {
  id: string;
  reference: string;
  artist_id: string;
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
  resolved_at: string | null;
  closed_at: string | null;
  last_artist_reply_at: string | null;
  last_admin_reply_at: string | null;
};

type MessageRow = {
  id: string;
  author_role: "artist" | "admin";
  visibility: "public" | "internal";
  body: string;
  created_at: string;
};

function fmt(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-xs text-foreground">{value}</dd>
    </div>
  );
}

function ReportField({
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

export default async function AdminSupportTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  await requireAdmin();
  const { ticketId } = await params;
  if (!UUID_RE.test(ticketId)) notFound();

  const { data: ticketData } = await serviceClient
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticketData) notFound();
  const ticket = ticketData as TicketRow;

  const [{ data: messageData }, { data: profile }, userRes] = await Promise.all(
    [
      serviceClient
        .from("support_ticket_messages")
        .select("id, author_role, visibility, body, created_at")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: true }),
      serviceClient
        .from("profiles")
        .select("id, display_name, slug, account_status")
        .eq("id", ticket.artist_id)
        .maybeSingle(),
      serviceClient.auth.admin.getUserById(ticket.artist_id).catch(() => null),
    ],
  );
  const messages = (messageData ?? []) as MessageRow[];
  const artistName =
    (profile?.display_name as string | null) ||
    (profile?.slug as string | null) ||
    "Unknown artist";
  const artistEmail = userRes?.data?.user?.email ?? "unknown";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            <Link href="/admin" className="hover:text-foreground">
              Admin
            </Link>{" "}
            /{" "}
            <Link href="/admin/support" className="hover:text-foreground">
              Support
            </Link>{" "}
            / {ticket.reference}
          </p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                {ticket.reference}
              </p>
              <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {SUPPORT_CATEGORY_LABELS[ticket.category]} ·{" "}
                {SUPPORT_STATUS_LABELS[ticket.status]}
              </p>
            </div>
            <AdminStatusForm
              ticketId={ticket.id}
              currentStatus={ticket.status}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="space-y-4 rounded-md border border-border px-4 py-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Original report
              </h2>
              <dl className="space-y-4">
                <ReportField
                  label="What is going wrong"
                  value={ticket.description}
                />
                <ReportField
                  label="Expected"
                  value={ticket.expected_behavior}
                />
                <ReportField
                  label="Actually happened"
                  value={ticket.actual_behavior}
                />
                <ReportField
                  label="Steps to reproduce"
                  value={ticket.reproduction_steps}
                />
                <ReportField
                  label="Relevant page or feature"
                  value={ticket.relevant_area}
                />
                <ReportField label="Device" value={ticket.device_info} />
                <ReportField
                  label="Browser or app"
                  value={ticket.platform_info}
                />
                <ReportField
                  label="Additional context"
                  value={ticket.additional_context}
                />
              </dl>
            </section>

            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border pb-3">
                Conversation
              </h2>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No replies yet.</p>
              ) : (
                <ol className="space-y-3">
                  {messages.map((m) => (
                    <li
                      key={m.id}
                      className={`rounded-md border px-4 py-3 ${
                        m.visibility === "internal"
                          ? "border-dashed border-brand-mustard/60 bg-brand-mustard/[0.06]"
                          : "border-border"
                      }`}
                    >
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {m.author_role === "admin"
                            ? "Inklee support"
                            : artistName}
                        </span>{" "}
                        · {fmt(m.created_at)}
                        {m.visibility === "internal" && (
                          <span className="ml-2 rounded-full border border-brand-mustard/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                            Internal note
                          </span>
                        )}
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                        {m.body}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="border-t border-border pt-6">
              <AdminReplyForm ticketId={ticket.id} />
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-md border border-border px-4 py-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Artist
              </h2>
              <p className="text-sm font-medium text-foreground">
                {artistName}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                {artistEmail}
              </p>
              {profile?.account_status ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Account status: {String(profile.account_status)}
                </p>
              ) : null}
              <Link
                href={`/admin/accounts/${ticket.artist_id}`}
                className="mt-3 inline-block text-xs text-foreground underline underline-offset-4"
              >
                Open account view →
              </Link>
            </section>

            <section className="rounded-md border border-border px-4 py-4">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Activity
              </h2>
              <dl className="divide-y divide-border">
                <MetaRow label="Created" value={fmt(ticket.created_at)} />
                <MetaRow label="Last update" value={fmt(ticket.updated_at)} />
                <MetaRow
                  label="Last artist reply"
                  value={fmt(ticket.last_artist_reply_at)}
                />
                <MetaRow
                  label="Last admin reply"
                  value={fmt(ticket.last_admin_reply_at)}
                />
                {ticket.resolved_at && (
                  <MetaRow label="Resolved" value={fmt(ticket.resolved_at)} />
                )}
                {ticket.closed_at && (
                  <MetaRow label="Closed" value={fmt(ticket.closed_at)} />
                )}
              </dl>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
