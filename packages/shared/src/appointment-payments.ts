// Appointment payments: the pure model (Plus build P9, slice A1).
//
// Spec: docs/product/plus-payments-architecture.md, sections 3 (payment request
// model), 4 (outstanding balance), 7 (allocation) and 8 (double-charge
// prevention). Money-path rules in AGENTS.md apply to every line of this file.
//
// PURE: no database, no network, no clock. Everything is passed in, so web,
// mobile and the server cores compute one answer from one implementation (the
// founder one-source-of-truth rule), and so a test can drive it without a
// stack.
//
// This module mirrors migration 0125_appointment_payments.sql exactly. Where
// both encode the same vocabulary, each file names the other; they are
// duplicated on purpose, following the 0115 convention (the shared module is
// what the product reads, the enum or check constraint is the backstop against
// a direct PostgREST call writing a value the state machine has never heard
// of). If one changes, change the other in the same commit.
//
// EVERY AMOUNT IS AN INTEGER IN MINOR UNITS. Never a float, never a decimal
// string. The schema stores `integer`, Stripe takes integer minor units, and a
// float that survives to a charge is a wrong charge.

// ---------------------------------------------------------------------------
// Vocabularies. Exported as `readonly` tuples so callers derive their sets from
// these rather than hand-copying them, which is how a status list drifts.

/** Spec section 3. Mirrors the `payment_request_status` enum in 0125. */
export const PAYMENT_REQUEST_STATUSES = [
  "draft",
  "ready",
  "sent",
  "viewed",
  "payment_processing",
  "partially_paid",
  "paid",
  "expired",
  "cancelled",
  "partially_refunded",
  "refunded",
  "disputed",
  "failed",
] as const;
export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];

/** Spec section 3. Mirrors the `payment_line_classification` enum in 0125. */
export const PAYMENT_LINE_CLASSIFICATIONS = [
  "tattoo_service",
  "additional_service",
  "physical_goods",
  "discount",
  "tip",
  "tax",
  "shipping",
  // Real value that could not be auto-classified. Carried at its amount and
  // FLAGGED, never silently folded into another lane: spec section 6 excludes
  // different things from each fee base, so a lane guess here becomes a wrong
  // fee later.
  "manual_review",
] as const;
export type PaymentLineClassification =
  (typeof PAYMENT_LINE_CLASSIFICATIONS)[number];

/**
 * How a line is treated for tax.
 *
 * NOT `TaxTreatment` from ./billing. That one describes INKLEE selling a
 * subscription to an artist (an Estonian electronically supplied service); this
 * describes the ARTIST selling to their client, where Inklee is infrastructure
 * and the artist is the seller. The two are different legal relationships and
 * must not be unified into one vocabulary.
 *
 * Artist-side tax configuration does not exist yet, which is why the default is
 * the honest `unspecified` rather than a guessed `inclusive`.
 */
export const PAYMENT_LINE_TAX_TREATMENTS = [
  "unspecified",
  "inclusive",
  "exclusive",
  "exempt",
  "manual_review",
] as const;
export type PaymentLineTaxTreatment =
  (typeof PAYMENT_LINE_TAX_TREATMENTS)[number];

/** A line's own refund summary. The refunded AMOUNTS live in allocations as
 *  `refund_adjustment` components; this is the line's rollup of them. */
export const PAYMENT_LINE_REFUND_STATUSES = [
  "none",
  "partial",
  "full",
] as const;
export type PaymentLineRefundStatus =
  (typeof PAYMENT_LINE_REFUND_STATUSES)[number];

/** Where a line came from. Deliberately three non-overlapping values: lineage
 *  across revisions is recorded by `supersedesId` on the request, not by a
 *  fourth source value that every carried-over line would then have to lose. */
export const PAYMENT_LINE_SOURCES = [
  "artist_manual",
  "linked_product",
  "system",
] as const;
export type PaymentLineSource = (typeof PAYMENT_LINE_SOURCES)[number];

/**
 * What a payment request collects. ADDED BY SLICE A2, mirroring the
 * `payment_requests_collects_check` constraint in migration 0126.
 *
 * Not part of A1's original three vocabularies, and it earns its place for a
 * reason worth stating: spec section 1 gates a deposit, a remaining balance and
 * a full price as three SEPARATE capabilities, and A1 already settles them as
 * three separate allocation components (`deposit`, `tattoo_service_balance`,
 * `full_price`). Neither of those is derivable from the lines: one
 * `tattoo_service` line of 100.00 is any of the three. Without a stored answer
 * the entitlement could only be checked when the request was CREATED, so an
 * artist who composed one while entitled and sent it after a downgrade would
 * collect a capability they no longer held.
 *
 * `balance` is the remaining-balance case; the arithmetic behind it is
 * `outstandingBalance` below, and the two are deliberately not wired together
 * here, because WHICH of the three an artist is collecting is their decision
 * and not something to infer from the numbers.
 */
export const PAYMENT_REQUEST_COLLECTS = [
  "deposit",
  "balance",
  "full_price",
] as const;
export type PaymentRequestCollects = (typeof PAYMENT_REQUEST_COLLECTS)[number];

export function isPaymentRequestCollects(
  value: unknown,
): value is PaymentRequestCollects {
  return (PAYMENT_REQUEST_COLLECTS as readonly string[]).includes(
    String(value),
  );
}

