import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  balanceExtrasFromLines,
  checkCollectable,
  isPayablePaymentRequestStatus,
  outstandingBalance,
  type OutstandingBalance,
  type PaymentAllocation,
  type PaymentLineClassification,
  type PaymentRequestCollects,
  type PaymentRequestStatus,
  type PaymentSubject,
} from "@inklee/shared/appointment-payments";
import { type AccountOverrides } from "@/lib/entitlements";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { missingPaymentEntitlement } from "./appointment-payments";
import { isCapabilityDisabled } from "./app-config";
import {
  appointmentApplicationFee,
  appointmentFeeTier,
} from "./order-fee-sync";
import type { PaymentTier } from "@inklee/shared/fee-schedule";

// THE SERVER-AUTHORITATIVE QUOTE (Plus build P9, slice A3).
//
// Spec: docs/product/plus-payments-architecture.md, section 4 (outstanding
// balance), section 6 (fee bases) and section 8 ("the displayed amount and the
// Stripe charge come from the same quote, computed server-side"). Money-path
// rules in AGENTS.md apply to every line.
//
// =========================================================================
// ONE OBJECT, TWO USES, AND THAT IS THE WHOLE POINT.
//
// The failure this prevents is not arithmetic, it is DIVERGENCE: a page that
// renders one total while the PaymentIntent is created for another. That
// happens whenever the display and the charge are computed by two callers, even
// when both are correct in isolation, because only one of them gets updated
// next time. So there is exactly one producer, it returns exactly one
// `amountMinor`, and both the client page (A6) and the intent core
// (appointment-payment-intent.ts) read that field. Neither of them may compute
// a total of its own, and neither takes an amount from the caller.
//
// NOTHING HERE ASKS THE CLIENT WHAT TO CHARGE. There is no amount parameter.
// The only inputs are the request id and the artist's confirmed final service
// price, and the second one is the artist's own figure, never the client's.
//
// =========================================================================
// THE CEILINGS. Two, both computed with A1's `outstandingBalance`, and the
// collection has to clear both.
//
//   REQUEST-SCOPED   the frozen total, less what THIS request has already
//                    collected. It is what makes a retry after a partial
//                    payment ask for the remainder rather than the whole
//                    amount again, and it is what makes a fully collected
//                    request refuse instead of charging twice.
//
//   SUBJECT-SCOPED   the appointment's or project's own outstanding balance:
//                    final tattoo price + eligible extras - allocated payments
//                    - discounts. This is the one that catches a deposit taken
//                    through the OLD booking path already covering the debt,
//                    because allocations attach to the SUBJECT rather than to a
//                    request. Spec section 8's "collecting an already-paid
//                    balance" and "cross-appointment deposit application".
//
// The subject ceiling only exists when the artist has confirmed a final price.
// Spec section 4 is explicit that the final price is NEVER inferred from the
// deposit, so when it is unknown this refuses to invent one and falls back to
// the request ceiling alone. Both are the same function on different inputs;
// neither is a reimplementation of it.
//
// RECORDED, NOT HALF-FIXED: there is no column anywhere yet for the artist's
// confirmed final service price. `booking_requests` has `deposit_amount` and
// `projects` has a budget RANGE, and neither is a confirmed final price. The
// one case this derives is the one where the artist has already stated it on
// the request itself (see `resolveFinalServicePrice`). Wiring the artist-facing
// "confirm the final price" field is A6's, and until it exists most collections
// clear the request ceiling only. That is a narrower guarantee than the spec
// describes, and saying so is better than deriving a number from the deposit.
//
// IT IS NOT AN INPUT TO THIS FUNCTION. It briefly was, as a parameter, and a
// caller-supplied final price is a caller-supplied CEILING: passing a large
// enough one lifts the subject-scoped check over anything. Whatever holds it
// next has to be a stored fact.

/** How the fee lanes are read off a request's lines. Spec section 6. */
const APPOINTMENT_LANE_CLASSIFICATIONS: readonly PaymentLineClassification[] = [
  "tattoo_service",
  "additional_service",
];
const GOODS_LANE_CLASSIFICATIONS: readonly PaymentLineClassification[] = [
  "physical_goods",
];

/**
 * The artist's stored confirmed final service price. Null, because no column
 * holds one: see the header and A6.
 *
 * A named constant rather than a literal `null` at the call site, so the thing
 * that is missing has a name and one place to be wired. It is deliberately NOT
 * a parameter: the only caller of `buildPaymentQuote` is an unauthenticated
 * client holding a link, and a supplied final price is a supplied ceiling.
 */
