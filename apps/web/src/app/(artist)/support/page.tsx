import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SUPPORT_FAQ } from "@/lib/support-faq";
import {
  SUPPORT_CATEGORY_LABELS,
  hasUnreadAdminReply,
  type SupportCategory,
  type SupportStatus,
} from "@/lib/support";
import SupportForm from "./support-form";
import SupportStatusChip from "./support-status-chip";

export const metadata = { title: "Support" };

type TicketListRow = {
  id: string;
  reference: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  created_at: string;
  updated_at: string;
  last_admin_reply_at: string | null;
  artist_seen_at: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function SupportPage() {
  const supabase = await createClient();
  // RLS limits this to the signed-in artist's own tickets.
  const { data } = await supabase
    .from("support_tickets")
    .select(
      "id, reference, subject, category, status, created_at, updated_at, last_admin_reply_at, artist_seen_at",
    )
    .order("updated_at", { ascending: false });
  const tickets = (data ?? []) as TicketListRow[];

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Support
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us what is going wrong and include as much detail as possible.
          Your request will be reviewed by the Inklee team. Replies and updates
          stay connected to your ticket, so you can return here at any time.
          Email is only used to let you know when something changes.
        </p>
      </div>

      {tickets.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border pb-3">
            Your tickets
          </h2>
          <ul className="divide-y divide-border rounded-md border border-border">
            {tickets.map((t) => {
              const unread = hasUnreadAdminReply(t);
              return (
                <li key={t.id}>
                  <Link
                    href={`/support/${t.id}`}
                    className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm text-foreground">
                        <span className="font-mono text-xs text-muted-foreground">
                          {t.reference}
                        </span>{" "}
                        <span className="font-medium">{t.subject}</span>
                        {unread && (
                          <span className="ml-2 rounded-full bg-brand-mustard px-2 py-0.5 text-[10px] font-semibold text-brand-charcoal">
                            New reply
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {SUPPORT_CATEGORY_LABELS[t.category]} · updated{" "}
                        {formatDate(t.updated_at)}
                      </p>
                    </div>
                    <SupportStatusChip status={t.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border pb-3">
          Common problems
        </h2>
        <div className="divide-y divide-border rounded-md border border-border">
          {SUPPORT_FAQ.map((item) => (
            <details key={item.question} className="group px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="mr-2 inline-block text-muted-foreground transition-transform group-open:rotate-90">
                  ›
                </span>
                {item.question}
              </summary>
              <div className="mt-2 space-y-2 pl-5">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </p>
                {item.href && (
                  <Link
                    href={item.href}
                    className="inline-block text-sm text-foreground underline underline-offset-4"
                  >
                    {item.linkLabel ?? "Open settings"}
                  </Link>
                )}
              </div>
            </details>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Didn&apos;t find your problem? Send us a request below.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border pb-3">
          New support request
        </h2>
        <SupportForm />
      </section>
    </div>
  );
}