/** Spec section 7. Mirrors the `payment_allocation_component` enum in 0125. */
export const PAYMENT_ALLOCATION_COMPONENTS = [
  "deposit",
  "tattoo_service_balance",
  "full_price",
  "additional_service",
  "physical_goods",
  "tip",
  "tax",
  "shipping",
  "discount",
  "refund_adjustment",
] as const;
export type PaymentAllocationComponent =
  (typeof PAYMENT_ALLOCATION_COMPONENTS)[number];

/** The state of the collection an allocation apportions. Mirrors the
 *  `payment_collection_status` enum in 0125. */
export const PAYMENT_COLLECTION_STATUSES = [
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "disputed",
  "dispute_won",
  "dispute_lost",
] as const;
export type PaymentCollectionStatus =
  (typeof PAYMENT_COLLECTION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Row shapes, mirroring the schema.

/** Exactly one of an appointment or a project, matching the exactly-one-subject
 *  check constraint on both `payment_requests` and `payment_allocations`. */
export type PaymentSubject =
  | { kind: "booking"; id: string }
  | { kind: "project"; id: string };

export type PaymentRequest = {
  id: string;
  artistId: string;
  bookingId: string | null;
  projectId: string | null;
  status: PaymentRequestStatus;
  currency: string;
  /** The FROZEN client-visible total, integer minor units. */
  totalMinor: number;
  revision: number;
  supersedesId: string | null;
  /** What this request collects (slice A2, migration 0126). Null only on a
   *  draft: a sent request always declares it, because it selects both the
   *  entitlement the send was gated on and the allocation component A4 settles
   *  it under. */
  collects: PaymentRequestCollects | null;
  /** The schedule in force at send (./fee-schedule). Evidence of what the
   *  client was quoted under; fee ACTUALS are recorded at settlement. */
  feeScheduleVersion: string | null;
  /** The freeze latch. Non-null means the amount and the lines are closed. */
  sentAt: string | null;
  viewedAt: string | null;
  expiresAt: string | null;
  cancelledAt: string | null;
};

export type PaymentRequestLine = {
  id: string;
  requestId: string;
  artistId: string;
  name: string;
  description: string | null;
  quantity: number;
  unitAmountMinor: number;
  lineTotalMinor: number;
  currency: string;
  classification: PaymentLineClassification;
  taxTreatment: PaymentLineTaxTreatment;
  refundStatus: PaymentLineRefundStatus;
  source: PaymentLineSource;
  /** The linked Inklee goods product, when this line is one. */
  productId: string | null;
  position: number;
};

export type PaymentAllocation = {
  id: string;
  artistId: string;
  bookingId: string | null;
  projectId: string | null;
  /** Null for a payment collected outside the payment-request flow, which
   *  today means a deposit taken through the existing booking path. That
   *  nullability is what keeps deposit-then-balance from needing a special
   *  case. */
  requestId: string | null;
  lineId: string | null;
  /** The Stripe PaymentIntent, and the GROUP KEY: rows sharing one value are
   *  one collection and their components sum to what Stripe collected. */
  paymentIntentId: string;
  component: PaymentAllocationComponent;
  /** Signed. `discount` and `refund_adjustment` are negative. */
  amountMinor: number;
  /** What Stripe reported collected for this intent, gross and never revised. */
  collectedTotalMinor: number;
  currency: string;
  status: PaymentCollectionStatus;
  settledAt: string | null;
};

// ---------------------------------------------------------------------------
// Integer discipline.

/**
 * Throws unless `value` is a safe integer.
 *
 * Deliberately a throw rather than a clamp or a silent coalesce to 0. Every
 * amount in this system is an `integer` column by schema, so a non-integer
 * reaching here means the caller computed a float somewhere upstream, and
 * continuing would produce a wrong charge or a wrong refund from data that
 * looks fine. The money-path rules require a failure on that path to be an
 * error rather than a quiet degradation.
 */
export function assertIntegerMinor(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(
      `${label} must be an integer number of minor units, received ${String(value)}`,
    );
  }
  return value;
}

/**
 * The range an amount column in 0125 can actually hold.
 *
 * `unit_amount_minor`, `line_total_minor` and `total_minor` are all `integer`
 * (int4), so this is the SCHEMA's ceiling rather than a product opinion, and it
 * is the same number the A2 core refuses at as `MAX_PAYMENT_AMOUNT_MINOR`
 * (apps/web/src/lib/server/appointment-payments.ts). Named here so a later
 * caller (A3's Stripe amount, A4's webhook, mobile) applies the same bound
 * instead of re-deriving it from the column type or inventing its own.
 */
export const MAX_STORABLE_MINOR = 2_147_483_647;
export const MIN_STORABLE_MINOR = -2_147_483_648;

/** Whether an amount fits the `integer` columns 0125 stores money in. A
 *  REFUSAL predicate, not an assertion: see `lineTotalMinor` for which of the
 *  two failure classes throws and why only one of them does. */
export function isStorableMinor(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= MIN_STORABLE_MINOR &&
    value <= MAX_STORABLE_MINOR
  );
}

