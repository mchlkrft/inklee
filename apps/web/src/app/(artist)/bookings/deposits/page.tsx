import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDepositsOverview } from "@/lib/server/deposits";
import { formatDate } from "@/lib/format";
import { formatMoneyShort } from "@inklee/shared/money";
import type { MobileDepositListItem } from "@inklee/shared/mobile-api";

// The cross-booking deposits chase view. Read-only: every row taps through to
// the booking detail (/bookings/requests/{id}) where the request / mark-received
// / refund actions live. Data comes from the shared getDepositsOverview builder
// (one source of truth with the mobile overview); money is formatted via the
// shared formatMoneyShort so the two surfaces render identical strings.
// Configuration (default amount, due window, cancellation + refund policy) lives
// at /settings/deposits.

function whenLabel(d: MobileDepositListItem): string {
  if (d.state === "paid")
    return d.paidAt ? `Paid ${formatDate(d.paidAt)}` : "Paid";
  if (d.state === "refunded") return "Returned to client";
  return d.dueLabel ?? "No due date";
}

function DepositRow({ d }: { d: MobileDepositListItem }) {
  const overdue = d.state === "overdue";
  return (
    <Link
      href={`/bookings/requests/${d.bookingId}`}
      className={`flex items-center justify-between gap-3 rounded-[14px] border px-4 py-3 transition-colors hover:bg-[color:var(--color-workspace-hover)] ${
        overdue
          ? "border-destructive/30 bg-destructive/[0.04]"
          : "border-border"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {d.client}
        </p>
        <p
          className={`mt-0.5 text-xs ${
            overdue ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {whenLabel(d)}
        </p>
      </div>
      <p className="shrink-0 text-sm font-semibold text-foreground">
        {formatMoneyShort(d.amount, d.currency)}
      </p>
    </Link>
  );
}

function Section({
  title,
  items,
  danger = false,
}: {
  title: string;
  items: MobileDepositListItem[];
  danger?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2
        className={`text-xs font-semibold uppercase tracking-[0.14em] ${
          danger ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {title} {items.length}
      </h2>
      <div className="space-y-2">
        {items.map((d) => (
          <DepositRow key={d.bookingId} d={d} />
        ))}
      </div>
    </section>
  );
}

export default async function DepositsOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { items, summary } = await getDepositsOverview(supabase, user!.id);

  const overdue = items.filter((i) => i.state === "overdue");
  const awaiting = items.filter((i) => i.state === "awaiting");
  const collected = items.filter((i) => i.state === "paid");
  const refunded = items.filter((i) => i.state === "refunded");
  const hasOutstanding = summary.outstandingCount > 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Deposits
        </h1>
        <Link
          href="/settings/deposits"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Settings
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-border px-5 py-10 text-center">
          <p className="text-sm font-medium text-foreground">No deposits yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Accept a request, then choose Request deposit on the booking to
            collect one.
          </p>
        </div>
      ) : (
        <>
          {/* Hero: Outstanding is the one number; overdue broken out louder,
              Collected demoted to a quiet secondary line. */}
          <div className="rounded-[20px] border border-border p-5">
            {hasOutstanding ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Outstanding
                </p>
                <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground">
                  {formatMoneyShort(
                    summary.outstandingAmount,
                    summary.currency,
                  )}
                </p>
                {summary.overdueCount > 0 && (
                  <p className="mt-1 text-sm font-medium text-destructive">
                    {summary.overdueCount} overdue ·{" "}
                    {formatMoneyShort(summary.overdueAmount, summary.currency)}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  Nothing to chase
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You&apos;re all caught up.
                </p>
              </>
            )}
            <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
              Collected{" "}
              {formatMoneyShort(summary.collectedAmount, summary.currency)}
            </p>
          </div>

          <Section title="Overdue" items={overdue} danger />
          <Section title="Awaiting" items={awaiting} />
          <Section title="Collected" items={collected} />
          <Section title="Refunded" items={refunded} />
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Set your default amount, due window, and cancellation and refund policy
        in{" "}
        <Link
          href="/settings/deposits"
          className="underline underline-offset-2 hover:text-foreground"
        >
          deposit settings
        </Link>
        .
      </p>
    </div>
  );
}