const STORED_FINAL_SERVICE_PRICE_MINOR: number | null = null;

export type QuoteLine = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unitAmountMinor: number;
  lineTotalMinor: number;
  classification: PaymentLineClassification;
  position: number;
};

export type PaymentQuoteRefusalCode =
  /** No such request. */
  | "not_found"
  /** The request is not in a state a client could pay from. */
  | "not_payable"
  /** The link has run out. */
  | "expired"
  /** The plan does not include this collection, or it is paused platform-wide. */
  | "not_entitled"
  /** The tier has no rate for the appointment lane under the active schedule. */
  | "lane_unavailable"
  /** A line could not be classified, so no fee or tax lane can be derived. */
  | "requires_manual_review"
  /** Everything owed has been collected. Spec section 4: no zero-value request. */
  | "nothing_outstanding"
  /** The frozen total is above what is still owed on the subject. */
  | "above_outstanding"
  /** A read failed. Distinct from every business refusal above. */
  | "failed";

export type PaymentQuote = {
  requestId: string;
  artistId: string;
  subject: PaymentSubject;
  collects: PaymentRequestCollects;
  status: PaymentRequestStatus;
  revision: number;
  currency: string;
  /** THE amount. Displayed to the client and charged by Stripe, one field. */
  amountMinor: number;
  /** The frozen client-visible total of the request, for the breakdown header.
   *  Equal to `amountMinor` unless part of it has already been collected. */
  totalMinor: number;
  /** Already collected against THIS request, net of refund adjustments. */
  alreadyCollectedMinor: number;
  lines: readonly QuoteLine[];
  /** Spec section 6: the two bases, never one rate over one total. */
  appointmentBaseMinor: number;
  goodsBaseMinor: number;
  /** What Stripe is told to take as `application_fee_amount`. */
  applicationFeeMinor: number;
  appointmentFeeMinor: number;
  goodsFeeMinor: number;
  /** What the appointment fee would be without sponsorship. Intent evidence
   *  only: a waiver is released against what settlement booked, never this. */
  appointmentFeeBeforeSponsorshipMinor: number;
  feeScheduleVersion: string;
  /** The tier this fee was priced at (G2, FEE-STP-001), so the intent's
   *  metadata can stamp it alongside `feeScheduleVersion`. */
  feeTier: PaymentTier;
  /** The lower of the ceilings that exist. */
  maxCollectibleMinor: number;
  requestBalance: OutstandingBalance;
  /** Null when the artist has not confirmed a final service price. */
  subjectBalance: OutstandingBalance | null;
  /** Everything the idempotency key is derived from, in one canonical string.
   *  See `appointment-payment-intent.ts` for why it is shaped this way. */
  fingerprintSource: string;
  /** The intent currently being collected against this request, if any. */
  existingPaymentIntentId: string | null;
  existingPaymentIntentAmountMinor: number | null;
};

export type PaymentQuoteResult =
  | { ok: true; quote: PaymentQuote }
  | { ok: false; code: PaymentQuoteRefusalCode; error: string };

export type StoredQuoteRequest = {
  id: string;
  artist_id: string;
  booking_id: string | null;
  project_id: string | null;
  status: PaymentRequestStatus;
  currency: string;
  collects: PaymentRequestCollects | null;
  total_minor: number;
  revision: number;
  expires_at: string | null;
  payment_intent_id: string | null;
  payment_intent_amount_minor: number | null;
};

/**
 * The one producer of a payable amount for a payment request.
 *
 * Takes the SERVICE client: a payment quote is read on behalf of an
 * unauthenticated client holding a link, so there is no session to scope it to.
 * That is why every ownership fact below is read from the stored row rather
 * than trusted from a caller.
 *
 * IT TAKES NO OPTIONS, AND THAT IS THE POINT. It used to accept
 * `finalServicePriceMinor`, `now` and `overrides`, described as test seams; no
 * test ever used them, and what they actually did was hand the caller the three
 * server-side facts that decide whether money may be taken: the ceiling, the
 * expiry and the entitlement. Executed on 2026-07-30 before they were removed,
 * with the stored plan lapsed to Free: `{ overrides: PLUS }` charged 20000 and
 * `getAccountOverrides` was never called. Removing the parameter is only half
 * the fix, because a cast walks past a type; the other half is that all three
 * are now read unconditionally below, which is what the forced-call tests in
 * block 10 of `appointment-payment-collection.test.ts` assert.
 *
 * TESTS REACH THEM BY MOCKING THE MODULE (`@/lib/entitlements-server`), not by
 * passing them in. A double a production caller cannot construct is a seam; an
 * argument a production caller can pass is a bypass.
 */