/**
 * The line total, mirroring the `payment_request_lines_total_check` constraint.
 * Exact: all three values are integer minor units.
 *
 * THE PRODUCT IS ASSERTED, NOT ONLY THE OPERANDS, and that is the point of this
 * function existing rather than callers writing `unit * quantity` themselves.
 * `Number.isSafeInteger` passes on each operand separately for a pair whose
 * product is neither: executed before this check existed,
 * `{ unitAmountMinor: 2000000000, quantity: 2000000000 }` (both inside int4, so
 * the schema forbids neither input) returned 4e18 with no throw.
 *
 * TWO FAILURE CLASSES, AND ONLY ONE OF THEM THROWS. They are different facts
 * about the number, so they get different answers:
 *
 *   NOT EXACTLY REPRESENTABLE (product outside safe-integer range). The value
 *   is WRONG, not merely too big, so there is nothing a caller could refuse on
 *   or display: any message it produced would quote a fabricated number.
 *   Throws, exactly like `assertIntegerMinor`.
 *
 *   EXACT BUT ABOVE THE COLUMN (`isStorableMinor` false, safe integer). The
 *   value is right and the row is simply unstorable, which is artist-fixable
 *   input. That is a REFUSAL, and it already exists: the A2 core bounds the
 *   returned total against `MAX_PAYMENT_AMOUNT_MINOR` and answers with a
 *   sentence. Throwing here would take that away, which was executed rather
 *   than assumed: making this function throw on the int4 bound turned the A2
 *   test "refuses a quantity that carries the line total above the integer
 *   column instead of throwing" (unit 100000 x quantity 1000000 = 1e11, an
 *   exact value) into an uncaught `RangeError` out of `validateLines`, which is
 *   the same defect that test was written for.
 */
export function lineTotalMinor(line: {
  unitAmountMinor: number;
  quantity: number;
}): number {
  assertIntegerMinor(line.unitAmountMinor, "unitAmountMinor");
  assertIntegerMinor(line.quantity, "quantity");
  return assertIntegerMinor(
    line.unitAmountMinor * line.quantity,
    "lineTotalMinor",
  );
}

/** The request total, mirroring the check the database performs at the freeze
 *  point: a sent request's total must equal the sum of its lines, because spec
 *  section 3 allows no unstructured "additional amount". */
export function requestTotalMinor(
  lines: readonly Pick<PaymentRequestLine, "lineTotalMinor">[],
): number {
  let total = 0;
  for (const line of lines) {
    total += assertIntegerMinor(line.lineTotalMinor, "lineTotalMinor");
  }
  return total;
}

// ---------------------------------------------------------------------------
// Sign discipline.

/**
 * Classifications stored as a NEGATIVE amount, and the only ones that may be.
 *
 * Mirrors `payment_request_lines_sign_check` in 0125 exactly:
 *
 *   case when classification = 'discount' then line_total_minor <= 0
 *        else line_total_minor >= 0 end
 *
 * Zero is legal on both sides, which is why the rule is stated as two
 * one-sided bounds rather than as "negative" and "positive". Same shape as
 * `NEGATIVE_ALLOCATION_COMPONENTS` below, which mirrors the equivalent
 * constraint on `payment_allocations`; the two lists are deliberately separate
 * because the vocabularies are (`refund_adjustment` is a component, never a
 * line classification).
 */
export const NEGATIVE_PAYMENT_LINE_CLASSIFICATIONS: readonly PaymentLineClassification[] =
  ["discount"];

/**
 * Throws unless the amount carries the sign its classification allows.
 *
 * WHY THE MODEL ENFORCES THIS AND DOES NOT LEAN ON THE COLUMN. The constraint
 * only holds for amounts on their way INTO a row. The balance is computed from
 * amounts a caller passes in, so a wrong-signed one is arithmetic here before
 * any database sees it, and the direction of the error is the dangerous one:
 * executed before this check existed, a `discount` extra of +2000 against a
 * 30000 price produced `grossMinor` 32000, which raised `maxCollectibleMinor`
 * to 32000 and made `checkCollectable` APPROVE collecting 32000 against a
 * 30000 debt. A `tip` of -5000 produced 25000 the other way.
 *
 * A throw rather than a flag or a clamp, for the same reason
 * `assertIntegerMinor` throws: a wrong sign on a money path is a caller that
 * computed something wrong upstream, and continuing produces a charge nobody
 * agreed to out of data that looks fine.
 */
export function assertPaymentLineSign(
  classification: PaymentLineClassification,
  amountMinor: number,
  label: string,
): number {
  assertIntegerMinor(amountMinor, label);
  const mustBeNegative =
    NEGATIVE_PAYMENT_LINE_CLASSIFICATIONS.includes(classification);
  if (mustBeNegative ? amountMinor > 0 : amountMinor < 0) {
    throw new RangeError(
      `${label} for a ${classification} line must be ${
        mustBeNegative ? "negative or zero" : "positive or zero"
      }, received ${String(amountMinor)}`,
    );
  }
  return amountMinor;
}

// ---------------------------------------------------------------------------
// Lifecycle, as DATA.
//
// One table rather than conditions scattered across cores, so "can this move?"
// has exactly one answer and adding a state means editing one object. Same
// shape as ./booking-fsm, which this deliberately mirrors.

