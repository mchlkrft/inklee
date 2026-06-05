"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type {
  getKpis,
  getOnboardingFunnel,
  getBookingFunnel,
  getFeatureAdoption,
  getQualitySignals,
  getArtistRoster,
  getIntegrityFlags,
} from "@/lib/admin-queries";

type Props = {
  range: string;
  kpis: Awaited<ReturnType<typeof getKpis>>;
  onboardingFunnel: Awaited<ReturnType<typeof getOnboardingFunnel>>;
  bookingFunnel: Awaited<ReturnType<typeof getBookingFunnel>>;
  featureAdoption: Awaited<ReturnType<typeof getFeatureAdoption>>;
  quality: Awaited<ReturnType<typeof getQualitySignals>>;
  artists: Awaited<ReturnType<typeof getArtistRoster>>;
  integrity: Awaited<ReturnType<typeof getIntegrityFlags>>;
};

const RANGES = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "All time", value: "all" },
];

function delta(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function deltaColor(current: number, previous: number): string {
  if (previous === 0) return "text-muted-foreground";
  return current >= previous ? "text-green-500" : "text-red-500";
}

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

export default function AdminClient({
  range,
  kpis,
  onboardingFunnel,
  bookingFunnel,
  featureAdoption,
  quality,
  artists,
  integrity,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setRange(value: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("range", value);
    router.push(`/admin?${p.toString()}`);
  }

  const maxOnboard = onboardingFunnel[0]?.count ?? 1;
  const maxBooking = bookingFunnel[0]?.count ?? 1;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-10">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Admin Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Internal. Not artist-facing.
            </p>
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  range === r.value
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Row */}
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Key metrics
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Total artists" value={kpis.totalArtists} />
            <KpiCard
              label="Activated"
              value={kpis.activatedArtists}
              sub={
                kpis.activationRate !== null
                  ? `${kpis.activationRate}% rate`
                  : undefined
              }
            />
            <KpiCard
              label="New signups"
              value={kpis.newSignups.current}
              sub={
                delta(kpis.newSignups.current, kpis.newSignups.previous) ??
                undefined
              }
              subColor={deltaColor(
                kpis.newSignups.current,
                kpis.newSignups.previous,
              )}
            />
            <KpiCard
              label="Active artists"
              value={kpis.activeArtists.current}
              sub={
                delta(
                  kpis.activeArtists.current,
                  kpis.activeArtists.previous,
                ) ?? undefined
              }
              subColor={deltaColor(
                kpis.activeArtists.current,
                kpis.activeArtists.previous,
              )}
            />
            <KpiCard
              label="Booking requests"
              value={kpis.bookings.current}
              sub={
                delta(kpis.bookings.current, kpis.bookings.previous) ??
                undefined
              }
              subColor={deltaColor(
                kpis.bookings.current,
                kpis.bookings.previous,
              )}
            />
            <KpiCard
              label="Confirmed"
              value={kpis.confirmed.current}
              sub={
                kpis.confirmRate !== null
                  ? `${kpis.confirmRate}% of requests`
                  : undefined
              }
            />
            <KpiCard
              label="Cancellation rate"
              value={kpis.cancelRate !== null ? `${kpis.cancelRate}%` : "—"}
            />
            <KpiCard
              label="Median response"
              value={fmtHours(kpis.medianResponseHours)}
            />
          </div>
        </section>

        {/* Quality signals */}
        {(quality.overdueDeposits > 0 ||
          quality.deadAccounts > 0 ||
          quality.pendingOld > 0) && (
          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Quality signals
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {quality.overdueDeposits > 0 && (
                <QualityCard
                  label="Overdue deposits"
                  count={quality.overdueDeposits}
                  severity="high"
                  hint="Deposit pending past due date"
                />
              )}
              {quality.pendingOld > 0 && (
                <QualityCard
                  label="Stale pending requests"
                  count={quality.pendingOld}
                  severity="medium"
                  hint="No response in 7+ days"
                />
              )}
              {quality.deadAccounts > 0 && (
                <QualityCard
                  label="Dead accounts"
                  count={quality.deadAccounts}
                  severity="low"
                  hint="Activated but zero bookings ever"
                />
              )}
            </div>
          </section>
        )}

        {/* Onboarding funnel */}
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Onboarding funnel
          </h2>
          <div className="rounded-md border border-border p-5 space-y-3">
            {onboardingFunnel.map((step, i) => {
              const pct =
                maxOnboard > 0
                  ? Math.round((step.count / maxOnboard) * 100)
                  : 0;
              const dropoff =
                i > 0
                  ? Math.round(
                      ((onboardingFunnel[i - 1].count - step.count) /
                        (onboardingFunnel[i - 1].count || 1)) *
                        100,
                    )
                  : null;
              return (
                <div key={step.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{step.label}</span>
                    <div className="flex items-center gap-3">
                      {dropoff !== null && dropoff > 0 && (
                        <span className="text-xs text-red-500">
                          −{dropoff}%
                        </span>
                      )}
                      <span className="text-muted-foreground w-10 text-right tabular-nums">
                        {step.count}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-foreground/40 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Booking funnel */}
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Booking funnel
          </h2>
          <div className="rounded-md border border-border p-5 space-y-3">
            {bookingFunnel.map((step, i) => {
              const pct =
                maxBooking > 0
                  ? Math.round((step.count / maxBooking) * 100)
                  : 0;
              const isNegative = ["Rejected", "Cancelled"].includes(step.label);
              return (
                <div key={step.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{step.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {maxBooking > 0 ? `${pct}%` : ""}
                      </span>
                      <span className="text-muted-foreground w-10 text-right tabular-nums">
                        {step.count}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isNegative ? "bg-red-500/40" : "bg-foreground/40"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Feature adoption */}
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Feature adoption
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {featureAdoption.map((f) => (
              <div
                key={f.feature}
                className="rounded-md border border-border p-4 space-y-2"
              >
                <p className="text-xs text-muted-foreground">{f.feature}</p>
                <p className="text-2xl font-semibold tabular-nums">{f.pct}%</p>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-foreground/50"
                    style={{ width: `${f.pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {f.users} artist{f.users !== 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Artist roster */}
        <ArtistRoster artists={artists} />

        {/* Booking integrity */}
        {(integrity.approvedNoDecidedAt > 0 ||
          integrity.depositPendingNoAmount > 0 ||
          integrity.unreconciled > 0) && (
          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Booking integrity
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {integrity.approvedNoDecidedAt > 0 && (
                <QualityCard
                  label="Approved, no decided_at"
                  count={integrity.approvedNoDecidedAt}
                  severity="medium"
                  hint="Status mismatch — decided_at is null"
                />
              )}
              {integrity.depositPendingNoAmount > 0 && (
                <QualityCard
                  label="Deposit pending, no amount"
                  count={integrity.depositPendingNoAmount}
                  severity="high"
                  hint="deposit_amount is null on deposit_pending booking"
                />
              )}
              {integrity.unreconciled > 0 && (
                <QualityCard
                  label="Unreconciled deposits"
                  count={integrity.unreconciled}
                  severity="medium"
                  hint="Deposit due >7 days ago, not paid, not cancelled"
                />
              )}
            </div>
          </section>
        )}

        {/* Instrumentation gaps note */}
        <section className="rounded-md border border-border/50 bg-muted/20 px-5 py-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Instrumentation gaps
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>
              Booking page views — needs edge middleware or Plausible event
            </li>
            <li>Form started but abandoned — needs client-side event</li>
            <li>Email delivery failures — needs Resend webhook → audit_log</li>
            <li>
              Active artists uses booking activity as proxy — add last_seen_at
              to profiles for accuracy
            </li>
            <li>
              Retention cohorts — requires user-level event stream (not yet
              instrumented)
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-green-500/10 text-green-600",
    suspended: "bg-orange-400/10 text-orange-500",
    archived: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-xs ${map[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

function ArtistRoster({
  artists,
}: {
  artists: Awaited<ReturnType<typeof getArtistRoster>>;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = artists.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      a.displayName.toLowerCase().includes(q) ||
      a.slug.toLowerCase().includes(q);
    const matchStatus =
      statusFilter === "all" || a.accountStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Accounts ({artists.length})
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search name or slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-border bg-transparent px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-44"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {[
                "Artist",
                "Slug",
                "Status",
                "Onboarded",
                "Bookings",
                "Confirmed",
                "Last activity",
                "Joined",
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
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center text-xs text-muted-foreground"
                >
                  No accounts match the current filter.
                </td>
              </tr>
            )}
            {filtered.map((a) => (
              <tr
                key={a.id}
                className={`transition-colors hover:bg-muted/10 ${
                  a.accountStatus === "archived" ? "opacity-50" : ""
                }`}
              >
                <td className="px-4 py-2 font-medium text-foreground">
                  <span className="flex items-center gap-1.5">
                    {a.displayName}
                    {a.isTester && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        tester
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {a.slug}
                </td>
                <td className="px-4 py-2">{statusBadge(a.accountStatus)}</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      a.activated
                        ? "bg-green-500/10 text-green-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {a.activated ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {a.totalBookings}
                </td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {a.approvedBookings}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {relTime(a.lastActivity)}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {relTime(a.createdAt)}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/admin/accounts/${a.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  sub,
  subColor = "text-muted-foreground",
}: {
  label: string;
  value: number | string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div className="rounded-md border border-border p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {sub && <p className={`text-xs ${subColor}`}>{sub}</p>}
    </div>
  );
}

function QualityCard({
  label,
  count,
  severity,
  hint,
}: {
  label: string;
  count: number;
  severity: "high" | "medium" | "low";
  hint: string;
}) {
  const color = {
    high: "border-red-500/30 bg-red-500/5 text-red-600",
    medium: "border-orange-400/30 bg-orange-400/5 text-orange-500",
    low: "border-muted bg-muted/20 text-muted-foreground",
  }[severity];

  return (
    <div className={`rounded-md border px-4 py-3 space-y-1 ${color}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{count}</p>
      <p className="text-xs opacity-70">{hint}</p>
    </div>
  );
}
