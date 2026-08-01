// Pure, side-effect-free logic for account deletion (unit-tested). The
// orchestration that touches the DB / Stripe / storage lives in
// account-deletion.ts and imports these.
//
// Per legal counsel (docs/account-deletion-handoff.md): erasure is NOT
// conditioned on financial resolution. Deletion always proceeds; an unresolved
// deposit's pseudonymised record is RETAINED to preserve the client's refund
// route and the parties' legal claims, not used to block.
import { platformFeeEur } from "@/lib/platform-fee";

export type DepositBookingRow = {
  id: string;
  deposit_payment_intent_id: string | null;
  deposit_paid_at: string | null;
  deposit_amount: string | number | null;
  deposit_currency: string | null;
  // G2 (FEE-STP-001): the ACTUAL fee Stripe took on this deposit, in cents
  // (migration 0116, stamped at settlement). Preferred in `buildFinancialSnapshot`
  // over recomputing the 3% constant, which is wrong for a sponsored deposit
  // (waived to 0) and for anything settled at a tier other than the flat v1
  // rate. Optional: rows settled before 0116 (or a select that omits it)
  // carry no stamp, and the snapshot falls back to the computation for those.
  platform_fee_collected_cents?: number | null;
};

/**
 * Split an artist's deposit bookings:
 * - liveUnpaid: an intent exists but isn't paid → cancelled so no client can pay
 *   into a gone account (a transient cancel failure retries, it does NOT block).
 * - paid: an intent exists and is paid (settled into the artist's balance).
 * - paidUnresolved: paid AND not refunded/forfeited → its record is RETAINED to
 *   preserve the client's refund route (per counsel; this no longer blocks).
 */
export function categorizeDepositBookings(
  rows: DepositBookingRow[],
  resolvedBookingIds: Set<string>,
) {
  const withIntent = rows.filter((r) => r.deposit_payment_intent_id);
  const liveUnpaid = withIntent.filter((r) => !r.deposit_paid_at);
  const paid = withIntent.filter((r) => r.deposit_paid_at);
  // `paidUnresolved` is a leftover from the pre-counsel block era — the
  // orchestrator no longer consumes it (it retains ALL paid deposits with a
  // per-row `resolved` flag instead). Kept only to document intent + for the
  // unit tests; deletion never branches on it.
  const paidUnresolved = paid.filter((r) => !resolvedBookingIds.has(r.id));
  return { liveUnpaid, paid, paidUnresolved };
}

// Order statuses that represent money having moved — only these are retained
// (never-paid order shells carry no tax/AML obligation).
export const ORDER_MONEY_STATES = ["paid", "refunded", "partially_refunded"];

// ALLOWLIST of order columns kept in the retained snapshot. Inverting the old
// denylist (strip client_email) to an allowlist means a future PII column added
// to `orders` can NEVER silently leak into the long-retained, FK-less archive.
// Money + Stripe identifiers only; no client PII.
const ORDER_RETAINED_FIELDS = [
  "id",
  "booking_id",
  "stripe_payment_intent_id",
  "stripe_checkout_session_id",
  "status",
  "deposit_amount",
  "goods_amount",
  "subtotal_amount",
  "platform_fee_amount",
  "currency",
  "fulfillment_status",
  "created_at",
];

/** Pick ONLY the allowlisted financial fields from an order row (no client PII). */
export function pseudonymizeOrder(
  order: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ORDER_RETAINED_FIELDS) {
    if (key in order) out[key] = order[key];
  }
  return out;
}

/**
 * The PSEUDONYMISED financial record retained past deletion (counsel §4/§5):
 * money + Stripe identifiers ONLY, never client PII. It remains in-scope personal
 * data (the Stripe/internal IDs permit re-identification) and is retained under
 * Art. 6(1)(c) for Estonian accounting/tax law (7 years). The retained fields are
 * the counsel-confirmed allowlist: fee amount, deposit amount (the fee basis),
 * currency, Stripe payment-intent ID, status, timestamps, internal booking ID.
 * Each deposit carries a `resolved` flag so an unresolved one's record preserves
 * the client's refund route. Orders are passed already pseudonymised.
 */
export type BillingSnapshot = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string | null;
  contractCustomerType: string | null;
  canceledForDeletion: boolean;
};

export function buildFinancialSnapshot(
  paidDeposits: DepositBookingRow[],
  resolvedBookingIds: Set<string>,
  pseudonymizedOrders: Record<string, unknown>[],
  billing?: BillingSnapshot | null,
) {
  return {
    schemaVersion: 2,
    deposits: paidDeposits.map((d) => {
      const amount = d.deposit_amount != null ? Number(d.deposit_amount) : null;
      // G2 (FEE-STP-001): prefer the ACTUAL fee Stripe took (stamped at
      // settlement, migration 0116) over recomputing the 3% constant, which is
      // wrong whenever the deposit was sponsored (waived to 0) or settled
      // under a tier/schedule other than v1's flat rate. Only rows with no
      // stamp (pre-0116, or a caller that selected fewer columns) fall back to
      // the computation, which is a genuine approximation for those.
      const platformFeeAmount =
        typeof d.platform_fee_collected_cents === "number"
          ? d.platform_fee_collected_cents / 100
          : amount != null
            ? platformFeeEur(amount)
            : null;
      return {
        bookingId: d.id,
        paymentIntentId: d.deposit_payment_intent_id,
        amount,
        platformFeeAmount,
        currency: d.deposit_currency,
        paidAt: d.deposit_paid_at,
        // Resolved = refunded/forfeited at deletion time. An unresolved deposit's
        // record is what preserves the client's refund route (counsel §3).
        resolved: resolvedBookingIds.has(d.id),
      };
    }),
    orders: pseudonymizedOrders,
    billing: billing ?? null,
  };
}