/**
 * Legal transitions. A move not listed here is refused.
 *
 * Notes on the ones that are not obvious:
 *
 *  - `ready -> draft` is the only backwards move, and both sides are pre-send.
 *    Nothing frozen can return to either of them: the database enforces that
 *    separately, because otherwise the freeze would be bypassable in two
 *    statements (go back to draft, then edit the total).
 *  - `payment_processing -> cancelled` exists because Stripe can report a
 *    cancelled intent. The artist cannot perform it: 0125's UPDATE policy does
 *    not let an artist target a processing request at all. Legality and
 *    authority are different questions and are answered in different places.
 *  - `disputed` is NOT an end state. A dispute resolves, in either direction,
 *    and modelling it as one would leave won disputes stuck.
 *  - `failed` is not one either: a failed attempt on a still-valid link is
 *    followed by another attempt.
 *
 * =========================================================================
 * WHICH STATES ARE GENUINELY TERMINAL ONCE MONEY HAS MOVED: NONE OF THEM.
 *
 * `cancelled` and `refunded` used to be dead ends, on the reasoning that a
 * cancelled request is one the artist withdrew before money settled and a
 * refunded one has returned everything it collected. Both sentences describe
 * an intent of OURS, and Stripe does not read them. It emits `charge.refunded`
 * and `charge.dispute.created` months later, redelivers them, and a dispute can
 * be opened on a charge that was already refunded.
 *
 * The concrete hole that closes here, executed: `partially_paid -> cancelled`
 * is legal and `cancelled` was terminal, so a request that had COLLECTED money
 * could be parked where `cancelled -> refunded`, `-> partially_refunded` and
 * `-> disputed` were all refused. `refunded -> disputed` was refused too, while
 * `paid -> disputed` and `partially_paid -> disputed` were allowed, which is
 * the same event arriving one state later. A4's webhook would then have had to
 * either drop a real money event or write a status the model calls illegal.
 *
 * So the rule, applied uniformly: EVERY state a collection can be sitting in
 * when Stripe reports a reversal must be able to record it. That is
 * `partially_refunded`, `refunded` and `disputed` (never `paid`, never
 * `payment_processing`: nothing here resurrects a request into being payable
 * again, which is spec section 8's "payment after cancellation"). The status
 * alone cannot say whether money was collected, because that fact lives in
 * `payment_allocations`, so the table cannot make the distinction and is
 * permissive for exactly these three.
 *
 * `refunded` gains only `disputed`: refund totals converge upward (the
 * AGENTS.md cumulative-`amount_refunded` rule), so nothing walks back from
 * fully refunded to partially refunded.
 *
 * THIS DOES NOT HAND THE ARTIST ANYTHING. All three targets are absent from
 * `ARTIST_WRITABLE_PAYMENT_REQUEST_STATUSES` and from the WITH CHECK list of
 * 0125's `artist updates own payment requests` policy, so only A4 on the
 * service role can perform these moves. None of them is in
 * `PAYABLE_PAYMENT_REQUEST_STATUSES` either, so no new edge can produce a
 * second payable request for one subject.
 */
export const PAYMENT_REQUEST_TRANSITIONS: Record<
  PaymentRequestStatus,
  readonly PaymentRequestStatus[]
> = {
  draft: ["ready", "cancelled"],
  ready: ["draft", "sent", "cancelled"],
  sent: ["viewed", "payment_processing", "expired", "cancelled", "failed"],
  viewed: ["payment_processing", "expired", "cancelled", "failed"],
  // Reachable from `partially_paid`, so an earlier collection can be refunded
  // or disputed while a later attempt is still in flight.
  payment_processing: [
    "paid",
    "partially_paid",
    "failed",
    "cancelled",
    "disputed",
    "partially_refunded",
    "refunded",
  ],
  partially_paid: [
    "payment_processing",
    "paid",
    "partially_refunded",
    "refunded",
    "expired",
    "cancelled",
    "disputed",
  ],
  paid: ["partially_refunded", "refunded", "disputed"],
  // `expired` and `failed` are both reachable from `partially_paid`, so both
  // can be holding collected money. Routing their reversals through
  // `cancelled` first would have recorded a cancellation nobody performed.
  expired: ["cancelled", "partially_refunded", "refunded", "disputed"],
  failed: [
    "payment_processing",
    "expired",
    "cancelled",
    "partially_refunded",
    "refunded",
    "disputed",
  ],
  disputed: ["paid", "partially_paid", "partially_refunded", "refunded"],
  partially_refunded: ["refunded", "disputed"],
  // A withdrawn request, which may still have collected money before it was
  // withdrawn. It never becomes payable again (`paid`, `payment_processing`,
  // `sent` and `viewed` are all absent); it can only record money coming back
  // or being contested. A replacement is a NEW revision, as before.
  cancelled: ["partially_refunded", "refunded", "disputed"],
  // Everything collected has been returned. The one thing that can still
  // happen is a dispute filed on the refunded charge.
  refunded: ["disputed"],
};

export type PaymentTransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

