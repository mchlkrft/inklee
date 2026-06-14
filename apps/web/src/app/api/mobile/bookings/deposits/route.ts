import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { customerLabel } from "@/lib/booking-domain";
import { depositState } from "@/lib/deposit-state";
import type {
  MobileDepositListItem,
  MobileDepositsResponse,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

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

// GET /api/mobile/bookings/deposits — the cross-booking deposits overview.
// Every booking that carries a deposit, classified (awaiting / overdue / paid /
// refunded) with outstanding + collected rollups for the header. The deposit
// REQUEST / mark-received / refund ACTIONS live on the booking detail; this is
// the read-only overview the web has no standalone equivalent of yet. RLS
// scopes both queries to the artist's own bookings.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("booking_requests")
    .select(
      "id, status, customer_handle, customer_email, deposit_amount, deposit_currency, deposit_due_at, deposit_paid_at, deposit_payment_intent_id, created_at",
    )
    .eq("artist_id", userId)
    .not("deposit_amount", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return mobileError(500, error.message);

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
  const items: MobileDepositListItem[] = rows.map((b) => ({
    bookingId: b.id,
    client: customerLabel(b.customer_handle, b.customer_email),
    amount: b.deposit_amount != null ? Number(b.deposit_amount) : 0,
    currency: b.deposit_currency ?? "eur",
    dueAt: b.deposit_due_at,
    paidAt: b.deposit_paid_at,
    // Single source of truth: the same classifier the booking detail uses, so
    // the overview and the detail can never disagree on a deposit's state.
    state: depositState(b, refunded.has(b.id), now),
    card: !!b.deposit_payment_intent_id,
  }));

  // Order for the UI: overdue, then awaiting, then paid, then refunded last.
  // Within a state the query's created-desc order is preserved (stable sort).
  const rank: Record<MobileDepositListItem["state"], number> = {
    overdue: 0,
    awaiting: 1,
    paid: 2,
    refunded: 3,
  };
  items.sort((a, b) => rank[a.state] - rank[b.state]);

  // Outstanding = awaiting + overdue; collected = paid. Refunded (money
  // returned) counts in neither rollup.
  const outstanding = items.filter(
    (i) => i.state === "awaiting" || i.state === "overdue",
  );
  const collected = items.filter((i) => i.state === "paid");

  const body: MobileDepositsResponse = {
    items,
    summary: {
      currency: items[0]?.currency ?? "eur",
      outstandingCount: outstanding.length,
      outstandingAmount: outstanding.reduce((s, i) => s + i.amount, 0),
      collectedCount: collected.length,
      collectedAmount: collected.reduce((s, i) => s + i.amount, 0),
    },
  };
  return mobileOk(body);
}
