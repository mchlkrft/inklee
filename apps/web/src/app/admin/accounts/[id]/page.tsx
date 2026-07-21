import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { getAccountDetail } from "@/lib/admin-queries";
import { getArtistGrowthTimeline } from "@/lib/growth-queries";
import { parseBooksSettings } from "@/lib/books-settings";
import { parseFormSettings } from "@/lib/form-settings";
import AccountActions from "./account-actions";
import AccountEntitlements from "./account-entitlements";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { deriveConnectRouting } from "@/lib/stripe-connect";
import { serviceClient } from "@/lib/supabase/service";
import { publicArtistUrl } from "@/lib/public-url";
import { formatDate, relativeTime } from "@/lib/format";
import { humanStatusLabel } from "@/lib/status-labels";

/** Growth cockpit stage labels (classifyStage values, definitions on
 *  /admin/growth/definitions). */
const GROWTH_STAGE_LABELS: Record<string, string> = {
  claimed_not_completed: "Page claimed, onboarding not completed",
  completed_no_requests: "Onboarding completed, no requests yet",
  requests_no_approval: "Requests received, none approved",
  activated: "Activated",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { classes: string; label: string }> = {
    active: { classes: "bg-brand-green/10 text-brand-green", label: "Active" },
    suspended: {
      classes: "bg-brand-mustard/10 text-brand-mustard",
      label: "Suspended",
    },
    archived: { classes: "bg-muted text-muted-foreground", label: "Archived" },
  };
  const badge = map[status] ?? {
    classes: "bg-muted text-muted-foreground",
    label: status,
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.classes}`}
    >
      {badge.label}
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

  // Slice 81: entitlements/sponsorship overrides + deposit usage for the panel.
  const overrides = await getAccountOverrides(id);
  const { data: paidDeposits } = await serviceClient
    .from("booking_requests")
    .select("deposit_amount")
    .eq("artist_id", id)
    .not("deposit_paid_at", "is", null);
  const depositUsage = {
    paidDepositCount: paidDeposits?.length ?? 0,
    depositVolumeCents: (paidDeposits ?? []).reduce(
      (s, r) => s + Math.round(Number(r.deposit_amount ?? 0) * 100),
      0,
    ),
  };

  // Growth cockpit timeline; null when the account is outside the growth
  // stats view (e.g. admin-owned accounts), which simply hides the section.
  const growth = await getArtistGrowthTimeline(id);

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

  // Connect state for the entitlements panel. Derived here because
  // deriveConnectRouting is pure but lives in a server-only module; the panel
  // is a client component and receives the plain result. No extra query: the
  // account detail already selects the profile's stripe_* columns.
  const connectRouting = deriveConnectRouting(
    profile as {
      stripe_account_id: string | null;
      stripe_account_status: string | null;
      stripe_charges_enabled: boolean | null;
    },
  );

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
              className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-4 py-1.5 transition-colors"
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
                <Row label="Email" value={email ?? "–"} />
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
                          ? "text-brand-green"
                          : "text-brand-mustard"
                      }
                    >
                      {onboardingCompleted ? "Complete" : "Incomplete"}
                    </span>
                  }
                />
                <Row
                  label="Joined"
                  value={
                    profile.created_at ? formatDate(profile.created_at) : "–"
                  }
                />
                <Row
                  label="Last activity"
                  value={lastActivity ? relativeTime(lastActivity) : "never"}
                />
                <Row
                  label="Last sign-in"
                  value={
                    authLastSignIn ? relativeTime(authLastSignIn) : "never"
                  }
                />
                {accountStatus === "suspended" && profile.suspended_at && (
                  <Row
                    label="Suspended"
                    value={`${formatDate(profile.suspended_at)}${profile.suspended_reason ? `: ${profile.suspended_reason}` : ""}`}
                  />
                )}
                {accountStatus === "archived" && profile.deleted_at && (
                  <Row
                    label="Archived"
                    value={formatDate(profile.deleted_at)}
                  />
                )}
                <Row
                  label="Tester account"
                  value={
                    isTester ? (
                      <span className="rounded-full bg-brand-mustard/20 px-2 py-0.5 text-xs font-medium text-brand-charcoal">
                        Yes, excluded from analytics
                      </span>
                    ) : (
                      "No"
                    )
                  }
                />
                <Row label="Location" value={profile.location ?? "–"} />
                <Row
                  label="Instagram"
                  value={
                    profile.instagram_handle
                      ? `@${profile.instagram_handle}`
                      : "–"
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
                          ? "text-brand-green"
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
                <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No bookings yet.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[480px] text-xs">
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
                                  ? "bg-brand-green/10 text-brand-green"
                                  : b.status === "rejected" ||
                                      b.status === "cancelled"
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-muted text-foreground"
                              }`}
                            >
                              {humanStatusLabel(b.status)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {b.created_at ? relativeTime(b.created_at) : "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Growth timeline (cockpit data) */}
            {growth && (
              <section className="space-y-3">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Growth timeline
                </h2>
                <div className="rounded-md border border-border px-4 py-3">
                  <Row
                    label="Activated"
                    value={
                      growth.activated ? (
                        <span className="text-brand-green">Yes</span>
                      ) : (
                        <span className="text-brand-mustard">No</span>
                      )
                    }
                  />
                  <Row
                    label="Stage"
                    value={GROWTH_STAGE_LABELS[growth.stage] ?? growth.stage}
                  />
                </div>
                {growth.timeline.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No growth events recorded yet.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border border-border divide-y divide-border">
                    {growth.timeline.map((event, index) => (
                      <div
                        key={`${event.at}-${event.label}-${index}`}
                        className="px-4 py-2.5 flex items-start justify-between gap-4"
                      >
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-foreground">
                            {event.label}
                          </p>
                          {event.detail && (
                            <p className="text-xs text-muted-foreground">
                              {event.detail}
                            </p>
                          )}
                        </div>
                        <p className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(event.at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

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
                        {a.created_at ? relativeTime(a.created_at) : "–"}
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

            <AccountEntitlements
              accountId={profile.id}
              overrides={overrides}
              usage={depositUsage}
              connect={{
                status: (profile.stripe_account_status as string) ?? "unset",
                routeCharges: connectRouting.routeCharges,
              }}
            />

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