export function canTransitionPaymentRequest(
  from: string,
  to: PaymentRequestStatus,
): PaymentTransitionResult {
  const allowed = PAYMENT_REQUEST_TRANSITIONS[from as PaymentRequestStatus];
  if (!allowed) return { ok: false, reason: `unknown status: ${from}` };
  if (from === to) {
    // Not listed as legal anywhere, and worth its own message: a no-op move is
    // almost always a caller that lost track of state rather than an intent.
    return { ok: false, reason: `already ${from}` };
  }
  if (!allowed.includes(to)) {
    if (allowed.length === 0) {
      // DORMANT, and kept deliberately. No status has an empty row since the
      // money-reversal edges were added (`TERMINAL_PAYMENT_REQUEST_STATUSES` is
      // empty, asserted in the test file), so nothing reaches this today. It
      // stays because the terminal set is DERIVED from the table: if a future
      // state genuinely ends there, this message appears without anyone having
      // to remember to write it.
      return {
        ok: false,
        reason: `payment request is ${from}, which is final; create a new revision instead`,
      };
    }
    return { ok: false, reason: `cannot move from ${from} to ${to}` };
  }
  return { ok: true };
}

/**
 * Derived from the table rather than restated, so a terminal state cannot
 * become non-terminal in one place and stay terminal in the other.
 *
 * CURRENTLY EMPTY, and that is the answer rather than an oversight: see the
 * block on `PAYMENT_REQUEST_TRANSITIONS`. Once money can have moved, no status
 * is an end state, because Stripe can still report a refund or a dispute
 * against it. Kept as a derivation, not deleted: it is what makes that property
 * checkable in one expression instead of by reading thirteen rows.
 */
export const TERMINAL_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] =
  PAYMENT_REQUEST_STATUSES.filter(
    (s) => PAYMENT_REQUEST_TRANSITIONS[s].length === 0,
  );

export function isTerminalPaymentRequestStatus(status: string): boolean {
  const allowed = PAYMENT_REQUEST_TRANSITIONS[status as PaymentRequestStatus];
  return allowed !== undefined && allowed.length === 0;
}

/**
 * The states in which a client could pay.
 *
 * MIRRORS the partial unique indexes `payment_requests_one_payable_per_*_idx`
 * in 0125, which allow at most one request per subject in this set. The two
 * must agree: if they diverge, either the database refuses a send the product
 * believes is legal, or it permits two payable requests for one appointment.
 */
export const PAYABLE_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] =
  ["sent", "viewed", "payment_processing", "partially_paid"];

export function isPayablePaymentRequestStatus(status: string): boolean {
  return (PAYABLE_PAYMENT_REQUEST_STATUSES as readonly string[]).includes(
    status,
  );
}

/** The two states in which a revision is still being composed. Everything else
 *  is frozen. Mirrors the `sent_at` latch and the
 *  `payment_requests_sent_latch_check` constraint in 0125. */
export const UNFROZEN_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] =
  ["draft", "ready"];

/** True when the amount and the lines are closed to editing. A frozen revision
 *  is replaced, never modified: the amount someone agreed to and the amount
 *  charged must be the same object (spec section 3). */
export function isFrozenPaymentRequest(
  request: Pick<PaymentRequest, "status" | "sentAt">,
): boolean {
  return (
    request.sentAt !== null ||
    !(UNFROZEN_PAYMENT_REQUEST_STATUSES as readonly string[]).includes(
      request.status,
    )
  );
}

/**
 * The statuses an artist's own client is allowed to WRITE.
 *
 * Mirrors the WITH CHECK list on 0125's `artist updates own payment requests`
 * policy. Every settled or contested state is absent: those are outcomes, and
 * A4 writes them from the Stripe webhook on the service role.
 *
 * Exposed here so a core can refuse before the round trip and say something
 * useful. Writing a status outside this list is refused LOUDLY (42501, because
 * it is a WITH CHECK violation), while targeting a row the USING clause
 * excludes is refused SILENTLY as zero rows with no error. Both were executed
 * against the schema. A core that handles only the loud case reports the silent
 * one as success.
 */
export const ARTIST_WRITABLE_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] =
  ["draft", "ready", "sent", "viewed", "cancelled", "expired"];

/**
 * The statuses an artist may CANCEL from. ADDED BY SLICE A2.
 *
 * Everything holding or having held money is absent, and that is the rule
 * rather than a shortening of the transition table: `partially_paid -> cancelled`
 * and `payment_processing -> cancelled` are both legal MOVES, because Stripe can
 * report a cancelled intent and A4 must be able to record it. They are not
 * things an ARTIST may do. Money already collected is A5's refund path, and
 * cancelling around it would leave a collected payment attached to a withdrawn
 * request.
 *
 * Legality and authority are different questions; this answers the second one.
 * 0125's UPDATE policy answers it again in the database, and the two agree by
 * construction: every status here is in that policy's USING list.
 */
export const ARTIST_CANCELLABLE_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] =
  ["draft", "ready", "sent", "viewed", "expired", "failed"];

/**
 * The statuses a request may be SUPERSEDED from. ADDED BY SLICE A2.
 *
 * MIRRORS the same list in `send_payment_request` (migration 0126), which is the
 * one that actually holds: it re-checks under a row lock, in a later statement,
 * because a predecessor can settle while a revision is being sent. This copy
 * exists so `revisePaymentRequestCore` can refuse early with a useful message
 * instead of letting the artist compose a whole revision that send will reject.
 *
 * `cancelled` is included because it is the goal state: a predecessor already
 * cancelled needs no cancelling, and refusing there would strand a revision the
 * artist prepared. Everything from `payment_processing` onward is excluded:
 * replacing it would ask the client to pay again for what they are already
 * paying or have already paid (spec section 8).
 */
