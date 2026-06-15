import type { SupabaseClient } from "@supabase/supabase-js";
import { customerLabel } from "@/lib/booking-domain";
import { depositState } from "@/lib/deposit-state";
import { relativeDueLabel } from "@inklee/shared/format";
import type {
  MobileDepositListItem,
  MobileDepositsResponse,
} from "@inklee/shared/mobile-api";

// The ONE source of truth for the cross-booking deposits overview, consumed by
// BOTH the web /bookings/deposits page and the mobile GET
// /api/mobile/bookings/deposits route so the two surfaces can never disagree
// (the founder one-source-of-truth rule). Every booking that carries a deposit,
// classified via the single `depositState` classifier (+ the deposit_refunded
// audit lookup), with Outstanding / Overdue / Collected rollups for the header
// and a server-computed relative `dueLabel` per outstanding row. The actual
// request / mark-received / refund actions live on the booking detail; this is
// read-only. RLS scopes both queries to the artist's own bookings.
//
// `now` is computed internally (not a param) so a server-component caller can
// stay pure under the React Compiler lint, mirroring getDashboardData.

type DepositRow = {
  id: string;
  status: string;
  customer_handle: string | null;
  customer_email: string | null;
  deposit_amount: string | number | null;
  deposit_currency: string | null;
  deposit_due_at: string | null;
  deposit_paid_at: string | null;
  deposit_payment_intent_id: string | null;
  created_at: string;
};

export async function getDepositsOverview(
  supabase: SupabaseClient,
  userId: string,
): Promise<MobileDepositsResponse> {
  const { data, error } = await supabase
    .from("booking_requests")
    .select(
      "id, status, customer_handle, customer_email, deposit_amount, deposit_currency, deposit_due_at, deposit_paid_at, deposit_payment_intent_id, created_at",
    )
    .eq("artist_id", userId)
    .not("deposit_amount", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as DepositRow[];

  // Refunds live in the audit log, not a column — one batched lookup marks the
  // refunded bookings instead of an audit query per row.
  const ids = rows.map((r) => r.id);
  const refunded = new Set<string>();
  if (ids.length > 0) {
    const { data: refunds } = await supabase
      .from("audit_log")
      .select("booking_id")
      .eq("action", "deposit_refunded")
      .in("booking_id", ids);
    for (const r of (refunds ?? []) as { booking_id: string }[]) {
      refunded.add(r.booking_id);
    }
  }

  const now = Date.now();
  const items: MobileDepositListItem[] = rows.map((b) => {
    // Single source of truth: the same classifier the booking detail uses, so
    // the overview and the detail can never disagree on a deposit's state.
    const state = depositState(b, refunded.has(b.id), now);
    const outstanding = state === "awaiting" || state === "overdue";
    return {
      bookingId: b.id,
      client: customerLabel(b.customer_handle, b.customer_email),
      amount: b.deposit_amount != null ? Number(b.deposit_amount) : 0,
      currency: b.deposit_currency ?? "eur",
      dueAt: b.deposit_due_at,
      paidAt: b.deposit_paid_at,
      state,
      card: !!b.deposit_payment_intent_id,
      // Relative label only for the actionable (outstanding) rows; settled rows
      // render an absolute paid/returned label client-side.
      dueLabel:
        outstanding && b.deposit_due_at
          ? relativeDueLabel(b.deposit_due_at, now)
          : null,
    };
  });

  // Order for the UI: overdue, then awaiting, then paid, then refunded last.
  // Within a state the query's created-desc order is preserved (stable sort).
  const rank: Record<MobileDepositListItem["state"], number> = {
    overdue: 0,
    awaiting: 1,
    paid: 2,
    refunded: 3,
  };
  items.sort((a, b) => rank[a.state] - rank[b.state]);

  // Outstanding = awaiting + overdue; overdue is the urgent subset; collected =
  // paid. Refunded (money returned) counts in none of the rollups.
  const overdue = items.filter((i) => i.state === "overdue");
  const outstanding = items.filter(
    (i) => i.state === "awaiting" || i.state === "overdue",
  );
  const collected = items.filter((i) => i.state === "paid");
  // Rollups assume a single currency: an artist has one Stripe payout currency,
  // so every deposit_currency matches and summary.currency = the first row's is
  // correct. If deposits ever span currencies these sums would mix them under
  // one label; per-row amounts (each carrying their own currency) stay correct.
  const sum = (xs: MobileDepositListItem[]) =>
    xs.reduce((s, i) => s + i.amount, 0);

  return {
    items,
    summary: {
      currency: items[0]?.currency ?? "eur",
      outstandingCount: outstanding.length,
      outstandingAmount: sum(outstanding),
      overdueCount: overdue.length,
      overdueAmount: sum(overdue),
      collectedCount: collected.length,
      collectedAmount: sum(collected),
    },
  };
}
