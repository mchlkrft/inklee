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

// BDEL-PAY-001: the P9 appointment-payment tables (migration 0125) all cascade
// from `profiles` and did not exist when the deposit/order archive above was
// designed, so a paid appointment request was destroyed with no retained
// record at all. Same allowlist discipline as `ORDER_RETAINED_FIELDS`: money
// and Stripe identifiers only, artist_id excluded (redundant with the
// `deleted_account_records.artist_id` column the snapshot already lives
// under).
//
// `payment_request_lines.description` is DELIBERATELY excluded. It is
// free-text typed by the artist at request-creation time (appointment-
// payments.ts:506, trimmed(input.description, ...)) with no structural limit
// on what it can contain, and counsel's allowlist (account-deletion-handoff.md
// §4) excludes "free-text booking answers" and "Client notes" for exactly this
// reason. `name` survives: counsel's own words for a goods line item are
// "product descriptor and price only", and `name` is that descriptor for a
// service or goods line, required (not optional) at line-creation, matching
// the deposit/order precedent above of retaining structure, never prose.
const PAYMENT_REQUEST_RETAINED_FIELDS = [
  "id",
  "booking_id",
  "project_id",
  "status",
  "currency",
  "total_minor",
  "revision",
  "supersedes_id",
  "fee_schedule_version",
  "sent_at",
  "viewed_at",
  "expires_at",
  "cancelled_at",
  "created_at",
];

const PAYMENT_REQUEST_LINE_RETAINED_FIELDS = [
  "id",
  "request_id",
  "name",
  "quantity",
  "unit_amount_minor",
  "line_total_minor",
  "currency",
  "classification",
  "tax_treatment",
  "refund_status",
  "source",
  "product_id",
  "position",
  "created_at",
];

// payment_collections has no client-attributable columns at all: it is purely
// the Stripe PaymentIntent group key plus the subject it settles. Retained
// wholesale, minus artist_id.
const PAYMENT_COLLECTION_RETAINED_FIELDS = [
  "payment_intent_id",
  "booking_id",
  "project_id",
  "currency",
  "created_at",
];

// payment_allocations is the record that money moved (spec section 7): every
// column is either an amount, a Stripe identifier, or a pointer to another
// retained/already-deleted row. No client PII was ever storable here (the
// table is SERVICE-ROLE-WRITE-ONLY, migration 0125's "WHICH CLIENT WRITES
// WHAT" header). Retained wholesale, minus artist_id.
const PAYMENT_ALLOCATION_RETAINED_FIELDS = [
  "id",
  "booking_id",
  "project_id",
  "request_id",
  "line_id",
  "payment_intent_id",
  "component",
  "amount_minor",
  "collected_total_minor",
  "currency",
  "status",
  "settled_at",
  "created_at",
];

/** Pick ONLY the given allowlisted fields from a row. Shared by every
 *  pseudonymize* function below so the allowlist-not-denylist property (a
 *  future PII column can never silently leak in) is enforced in one place. */
function pickAllowlisted(
  row: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of fields) {
    if (key in row) out[key] = row[key];
  }
  return out;
}

/** Pick ONLY the allowlisted financial fields from an order row (no client PII). */
export function pseudonymizeOrder(
  order: Record<string, unknown>,
): Record<string, unknown> {
  return pickAllowlisted(order, ORDER_RETAINED_FIELDS);
}

export function pseudonymizePaymentRequest(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return pickAllowlisted(row, PAYMENT_REQUEST_RETAINED_FIELDS);
}

export function pseudonymizePaymentRequestLine(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return pickAllowlisted(row, PAYMENT_REQUEST_LINE_RETAINED_FIELDS);
}

export function pseudonymizePaymentCollection(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return pickAllowlisted(row, PAYMENT_COLLECTION_RETAINED_FIELDS);
}

export function pseudonymizePaymentAllocation(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return pickAllowlisted(row, PAYMENT_ALLOCATION_RETAINED_FIELDS);
}

/** The pseudonymised P9 subset retained past deletion (BDEL-PAY-001). Only
 *  requests that were ever SENT are retained — same principle as
 *  `ORDER_MONEY_STATES` below: a draft never shown to a client is not a
 *  financial or client-facing document and carries no retention obligation.
 *  Collections and allocations are retained unconditionally for the artist:
 *  both are written only at settlement (service-role-only, migration 0125),
 *  so by construction every row that exists represents money that actually
 *  moved. */
export type AppointmentPaymentsSnapshot = {
  requests: Record<string, unknown>[];
  lines: Record<string, unknown>[];
  collections: Record<string, unknown>[];
  allocations: Record<string, unknown>[];
};

export const EMPTY_APPOINTMENT_PAYMENTS_SNAPSHOT: AppointmentPaymentsSnapshot =
  {
    requests: [],
    lines: [],
    collections: [],
    allocations: [],
  };

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
  /**
   * Counsel Q12: deletion ends an active paid subscription NOW and refunds the
   * unused part of the current period pro rata. This records what was owed and
   * whether it was actually paid out.
   *
   * `refundState: "pending"` is the load-bearing value. Erasure is never
   * blocked on financial resolution (counsel §3), so a Stripe failure at that
   * instant must not stop the deletion — but the money is still owed, and the
   * account it was owed to is about to stop existing. These fields are the
   * only surviving trace: the charge to refund and the amount, in a record
   * that outlives the cascade. The same reasoning already applies to an
   * unresolved client deposit's `resolved: false` above.
   */
  deletionRefund?: {
    state: "not_applicable" | "completed" | "pending" | "failed_cancel";
    processedAs: "withdrawal" | "deletion_pro_rata" | null;
    policyVersion: string | null;
    grossMinor: number;
    currency: string | null;
    usedFraction: number | null;
    stripeRefundId: string | null;
    stripeChargeId: string | null;
    error: string | null;
  } | null;
};

export function buildFinancialSnapshot(
  paidDeposits: DepositBookingRow[],
  resolvedBookingIds: Set<string>,
  pseudonymizedOrders: Record<string, unknown>[],
  billing?: BillingSnapshot | null,
  appointmentPayments?: AppointmentPaymentsSnapshot,
) {
  return {
    // v2 -> v3: added `appointmentPayments` (BDEL-PAY-001). A reader keyed to
    // schemaVersion sees this as an additive change: every v2 key is still
    // present in the same shape.
    schemaVersion: 3,
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
    appointmentPayments:
      appointmentPayments ?? EMPTY_APPOINTMENT_PAYMENTS_SNAPSHOT,
  };
}