export const SUPERSEDABLE_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] =
  ["draft", "ready", "sent", "viewed", "expired", "failed", "cancelled"];

// ---------------------------------------------------------------------------
// Outstanding balance (spec section 4).

/**
 * The collection states that count toward the balance.
 *
 * `dispute_won` counts for the same reason `succeeded` does: the money is the
 * artist's. `disputed` does not, because the funds are withdrawn while the
 * dispute is open and treating them as collected would let the artist under-
 * collect a balance that may never be theirs. Refunds are NOT a status: they
 * are negative `refund_adjustment` components, so "not fully refunded" falls
 * out of the arithmetic rather than needing a flag that could disagree with it.
 */
export const PAYMENT_STATUSES_COUNTING_TOWARD_BALANCE: readonly PaymentCollectionStatus[] =
  ["succeeded", "dispute_won"];

/**
 * Whether one allocation counts against one subject's balance. Spec section 4:
 * successfully collected, allocated to the SAME appointment or project, not
 * fully refunded, not invalidatingly disputed, not cancelled and not failed.
 *
 * The currency test is not defensive padding. Summing a 100 usd allocation into
 * a eur balance silently under-collects by whatever the rate happens to be, and
 * nothing downstream would report it as an error.
 */
export function allocationCountsTowardBalance(
  allocation: Pick<
    PaymentAllocation,
    "bookingId" | "projectId" | "currency" | "status"
  >,
  subject: PaymentSubject,
  currency: string,
): boolean {
  const subjectMatches =
    subject.kind === "booking"
      ? allocation.bookingId === subject.id
      : allocation.projectId === subject.id;
  return (
    subjectMatches &&
    allocation.currency === currency &&
    PAYMENT_STATUSES_COUNTING_TOWARD_BALANCE.includes(allocation.status)
  );
}

/**
 * One eligible extra on top of the final tattoo price.
 *
 * A lighter shape than `PaymentRequestLine` on purpose: WHICH lines are
 * eligible is the caller's decision (lines on a cancelled revision are not),
 * and taking whole rows here would invite passing every line ever written.
 * Amounts are signed, so a discount arrives negative exactly as it is stored.
 */
export type BalanceExtra = {
  classification: PaymentLineClassification;
  amountMinor: number;
  currency: string;
};

/** Lines to extras, dropping `tattoo_service` lines.
 *
 *  Those are dropped rather than summed because the service price is passed
 *  separately and confirmed by the artist. Summing both would double-count it,
 *  and picking one silently would be inferring the final price, which spec
 *  section 4 forbids. */
export function balanceExtrasFromLines(
  lines: readonly Pick<
    PaymentRequestLine,
    "classification" | "lineTotalMinor" | "currency"
  >[],
): BalanceExtra[] {
  return lines
    .filter((line) => line.classification !== "tattoo_service")
    .map((line) => ({
      classification: line.classification,
      // Checked at the boundary as well as in `outstandingBalance`: a line that
      // never reaches a balance computation still gets its sign refused here,
      // and a caller assembling extras by hand gets the same answer as one
      // deriving them from stored lines.
      amountMinor: assertPaymentLineSign(
        line.classification,
        line.lineTotalMinor,
        "lineTotalMinor",
      ),
      currency: line.currency,
    }));
}

export type OutstandingBalanceInput = {
  subject: PaymentSubject;
  currency: string;
  /**
   * The final tattoo-service price the ARTIST confirmed, in minor units.
   *
   * `null` means not yet confirmed, and that is NOT zero. Spec section 4: the
   * final price is never inferred from the deposit, which is why this function
   * takes no deposit argument it could infer from and refuses to produce a
   * collectible amount while this is null.
   */
  finalServicePriceMinor: number | null;
  extras: readonly BalanceExtra[];
  allocations: readonly PaymentAllocation[];
};

/**
 * Why a zero `remainingMinor` is zero. Spec section 4 requires a zero balance
 * to produce no request at all rather than a 0.00 one, and the caller cannot
 * tell "everything is paid" from "we do not know the price yet" from the number
 * alone. That ambiguity is the entire reason this field exists.
 */
export type OutstandingBalanceStatus =
  /** The artist has not confirmed a final price. Nothing is collectible and no
   *  request may be sent. */
  | "final_price_unknown"
  /** Nothing left to collect. No request is needed. */
  | "settled"
  /** There is an amount to collect. */
  | "collectible"
  /** More has been collected than is owed. A5 refunds the difference; no
   *  further collection is possible. */
  | "overpaid";

export type OutstandingBalance = {
  currency: string;
  status: OutstandingBalanceStatus;
  /** 0 when the final price is unknown; read `status` before this. */
  finalServicePriceMinor: number;
  /** Eligible extras, discounts excluded. */
  extrasMinor: number;
  /** Eligible discounts as a positive magnitude. */
  discountMinor: number;
  /** finalServicePrice + extras - discounts. */
  grossMinor: number;
  /** Counted payments, net of refund adjustments. */
  allocatedMinor: number;
  /** The authoritative amount still collectible. Never negative. */
  remainingMinor: number;
  /** Before clamping. Negative means over-collected. */
  rawRemainingMinor: number;
  overpaidMinor: number;
  /** The server-authoritative ceiling for any collection attempt. */
  maxCollectibleMinor: number;
  /** At least one extra is classified `manual_review`, so the lane split is not
   *  known and no automatic fee or tax treatment may be derived from it. */
  requiresManualReview: boolean;
  countedAllocationIds: readonly string[];
  ignoredAllocationIds: readonly string[];
};

