// The ONE definition of a deposit's lifecycle state, shared by the booking
// detail (web page + mobile API route) and the mobile deposits overview so the
// surfaces can never disagree. Previously each derived "refunded" on its own:
// the web detail and the overview ungated, the mobile detail gated -- equivalent
// only by accident (a `deposit_refunded` audit row is today only ever written
// for a paid in-app card deposit by refundDepositCore / chargeRefundedCore).
// This module makes that rule explicit and single-sourced.

export type DepositColumns = {
  deposit_amount: string | number | null;
  deposit_currency: string | null;
  deposit_due_at: string | null;
  deposit_paid_at: string | null;
  deposit_payment_intent_id: string | null;
};

/**
 * True only for a paid in-app CARD deposit (has an intent + a paid timestamp)
 * that has a refund logged. The intent+paid gate is belt-and-suspenders: it
 * stops a stray audit row from ever reading a manual or unpaid deposit as
 * refunded (manual deposits are never refunded through Inklee).
 *
 * @param hasRefundAuditRow a `deposit_refunded` audit_log row exists for the booking.
 */
export function isDepositRefunded(
  row: Pick<DepositColumns, "deposit_payment_intent_id" | "deposit_paid_at">,
  hasRefundAuditRow: boolean,
): boolean {
  return (
    !!row.deposit_payment_intent_id &&
    !!row.deposit_paid_at &&
    hasRefundAuditRow
  );
}

export type DepositState = "awaiting" | "overdue" | "paid" | "refunded";

/**
 * Lifecycle state for a deposit row. `now` is injected (not read here) so
 * callers stay deterministic and the function is trivially testable.
 */
export function depositState(
  row: DepositColumns,
  hasRefundAuditRow: boolean,
  now: number,
): DepositState {
  if (isDepositRefunded(row, hasRefundAuditRow)) return "refunded";
  if (row.deposit_paid_at) return "paid";
  if (row.deposit_due_at && new Date(row.deposit_due_at).getTime() < now) {
    return "overdue";
  }
  return "awaiting";
}
