"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  hasUnansweredArtistReply,
  needsAdminAttention,
  type SupportCategory,
  type SupportStatus,
} from "@/lib/support";

export type InboxTicket = {
  id: string;
  reference: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  lastArtistReplyAt: string | null;
  lastAdminReplyAt: string | null;
  artistName: string;
  artistEmail: string;
};

type StatusFilter = "attention" | "all" | SupportStatus;
type SortKey = "last_activity" | "oldest_unanswered" | "newest";

// The DB-shaped derivation expects snake_case fields.
function unansweredOf(t: InboxTicket): boolean {
  return hasUnansweredArtistReply({
    last_artist_reply_at: t.lastArtistReplyAt,
    last_admin_reply_at: t.lastAdminReplyAt,
  });
}

function relTime(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

export default function SupportInbox({
  tickets,
  limit,
}: {
  tickets: InboxTicket[];
  limit: number;
}) {
  // Default view = tickets that require admin attention.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("attention");
  const [categoryFilter, setCategoryFilter] = useState<"all" | SupportCategory>(
    "all",
  );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("last_activity");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = tickets.filter((t) => {
      if (statusFilter === "attention" && !needsAdminAttention(t)) return false;
      if (
        statusFilter !== "attention" &&
        statusFilter !== "all" &&
        t.status !== statusFilter
      ) {
        return false;
      }
      if (categoryFilter !== "all" && t.category !== categoryFilter)
        return false;
      if (q) {
        const hay =
          `${t.reference} ${t.subject} ${t.artistName} ${t.artistEmail}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list];
    if (sort === "last_activity") {
      list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    } else if (sort === "newest") {
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    } else {
      // Oldest unanswered first: unanswered tickets ascending by their last
      // artist activity, answered ones after.
      list.sort((a, b) => {
        const aU = unansweredOf(a) || !a.lastAdminReplyAt;
        const bU = unansweredOf(b) || !b.lastAdminReplyAt;
        if (aU !== bU) return aU ? -1 : 1;
        return a.updatedAt < b.updatedAt ? -1 : 1;
      });
    }
    return list;
  }, [tickets, statusFilter, categoryFilter, search, sort]);

  const selectCls =
    "rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">
              <Link href="/admin" className="hover:text-foreground">
                Admin
              </Link>{" "}
              / Support
            </p>
            <h1 className="text-2xl font-semibold">Support inbox</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {tickets.length === limit
                ? `Showing the latest ${limit} tickets.`
                : `${tickets.length} ticket${tickets.length === 1 ? "" : "s"} total.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="support-search">
            Search tickets
          </label>
          <input
            id="support-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, subject, artist, email"
            className="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <label className="sr-only" htmlFor="support-status-filter">
            Status filter
          </label>
          <select
            id="support-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={selectCls}
          >
            <option value="attention">Needs attention</option>
            <option value="all">All statuses</option>
            {SUPPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUPPORT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="support-category-filter">
            Category filter
          </label>
          <select
            id="support-category-filter"
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as "all" | SupportCategory)
            }
            className={selectCls}
          >
            <option value="all">All categories</option>
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SUPPORT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="support-sort">
            Sort
          </label>
          <select
            id="support-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className={selectCls}
          >
            <option value="last_activity">Last activity</option>
            <option value="oldest_unanswered">Oldest unanswered</option>
            <option value="newest">Newest created</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {[
                  "Ref",
                  "Subject",
                  "Artist",
                  "Category",
                  "Status",
                  "Created",
                  "Last activity",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2 text-left text-xs font-medium text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No tickets match the current filter.
                  </td>
                </tr>
              )}
              {filtered.map((t) => {
                const unanswered =
                  unansweredOf(t) ||
                  (!t.lastAdminReplyAt && needsAdminAttention(t));
                return (
                  <tr
                    key={t.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {t.reference}
                    </td>
                    <td className="max-w-[260px] px-4 py-2.5">
                      <span className="block truncate text-foreground">
                        {unanswered && (
                          <span
                            className="mr-1.5 inline-block rounded-full bg-brand-mustard px-1.5 py-0.5 align-middle text-[10px] font-semibold text-brand-charcoal"
                            title="Needs a reply"
                          >
                            Reply
                          </span>
                        )}
                        {t.subject}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="block text-foreground">
                        {t.artistName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t.artistEmail}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {SUPPORT_CATEGORY_LABELS[t.category]}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground">
                      {SUPPORT_STATUS_LABELS[t.status]}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {relTime(t.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {relTime(t.updatedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/admin/support/${t.id}`}
                        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