export async function buildPaymentQuote(
  supabase: SupabaseClient,
  requestId: string,
): Promise<PaymentQuoteResult> {
  const { data: row, error: readError } = await supabase
    .from("payment_requests")
    .select(
      "id, artist_id, booking_id, project_id, status, currency, collects, total_minor, revision, expires_at, payment_intent_id, payment_intent_amount_minor",
    )
    .eq("id", requestId)
    .maybeSingle();

  // A READ ERROR AND AN ABSENT ROW ARE DIFFERENT FACTS, same discipline as A2's
  // `readRequest`: a transient blip must not read to a client as "this payment
  // link is gone", and a caller may retry one but not the other.
  if (readError) {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't load this payment. Please try again.",
    };
  }
  if (!row) {
    return {
      ok: false,
      code: "not_found",
      error: "This payment link is gone.",
    };
  }
  const request = row as StoredQuoteRequest;

  const subject: PaymentSubject | null = request.booking_id
    ? { kind: "booking", id: request.booking_id }
    : request.project_id
      ? { kind: "project", id: request.project_id }
      : null;
  // Unreachable while `payment_requests_subject_check` holds. Answered rather
  // than asserted, because a throw here would surface to a client as a 500 on a
  // payment page.
  if (!subject || !request.collects) {
    return {
      ok: false,
      code: "not_payable",
      error: "This payment link isn't ready. Ask the artist to send a new one.",
    };
  }

  if (!isPayablePaymentRequestStatus(request.status)) {
    return {
      ok: false,
      code: "not_payable",
      error:
        "This payment link isn't open any more. Ask the artist to send a new one.",
    };
  }

  // Read at quote time as well as by the expiry sweep, because the sweep is not
  // guaranteed to have run: an expired link that nobody has swept is still
  // expired, and charging against it would collect on a price whose validity
  // the artist had already limited.
  const now = new Date();
  if (request.expires_at && new Date(request.expires_at) <= now) {
    return {
      ok: false,
      code: "expired",
      error: "This payment link has expired. Ask the artist to send a new one.",
    };
  }

  const { data: lineRows, error: lineError } = await supabase
    .from("payment_request_lines")
    .select(
      "id, name, description, quantity, unit_amount_minor, line_total_minor, classification, currency, position",
    )
    .eq("request_id", request.id)
    .order("position", { ascending: true });
  // FAIL LOUD. An empty result from a failed read would compute every base as
  // zero and quote a fee of nothing against a real charge.
  if (lineError || !lineRows) {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't load this payment. Please try again.",
    };
  }
  if (lineRows.length === 0) {
    return {
      ok: false,
      code: "not_payable",
      error:
        "This payment link has nothing to pay. Ask the artist for a new one.",
    };
  }

  const lines: QuoteLine[] = lineRows.map((l) => ({
    id: l.id as string,
    name: l.name as string,
    description: (l.description as string | null) ?? null,
    quantity: l.quantity as number,
    unitAmountMinor: l.unit_amount_minor as number,
    lineTotalMinor: l.line_total_minor as number,
    classification: l.classification as PaymentLineClassification,
    position: l.position as number,
  }));

  // A line nobody could classify has no lane, and spec section 6 excludes
  // different things from each one. Guessing produces a wrong fee on a real
  // charge, so this refuses and leaves it with the artist. A1 flags the same
  // condition on the balance; this is the collection-side answer to it.
  if (lines.some((l) => l.classification === "manual_review")) {
    return {
      ok: false,
      code: "requires_manual_review",
      error:
        "This payment has a line that needs the artist to check it. Ask them to review and resend.",
    };
  }

  const { data: allocationRows, error: allocationError } = await supabase
    .from("payment_allocations")
    .select(
      "id, artist_id, booking_id, project_id, request_id, line_id, payment_intent_id, component, amount_minor, collected_total_minor, currency, status, settled_at",
    )
    .eq("artist_id", request.artist_id)
    .eq(subject.kind === "booking" ? "booking_id" : "project_id", subject.id);
  // FAIL LOUD, and this one is the dangerous direction: a failed allocation read
  // silently reports nothing collected, which raises both ceilings and invites a
  // second charge for a balance already paid.
  if (allocationError || !allocationRows) {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't load this payment. Please try again.",
    };
  }
  const allocations: PaymentAllocation[] = allocationRows.map((a) => ({
    id: a.id as string,
    artistId: a.artist_id as string,
    bookingId: (a.booking_id as string | null) ?? null,
    projectId: (a.project_id as string | null) ?? null,
    requestId: (a.request_id as string | null) ?? null,
    lineId: (a.line_id as string | null) ?? null,
    paymentIntentId: a.payment_intent_id as string,
    component: a.component as PaymentAllocation["component"],
    amountMinor: a.amount_minor as number,
    collectedTotalMinor: a.collected_total_minor as number,
    currency: a.currency as string,
    status: a.status as PaymentAllocation["status"],
    settledAt: (a.settled_at as string | null) ?? null,
  }));

  // --- The two ceilings, both through A1's `outstandingBalance`. ------------
  //
  // The request ceiling passes THIS request's frozen total as the price and
  // only the allocations belonging to this request. Pre-filtering the
  // allocations is the caller's job by A1's contract (it decides which are
  // eligible); the subject still has to match, so nothing foreign can slip in.
  const requestBalance = outstandingBalance({
    subject,
    currency: request.currency,
    finalServicePriceMinor: request.total_minor,
    extras: [],
    allocations: allocations.filter((a) => a.requestId === request.id),
  });

  // The STORED confirmed price, which is null on every request today because
  // no column holds one yet (see the header, and A6). Passed positionally
  // rather than dropped so that wiring the column is an edit here and not a
  // reopening of the caller-supplied parameter this argument replaced.
  const finalServicePriceMinor = resolveFinalServicePrice(
    STORED_FINAL_SERVICE_PRICE_MINOR,
    request.collects,
    lines,
  );
  const subjectBalance =
    finalServicePriceMinor === null
      ? null
      : outstandingBalance({
          subject,
          currency: request.currency,
          finalServicePriceMinor,
          // The extras this request itself adds (tips, goods, shipping, tax,
          // discounts). Without them a request whose total exceeds the bare
          // service price would read as over-collecting the subject and be
          // refused for asking for exactly what it itemized.
          //
          // `balanceExtrasFromLines` THROWS on a wrongly signed line, and a
          // throw on a payment page is a 500 rather than a refusal. It cannot
          // fire on stored rows: `payment_request_lines_sign_check` enforces
          // the same rule in the database for every role, so a row that would
          // throw here is a row Postgres refused to store.
          extras: balanceExtrasFromLines(
            lines.map((l) => ({
              classification: l.classification,
              lineTotalMinor: l.lineTotalMinor,
              currency: request.currency,
            })),
          ),
          allocations,
        });

  const amountMinor = requestBalance.remainingMinor;

  // Both ceilings, in the order that produces the most useful message: the
  // request-scoped one answers "already paid", the subject-scoped one answers
  // "more than is owed".
  const againstRequest = checkCollectable(requestBalance, amountMinor);
  if (!againstRequest.ok) {
    return refuseCollectability(againstRequest.reason);
  }
  if (subjectBalance) {
    const againstSubject = checkCollectable(subjectBalance, amountMinor);
    if (!againstSubject.ok) {
      return refuseCollectability(againstSubject.reason);
    }
  }

  // --- Entitlement, re-derived from the STORED row. -------------------------
  //
  // Re-checked at pay time and not only at send, because the plan can lapse in
  // between: spec section 12 lists "downgrade after sending a request" and
  // "subscription expiry mid-processing" as obligations. Derived from
  // `collects` and the stored line count, exactly as A2's send gate does, so
  // the two cannot answer differently.
  if (isCapabilityDisabled("appointment_payments")) {
    return {
      ok: false,
      code: "not_entitled",
      error: "Payments are paused right now. Please try again later.",
    };
  }
  // READ EVERY TIME, from the artist id on the STORED row. There is no branch
  // that skips this and no argument that pre-empts it, because the caller here
  // is a client holding a link: anything it could supply is a claim about the
  // artist's plan made by the party being charged.
  let overrides: AccountOverrides;
  try {
    overrides = await getAccountOverrides(request.artist_id);
  } catch {
    // A FAILED ENTITLEMENT READ IS AN ERROR, never "free plan". Resolving a
    // Plus artist to Free here would refuse a payment their client is trying
    // to make, on a link the artist already sent.
    return {
      ok: false,
      code: "failed",
      error: "Couldn't load this payment. Please try again.",
    };
  }
  if (missingPaymentEntitlement(overrides, request.collects, lines.length)) {
    return {
      ok: false,
      code: "not_entitled",
      error:
        "This payment isn't available right now. Please contact the artist.",
    };
  }

  // --- The fee, through the ONE unified path. -------------------------------
  const bases = splitFeeBases(lines);
  // Grandfather-aware (legacy_free_v1 -> legacy 3% under v2); v1-invisible.
  // Captured once so the quote both prices at this tier AND stamps it (G2,
  // FEE-STP-001) — never a second, potentially-disagreeing resolution.
  const tier = appointmentFeeTier(overrides);
  const fee = appointmentApplicationFee({
    appointmentBaseMinor: bases.appointmentBaseMinor,
    goodsBaseMinor: bases.goodsBaseMinor,
    tier,
    // Fee sponsorship is a DEPOSIT-path onboarding subsidy on
    // `booking_requests`, and no payment request carries one. Passed explicitly
    // as false rather than omitted, so a future sponsorship on this lane is a
    // deliberate edit here and not an inherited default.
    sponsored: false,
  });
  if (!fee.ok) {
    // The tier has no rate for this lane, which is "cannot transact it", not a
    // 0% rate. Unreachable under the active schedule (v1 prices both tiers);
    // wired so the P7 flip cannot open it silently.
    return {
      ok: false,
      code: "lane_unavailable",
      error:
        "This payment isn't available right now. Please contact the artist.",
    };
  }

  const maxCollectibleMinor = subjectBalance
    ? Math.min(
        requestBalance.maxCollectibleMinor,
        subjectBalance.maxCollectibleMinor,
      )
    : requestBalance.maxCollectibleMinor;

  return {
    ok: true,
    quote: {
      requestId: request.id,
      artistId: request.artist_id,
      subject,
      collects: request.collects,
      status: request.status,
      revision: request.revision,
      currency: request.currency,
      amountMinor,
      totalMinor: request.total_minor,
      alreadyCollectedMinor: requestBalance.allocatedMinor,
      lines,
      appointmentBaseMinor: bases.appointmentBaseMinor,
      goodsBaseMinor: bases.goodsBaseMinor,
      applicationFeeMinor: fee.applicationFeeMinor,
      appointmentFeeMinor: fee.appointmentFeeMinor,
      goodsFeeMinor: fee.goodsFeeMinor,
      appointmentFeeBeforeSponsorshipMinor:
        fee.appointmentFeeBeforeSponsorshipMinor,
      feeScheduleVersion: fee.scheduleVersion,
      feeTier: tier,
      maxCollectibleMinor,
      requestBalance,
      subjectBalance,
      fingerprintSource: [
        "p9a3",
        request.id,
        request.revision,
        request.currency,
        amountMinor,
        fee.applicationFeeMinor,
        requestBalance.allocatedMinor,
        fee.scheduleVersion,
      ].join("|"),
      existingPaymentIntentId: request.payment_intent_id,
      existingPaymentIntentAmountMinor: request.payment_intent_amount_minor,
    },
  };
}

