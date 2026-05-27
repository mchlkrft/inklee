import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { getAccountDetail } from "@/lib/admin-queries";
import { parseBooksSettings } from "@/lib/books-settings";
import { parseFormSettings } from "@/lib/form-settings";
import AccountActions from "./account-actions";
import { publicArtistUrl } from "@/lib/public-url";

function relTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-500/10 text-green-600",
    suspended: "bg-orange-400/10 text-orange-500",
    archived: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border py-2.5 first:border-0 first:pt-0">
      <p className="text-xs text-muted-foreground shrink-0">{label}</p>
      <div className="text-xs text-foreground text-right">{value}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const adminId = await requireAdmin();

  const detail = await getAccountDetail(id);
  if (!detail.profile) notFound();

  const {
    profile,
    email,
    authLastSignIn,
    bookingCounts,
    flashCounts,
    tripCount,
    customFieldCount,
    emailTemplateCount,
    waitlistCount,
    recentBookings,
    adminActions,
    lastActivity,
  } = detail;

  const profileSettings = (profile.settings ?? {}) as Record<string, unknown>;
  const onboardingCompleted = profileSettings.onboarding_completed === true;
  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  const formSettings = parseFormSettings(profileSettings.form_settings);

  const publicUrl = publicArtistUrl(profile.slug);

  const accountStatus = (profile.account_status as string) ?? "active";
  const isSelf = adminId === profile.id;
  const isTester = profile.is_tester ?? false;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              href="/admin"
              className="hover:text-foreground transition-colors"
            >
              Admin
            </Link>
            <span>/</span>
            <span className="text-foreground">{profile.display_name}</span>
          </div>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold">
                  {profile.display_name}
                </h1>
                <StatusBadge status={accountStatus} />
              </div>
              <p className="text-sm text-muted-foreground font-mono">
                {profile.slug}
              </p>
            </div>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 transition-colors"
            >
              Public page ↗
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            {/* A. Overview */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Overview
              </h2>
              <div className="rounded-md border border-border px-4 py-3">
                <Row label="Email" value={email ?? "—"} />
                <Row
                  label="Account status"
                  value={<StatusBadge status={accountStatus} />}
                />
                <Row
                  label="Onboarding"
                  value={
                    <span
                      className={
                        onboardingCompleted
                          ? "text-green-500"
                          : "text-orange-400"
                      }
                    >
                      {onboardingCompleted ? "Complete" : "Incomplete"}
                    </span>
                  }
                />
                <Row label="Joined" value={fmtDate(profile.created_at)} />
                <Row label="Last activity" value={relTime(lastActivity)} />
                <Row label="Last sign-in" value={relTime(authLastSignIn)} />
                {accountStatus === "suspended" && profile.suspended_at && (
                  <Row
                    label="Suspended"
                    value={`${fmtDate(profile.suspended_at)}${profile.suspended_reason ? ` — ${profile.suspended_reason}` : ""}`}
                  />
                )}
                {accountStatus === "archived" && profile.deleted_at && (
                  <Row label="Archived" value={fmtDate(profile.deleted_at)} />
                )}
                <Row
                  label="Tester account"
                  value={
                    isTester ? (
                      <span className="rounded-full bg-brand-mustard/20 px-2 py-0.5 text-xs font-medium text-brand-charcoal">
                        Yes — excluded from analytics
                      </span>
                    ) : (
                      "No"
                    )
                  }
                />
                <Row label="Location" value={profile.location ?? "—"} />
                <Row
                  label="Instagram"
                  value={
                    profile.instagram_handle
                      ? `@${profile.instagram_handle}`
                      : "—"
                  }
                />
              </div>
            </section>

            {/* B. Usage insights */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Usage
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Total bookings" value={bookingCounts.total} />
                <StatCard label="Pending" value={bookingCounts.pending} />
                <StatCard label="Confirmed" value={bookingCounts.approved} />
                <StatCard label="Rejected" value={bookingCounts.rejected} />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Flash items" value={flashCounts.total} />
                <StatCard
                  label="Flash published"
                  value={flashCounts.published}
                />
                <StatCard label="Trips" value={tripCount} />
                <StatCard label="Waitlist entries" value={waitlistCount} />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Custom fields" value={customFieldCount} />
                <StatCard label="Email templates" value={emailTemplateCount} />
              </div>
            </section>

            {/* C. Configuration snapshot */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Configuration
              </h2>
              <div className="rounded-md border border-border px-4 py-3">
                <Row
                  label="Booking mode"
                  value={
                    profile.booking_mode === "fixed_slots"
                      ? "Fixed slots"
                      : "Preferred date"
                  }
                />
                <Row
                  label="Books open"
                  value={
                    <span
                      className={
                        booksSettings.books_open
                          ? "text-green-500"
                          : "text-muted-foreground"
                      }
                    >
                      {booksSettings.books_open ? "Yes" : "No"}
                    </span>
                  }
                />
                <Row
                  label="Booking cap"
                  value={
                    booksSettings.booking_cap !== null
                      ? String(booksSettings.booking_cap)
                      : "None"
                  }
                />
                <Row
                  label="Form: image upload"
                  value={formSettings.show_image_upload ? "On" : "Off"}
                />
                <Row
                  label="Form: require description"
                  value={formSettings.require_description ? "On" : "Off"}
                />
                <Row label="Has logo" value={profile.logo_url ? "Yes" : "No"} />
                <Row label="Has bio" value={profile.bio ? "Yes" : "No"} />
              </div>
            </section>

            {/* D. Recent activity */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recent bookings
              </h2>
              {recentBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No bookings yet.
                </p>
              ) : (
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {["Client", "Status", "Created"].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2 text-left font-medium text-muted-foreground"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentBookings.map((b) => (
                        <tr
                          key={b.id}
                          className="hover:bg-muted/10 transition-colors"
                        >
                          <td className="px-4 py-2 text-foreground">
                            @{b.customer_handle}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                b.status === "approved"
                                  ? "bg-green-500/10 text-green-600"
                                  : b.status === "rejected" ||
                                      b.status === "cancelled"
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-muted text-foreground"
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {relTime(b.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Admin action history */}
            {adminActions.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Admin action history
                </h2>
                <div className="rounded-md border border-border divide-y divide-border">
                  {adminActions.map((a) => (
                    <div
                      key={a.id}
                      className="px-4 py-3 flex items-start justify-between gap-4"
                    >
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-foreground font-mono">
                          {a.action}
                        </p>
                        {a.reason && (
                          <p className="text-xs text-muted-foreground">
                            {a.reason}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {relTime(a.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* E. Admin controls sidebar */}
          <div className="space-y-6">
            <section className="rounded-md border border-border p-5">
              <AccountActions
                accountId={profile.id}
                accountStatus={
                  accountStatus as "active" | "suspended" | "archived"
                }
                isSelf={isSelf}
                isTester={isTester}
              />
            </section>

            <section className="rounded-md border border-border p-5 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Quick links
              </p>
              <div className="space-y-1.5">
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View public booking page ↗
                </a>
                <Link
                  href="/admin"
                  className="block text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back to admin
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
