// The ONE definition of a deposit's lifecycle state, shared by the booking
// detail (web page + mobile API route) and the deposits overview (web page +
// mobile route) so the surfaces can never disagree. Previously each derived
// state on its own: the web detail + overview ungated, the mobile detail gated,
// equivalent only by accident. This module makes that rule explicit and
// single-sourced across web + native (the founder one-source-of-truth rule).

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

export type DepositState =
  | "awaiting"
  | "overdue"
  | "paid"
  | "refunded"
  | "cancelled";

/**
 * Lifecycle state for a deposit row. `now` is injected (not read here) so
 * callers stay deterministic and the function is trivially testable.
 *
 * `bookingStatus` is required because an UNPAID deposit is only ever live
 * (awaiting / overdue) while the booking is actively `deposit_pending`. The
 * moment the booking moves on without the deposit being paid — the client or
 * artist cancelled, the artist passed, or the artist accepted directly — that
 * deposit is dead and must NOT keep reading as overdue forever (the founder bug:
 * a client-cancelled card deposit was stuck overdue with no way to clear it).
 * Such a deposit is classified `cancelled`: shown for reference, counted in no
 * outstanding/overdue rollup.
 */
export function depositState(
  row: DepositColumns,
  hasRefundAuditRow: boolean,
  now: number,
  bookingStatus: string,
): DepositState {
  // Money that actually moved wins, regardless of the booking's status: a paid
  // deposit forfeited on a client cancel stays "paid" (the artist kept it); a
  // refunded one stays "refunded".
  if (isDepositRefunded(row, hasRefundAuditRow)) return "refunded";
  if (row.deposit_paid_at) return "paid";
  // Unpaid + booking no longer awaiting the deposit ⇒ the request is dead.
  if (bookingStatus !== "deposit_pending") return "cancelled";
  if (row.deposit_due_at && new Date(row.deposit_due_at).getTime() < now) {
    return "overdue";
  }
  return "awaiting";
}