/**
 * The outstanding balance, spec section 4:
 *
 *   remaining = final tattoo price + eligible extras
 *               - allocated successful payments - eligible discounts
 *
 * ONE code path for every starting state. Deposit-then-balance,
 * full-payment-only, deposit-equal-to-final-price and pay-after-the-session
 * differ only in what is in `allocations` and what the artist confirmed as the
 * final price; none of them is special-cased here, and a special case appearing
 * would mean the model is wrong.
 *
 * A payment with no request at all (the deposit taken through the existing
 * booking path) counts exactly like one with a request, because allocations are
 * attached to the SUBJECT rather than to a request.
 */
export function outstandingBalance(
  input: OutstandingBalanceInput,
): OutstandingBalance {
  const currency = input.currency;

  let extrasMinor = 0;
  let discountMinor = 0;
  let requiresManualReview = false;
  for (const extra of input.extras) {
    // A differently denominated extra is dropped rather than converted: this
    // module has no rates and inventing one would be a silent money bug.
    if (extra.currency !== currency) continue;
    // Integer AND sign, mirroring `payment_request_lines_sign_check`. The sign
    // is not cosmetic here: the branch below NEGATES a discount, so a
    // positively signed one would be added to the gross and would raise
    // `maxCollectibleMinor` above what is owed.
    assertPaymentLineSign(
      extra.classification,
      extra.amountMinor,
      "extra.amountMinor",
    );
    if (extra.classification === "discount") {
      // Stored negative, reported as a positive magnitude.
      discountMinor += -extra.amountMinor;
    } else {
      extrasMinor += extra.amountMinor;
      if (extra.classification === "manual_review") requiresManualReview = true;
    }
  }

  let allocatedMinor = 0;
  const countedAllocationIds: string[] = [];
  const ignoredAllocationIds: string[] = [];
  for (const allocation of input.allocations) {
    if (!allocationCountsTowardBalance(allocation, input.subject, currency)) {
      ignoredAllocationIds.push(allocation.id);
      continue;
    }
    assertIntegerMinor(allocation.amountMinor, "allocation.amountMinor");
    // Signed, so a refund adjustment subtracts itself and a fully refunded
    // payment nets to zero without any separate "is it refunded" branch.
    allocatedMinor += allocation.amountMinor;
    countedAllocationIds.push(allocation.id);
  }

  if (input.finalServicePriceMinor === null) {
    return {
      currency,
      status: "final_price_unknown",
      finalServicePriceMinor: 0,
      extrasMinor,
      discountMinor,
      grossMinor: 0,
      allocatedMinor,
      remainingMinor: 0,
      rawRemainingMinor: 0,
      overpaidMinor: 0,
      // Nothing may be collected against a price nobody has confirmed.
      maxCollectibleMinor: 0,
      requiresManualReview,
      countedAllocationIds,
      ignoredAllocationIds,
    };
  }

  const finalServicePriceMinor = assertIntegerMinor(
    input.finalServicePriceMinor,
    "finalServicePriceMinor",
  );
  const grossMinor = finalServicePriceMinor + extrasMinor - discountMinor;
  const rawRemainingMinor = grossMinor - allocatedMinor;
  const remainingMinor = Math.max(0, rawRemainingMinor);
  const overpaidMinor = Math.max(0, -rawRemainingMinor);

  return {
    currency,
    status:
      rawRemainingMinor < 0
        ? "overpaid"
        : rawRemainingMinor === 0
          ? "settled"
          : "collectible",
    finalServicePriceMinor,
    extrasMinor,
    discountMinor,
    grossMinor,
    allocatedMinor,
    remainingMinor,
    rawRemainingMinor,
    overpaidMinor,
    maxCollectibleMinor: remainingMinor,
    requiresManualReview,
    countedAllocationIds,
    ignoredAllocationIds,
  };
}

export type CollectabilityRefusal =
  | "final_price_unknown"
  | "nothing_outstanding"
  | "not_positive"
  | "above_outstanding";

export type CollectabilityCheck =
  | { ok: true; amountMinor: number }
  | {
      ok: false;
      reason: CollectabilityRefusal;
      maxCollectibleMinor: number;
    };

/**
 * Whether `amountMinor` may be collected against this balance.
 *
 * Spec section 4 requires collection above the authoritative outstanding amount
 * to be refused SERVER-SIDE, and section 8 lists "collecting an already-paid
 * balance" and "collecting above outstanding" among the covered failure modes.
 * This is the refusal, expressed so the caller gets both the reason and the
 * ceiling: a refusal that does not say what the maximum was cannot be turned
 * into a useful message or a correct retry.
 *
 * A refused result must abort the collection. It must never fall back to
 * collecting the maximum, which would charge an amount nobody asked for.
 *
 * INTEGER DISCIPLINE IS A THROW HERE, NOT A REFUSAL, and it is checked before
 * anything else. A non-integer amount is not a business outcome the client
 * could be told about, it is a float computed upstream, and the refusal it used
 * to get named the wrong defect: executed before this changed,
 * `checkCollectable({ status: 'collectible', maxCollectibleMinor: 30000 }, 100.5)`
 * returned `not_positive` for a number that is positive, so a caller reading
 * the reason would have gone looking for a zero or a negative amount. Same
 * answer as `assertIntegerMinor` gives everywhere else in this module.
 */