/** One refusal sentence per `checkCollectable` reason, so the client is told
 *  which of the two ceilings stopped it rather than a generic failure. */
function refuseCollectability(
  reason:
    | "final_price_unknown"
    | "nothing_outstanding"
    | "not_positive"
    | "above_outstanding",
): PaymentQuoteResult {
  switch (reason) {
    case "nothing_outstanding":
    case "not_positive":
      // Spec section 4: a zero balance produces no request at all rather than a
      // 0.00 one. Reaching this means it was paid after the link was sent.
      return {
        ok: false,
        code: "nothing_outstanding",
        error: "This payment has already been settled. Nothing is due.",
      };
    case "above_outstanding":
      return {
        ok: false,
        code: "above_outstanding",
        error:
          "This payment asks for more than is still owed. Ask the artist to send an updated one.",
      };
    case "final_price_unknown":
      // Only reachable on the subject ceiling, which is only built when a final
      // price exists. Kept exhaustive rather than defaulted.
      return {
        ok: false,
        code: "not_payable",
        error:
          "This payment isn't ready yet. Ask the artist to confirm the price.",
      };
  }
}

/**
 * The artist's confirmed final tattoo-service price, or null.
 *
 * ONE DERIVATION, AND IT IS NOT AN INFERENCE FROM THE DEPOSIT. When a request
 * declares `collects: 'full_price'`, the artist has said in the request's own
 * `collects` column that this collection IS the full tattoo price, and its
 * `tattoo_service` lines are the figure they typed and the client was shown.
 * Reading it is reading their statement, not guessing from an advance.
 *
 * `deposit` and `balance` get nothing. A deposit precedes the final price by
 * definition, and a balance's tattoo-service line is the REMAINDER, so treating
 * it as the total would under-state the debt and raise nothing but false
 * confidence. Those two get a ceiling once A6's stored field exists.
 *
 * `stored` is the artist's confirmed price READ FROM THE DATABASE, and its only
 * production value today is `STORED_FINAL_SERVICE_PRICE_MINOR`, which is null.
 * It is not a caller's figure: a caller that could set this could set the
 * subject-scoped ceiling.
 */
