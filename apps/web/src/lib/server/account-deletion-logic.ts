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

/**
 * The anonymized financial snapshot retained past deletion. Money + Stripe
 * identifiers ONLY — never client PII. Orders are passed already stripped of
 * client_email. ⚠️ Conservative default; counsel must confirm the field set.
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