export function checkCollectable(
  balance: Pick<OutstandingBalance, "status" | "maxCollectibleMinor">,
  amountMinor: number,
): CollectabilityCheck {
  assertIntegerMinor(amountMinor, "amountMinor");
  const max = balance.maxCollectibleMinor;
  if (balance.status === "final_price_unknown") {
    return { ok: false, reason: "final_price_unknown", maxCollectibleMinor: 0 };
  }
  if (amountMinor <= 0) {
    return { ok: false, reason: "not_positive", maxCollectibleMinor: max };
  }
  if (max <= 0) {
    return { ok: false, reason: "nothing_outstanding", maxCollectibleMinor: 0 };
  }
  if (amountMinor > max) {
    return { ok: false, reason: "above_outstanding", maxCollectibleMinor: max };
  }
  return { ok: true, amountMinor };
}

// ---------------------------------------------------------------------------
// Allocation invariants (spec section 7).

/** Components stored as negative amounts. Mirrors the
 *  `payment_allocations_sign_check` constraint in 0125. */
export const NEGATIVE_ALLOCATION_COMPONENTS: readonly PaymentAllocationComponent[] =
  ["discount", "refund_adjustment"];

export type AllocationComponentInput = {
  component: PaymentAllocationComponent;
  amountMinor: number;
  currency: string;
  lineId?: string | null;
};

export type AllocationProblem =
  /** The gross components do not sum to what was collected. */
  | "unbalanced"
  /** A component carries a sign its classification does not allow. */
  | "sign"
  /** A component is denominated differently from the collection. */
  | "currency_mismatch"
  /** Two components share a (component, line) pair, which the database's
   *  `payment_allocations_unique` constraint would reject. */
  | "duplicate_component"
  /** A collection with no components at all, which is the "one unclassified
   *  total" failure wearing a different shape. */
  | "empty";

export type AllocationCheck = {
  ok: boolean;
  problems: readonly AllocationProblem[];
  /** Everything except refund adjustments. This is what must equal the
   *  collected amount. */
  grossAllocatedMinor: number;
  /** Negative or zero. */
  refundAdjustmentMinor: number;
  /** What is still attributable after refunds. */
  netAllocatedMinor: number;
  /** grossAllocated - collected. Zero when balanced. */
  differenceMinor: number;
};

/**
 * Whether a set of components is a valid allocation of one collected payment.
 *
 * THE INVARIANT: the components sum to the collected amount. Stated precisely,
 * because refunds are components too: the GROSS components (everything except
 * `refund_adjustment`) sum to what Stripe collected, and that never changes.
 * Refund adjustments are added afterwards and move the NET, leaving the record
 * of the original collection intact, which is what spec section 9 requires and
 * what dispute evidence is made of.
 *
 * `refund_adjustment` converges rather than accumulating: there is at most one
 * such component per line, holding the CUMULATIVE refunded total. That is the
 * AGENTS.md webhook rule (`charge.refunded` carries a cumulative
 * `amount_refunded` and Stripe redelivers events, so never add a delta) and the
 * database's unique constraint makes a second one unstorable.
 */
export function checkAllocation(input: {
  collectedMinor: number;
  currency: string;
  components: readonly AllocationComponentInput[];
}): AllocationCheck {
  assertIntegerMinor(input.collectedMinor, "collectedMinor");

  const problems = new Set<AllocationProblem>();
  const seen = new Set<string>();
  let grossAllocatedMinor = 0;
  let refundAdjustmentMinor = 0;

  if (input.components.length === 0) problems.add("empty");

  for (const component of input.components) {
    assertIntegerMinor(component.amountMinor, "component.amountMinor");

    if (component.currency !== input.currency) {
      problems.add("currency_mismatch");
    }

    const mustBeNegative = NEGATIVE_ALLOCATION_COMPONENTS.includes(
      component.component,
    );
    if (
      mustBeNegative ? component.amountMinor > 0 : component.amountMinor < 0
    ) {
      problems.add("sign");
    }

    // Mirrors `unique nulls not distinct (payment_intent_id, component,
    // line_id)`: a null line id is one key, not many, so two request-wide tips
    // collide exactly as they would in the database.
    const key = `${component.component}::${component.lineId ?? ""}`;
    if (seen.has(key)) problems.add("duplicate_component");
    seen.add(key);

    if (component.component === "refund_adjustment") {
      refundAdjustmentMinor += component.amountMinor;
    } else {
      grossAllocatedMinor += component.amountMinor;
    }
  }

  const differenceMinor = grossAllocatedMinor - input.collectedMinor;
  if (differenceMinor !== 0) problems.add("unbalanced");

  return {
    ok: problems.size === 0,
    problems: [...problems],
    grossAllocatedMinor,
    refundAdjustmentMinor,
    netAllocatedMinor: grossAllocatedMinor + refundAdjustmentMinor,
    differenceMinor,
  };
}