export function resolveFinalServicePrice(
  stored: number | null | undefined,
  collects: PaymentRequestCollects,
  lines: readonly Pick<QuoteLine, "classification" | "lineTotalMinor">[],
): number | null {
  if (typeof stored === "number") return stored;
  if (collects !== "full_price") return null;
  const serviceLines = lines.filter(
    (l) => l.classification === "tattoo_service",
  );
  if (serviceLines.length === 0) return null;
  return serviceLines.reduce((sum, l) => sum + l.lineTotalMinor, 0);
}

export type FeeBases = {
  appointmentBaseMinor: number;
  goodsBaseMinor: number;
};

/**
 * The two fee bases, spec section 6.
 *
 * EXCLUDED FROM BOTH: tax, tips, shipping. Those are the spec's exclusion list
 * ("VAT or equivalent, tips, shipping ... and the other lane's value"), and
 * they are excluded by classification rather than by a flag, so a new line type
 * has to be placed deliberately instead of defaulting into a fee base.
 *
 * DISCOUNTS APPORTION, they do not pick a lane. A single discount line against
 * a mixed basket reduces value in both lanes, and charging the full fee on a
 * discounted lane would charge a fee on money nobody received. Split
 * proportionally by pre-discount lane value, with the appointment lane taking
 * the rounding remainder so the two shares sum to the discount exactly rather
 * than losing or duplicating a cent. When only one lane has value the whole
 * discount lands there, which is the same formula and not a special case.
 *
 * NEITHER BASE GOES NEGATIVE. An over-large discount is a composition problem,
 * and a negative base becomes a negative `application_fee_amount`, which Stripe
 * rejects outright and which would fail the whole payment. Same clamp, and same
 * reason, as `goodsBaseMinorFromLines`.
 */
