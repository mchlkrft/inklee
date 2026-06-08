// Pure, side-effect-free logic for account deletion (unit-tested). The
// orchestration that touches the DB / Stripe / storage lives in
// account-deletion.ts and imports these.

export type DepositBookingRow = {
  id: string;
  deposit_payment_intent_id: string | null;
  deposit_paid_at: string | null;
  deposit_amount: string | number | null;
  deposit_currency: string | null;
};

/**
 * Split an artist's deposit bookings into the three money-safety buckets.
 * - liveUnpaid: an intent exists but isn't paid → safe to cancel.
 * - paid: an intent exists and is paid (settled into the artist's balance).
 * - paidUnresolved: paid AND not refunded → BLOCKS deletion (client money in flight).
 */
export function categorizeDepositBookings(
  rows: DepositBookingRow[],
  refundedBookingIds: Set<string>,
) {
  const withIntent = rows.filter((r) => r.deposit_payment_intent_id);
  const liveUnpaid = withIntent.filter((r) => !r.deposit_paid_at);
  const paid = withIntent.filter((r) => r.deposit_paid_at);
  const paidUnresolved = paid.filter((r) => !refundedBookingIds.has(r.id));
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

/** Pick ONLY the allowlisted financial fields from an order row. */
export function anonymizeOrder(
  order: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ORDER_RETAINED_FIELDS) {
    if (key in order) out[key] = order[key];
  }
  return out;
}

/**
 * The anonymized financial snapshot retained past deletion. Money + Stripe
 * identifiers ONLY — never client PII. Orders are passed already anonymized via
 * anonymizeOrder. ⚠️ Conservative default; counsel must confirm the field set.
 */
export function buildFinancialSnapshot(
  paidDeposits: DepositBookingRow[],
  anonymizedOrders: Record<string, unknown>[],
) {
  return {
    schemaVersion: 1,
    deposits: paidDeposits.map((d) => ({
      bookingId: d.id,
      paymentIntentId: d.deposit_payment_intent_id,
      amount: d.deposit_amount != null ? Number(d.deposit_amount) : null,
      currency: d.deposit_currency,
      paidAt: d.deposit_paid_at,
    })),
    orders: anonymizedOrders,
  };
}