export function splitFeeBases(
  lines: readonly Pick<QuoteLine, "classification" | "lineTotalMinor">[],
): FeeBases {
  let appointmentGross = 0;
  let goodsGross = 0;
  let discountMagnitude = 0;

  for (const line of lines) {
    if (line.classification === "discount") {
      // Stored negative (`payment_request_lines_sign_check`), used positive.
      discountMagnitude += -line.lineTotalMinor;
    } else if (APPOINTMENT_LANE_CLASSIFICATIONS.includes(line.classification)) {
      appointmentGross += line.lineTotalMinor;
    } else if (GOODS_LANE_CLASSIFICATIONS.includes(line.classification)) {
      goodsGross += line.lineTotalMinor;
    }
    // tip, tax, shipping: excluded from both bases, deliberately and by name.
  }

  const feeableGross = appointmentGross + goodsGross;
  if (feeableGross <= 0 || discountMagnitude <= 0) {
    return {
      appointmentBaseMinor: Math.max(0, appointmentGross),
      goodsBaseMinor: Math.max(0, goodsGross),
    };
  }

  const goodsShare = Math.round(
    (discountMagnitude * goodsGross) / feeableGross,
  );
  const appointmentShare = discountMagnitude - goodsShare;
  return {
    appointmentBaseMinor: Math.max(0, appointmentGross - appointmentShare),
    goodsBaseMinor: Math.max(0, goodsGross - goodsShare),
  };
}
