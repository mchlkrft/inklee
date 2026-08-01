import "server-only";
import crypto from "crypto";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import {
  PAYMENT_REQUEST_TRANSITIONS,
  canTransitionPaymentRequest,
  type PaymentRequestStatus,
} from "@inklee/shared/appointment-payments";
import { stripe as defaultStripe } from "@/lib/stripe";
import {
  getConnectRoutingForArtist,
  isConnectAccountUnreachable,
  markConnectAccountUnreachable,
} from "@/lib/stripe-connect";
import {
  buildPaymentQuote,
  type PaymentQuote,
} from "./appointment-payment-quote";

// THE PAYMENT INTENT FOR A PAYMENT REQUEST (Plus build P9, slice A3).
//
// Spec: docs/product/plus-payments-architecture.md, section 8 (double-charge
// prevention) and section 1 (capability boundary). Money-path rules in
// AGENTS.md apply to every line.
//
// SCOPE. Quote, create or return the PaymentIntent, claim the request into
// `payment_processing`. NOT the webhook (A4), NOT refunds (A5), NOT the client
// page (A6), NOT native (A7). Nothing here decides that money HAS moved; that
// is A4's, from Stripe.
//
// =========================================================================
// 1. IDEMPOTENCY. What the key is derived from, and why each half holds.
//
// The key is `p9-apr-<sha256(quote.fingerprintSource)[0..32]>`, and
// `fingerprintSource` is built in the quote (appointment-payment-quote.ts) from
// exactly the facts that decide the charge:
//
//   request id | revision | currency | amount | application fee
//              | amount already collected against this request | schedule version
//
// A REPLAY YIELDS THE SAME KEY because every one of those is read from stored
// state. There is no clock, no random component and no caller-supplied value in
// it: the client cannot move the key by asking twice, by asking from two tabs,
// or by asking tomorrow. Two concurrent first attempts therefore send Stripe
// the SAME key with the SAME parameters and both receive the SAME
// PaymentIntent, which is what makes the losing half of the claim below have
// nothing to clean up (see section 3).
//
// A LEGITIMATE SECOND COLLECTION DOES NOT COLLIDE, because each of the things
// that makes it a second collection is in the key:
//
//   after a PARTIAL payment    `amount` and `already collected` both move, so
//                              collecting the remainder is a different key
//   after a REVISION           a revision is a different row, so both the id
//                              and the revision differ
//   a different REQUEST        different id
//   a rate or schedule change  different schedule version, so the same amount
//                              at a new fee is a new key rather than a silent
//                              replay of the old fee
//
// A RETRY OF A FAILED ATTEMPT AT THE SAME AMOUNT DELIBERATELY REUSES THE KEY.
// That is not a collision, it is the point: a PaymentIntent whose card was
// declined stays payable, so the retry must land on the SAME intent instead of
// leaving a second live one behind for the same debt.
//
// STRIPE'S KEYS EXPIRE AFTER 24 HOURS, and the design does not lean on them.
// After that window the same key would create a SECOND intent, which on a link
// that stays payable for days is the "duplicate charges" and "replays" pair
// from spec section 8. `payment_requests.payment_intent_id` (migration 0127) is
// what actually answers a later replay: section 2 below returns the stored
// intent without calling create at all.
//
// =========================================================================
// 2. THE LIFECYCLE TABLE IS WIRED, NOT DESCRIBED.
//
// A1 shipped `canTransitionPaymentRequest` and `PAYMENT_REQUEST_TRANSITIONS`
// with no importer, so they constrained nothing. Both are load-bearing here,
// and in two different ways on purpose:
//
//   `canTransitionPaymentRequest` refuses the move BEFORE Stripe is called, so
//   an illegal one costs no PaymentIntent. The case it actually catches, since
//   the quote has already narrowed the status to the payable set, is a request
//   sitting in `payment_processing` with NO stored intent id: the replay path
//   below cannot answer it, and without this check the attempt would create a
//   SECOND live intent for a request already collecting. Executed against the
//   core with a mocked Stripe: `illegal_transition`, with `create` and
//   `retrieve` both uncalled.
//
//   `PAYMENT_REQUEST_TRANSITIONS` GENERATES the status list in the claiming
//   UPDATE's own WHERE clause (`STATUSES_ENTERING_PROCESSING`). The database
//   filter and the table are therefore one object rather than two lists that
//   agree today: adding or removing an edge into `payment_processing` moves the
//   SQL with it, and a hand-written `.in(...)` is exactly how the two drift.
//
// The pre-check alone would not be enough, and the reason is the READ COMMITTED
// rule this codebase learned in 0124 and 0125: one statement sees one snapshot,
// so a status read before the Stripe round trip is stale by the time the write
// runs. The authoritative test is the one in the UPDATE's own qual. Postgres
// re-evaluates an UPDATE's qual against the updated row version after blocking
// on its lock (EvalPlanQual), so a settlement that commits while this waits
// leaves the claim affecting zero rows rather than overwriting it. That is the
// same reasoning A2's cancel core records, and the same reason send needed an
// RPC while this does not: this touches ONE row and its test is in its own qual,
// not in a subquery.
//
// =========================================================================
// 3. THE ORDER OF OPERATIONS, AND WHY IT IS THIS ONE.
//
// Quote, then Stripe, then claim. The two alternatives were both worse:
//
//   CLAIM FIRST, THEN STRIPE. A Stripe failure would leave the request in
//   `payment_processing` with no intent: unpayable by the client, and
//   un-cancellable by the artist, because `payment_processing` is absent from
//   `ARTIST_CANCELLABLE_PAYMENT_REQUEST_STATUSES`. That is a live request for
//   money nobody can stop, which is precisely what A2 refuses to create.
//
//   STRIPE, THEN AN UNCONDITIONAL WRITE. It would clobber a settlement or a
//   cancellation that landed in between.
//
// So the claim is conditional, and a lost claim is reconciled rather than
// assumed: the row is read back, and because the idempotency key is stable, the
// winner is holding the SAME intent id this attempt holds, so there is nothing
// to cancel. An intent is cancelled only when the row genuinely moved somewhere
// else, which is the one case where leaving it live would strand a payable
// object against a request that is no longer collecting.
//
// A STRIPE FAILURE IS RETURNED, NEVER SWALLOWED. The 2026-07-21 defect on the
// deposit path was a swallowed create error leaving a booking that rendered as
// a manual deposit with no pay button. There is no manual fallback on this path
// at all: a payment request is a card instrument by construction, so the only
// two outcomes are a client secret or an error.
//
// =========================================================================
// 4. ENTITLEMENT AND CONNECT.
//
// The entitlement is enforced inside the quote, server-side, re-derived from
// the STORED row rather than from anything a caller passes, so an artist who
// lapses after sending a link cannot collect on it (spec section 12's
// "downgrade after sending a request").
//
// "RATHER THAN FROM ANYTHING A CALLER PASSES" WAS NOT TRUE UNTIL 2026-07-30.
// This options type extended the quote's, so `overrides`, `now` and
// `finalServicePriceMinor` were on the public signature of a core that spends
// money: the plan, the expiry and the over-collection ceiling, all assertable
// by the caller. Executed against the core with the stored plan lapsed to Free,
// `{ overrides: PLUS }` charged 20000 and `getAccountOverrides` was never
// called. They were labelled test seams and no test used them. All three are
// now read from the server on every call, and block 10 of
// `appointment-payment-collection.test.ts` forces each one through a cast to
// prove the outcome does not move.
//
// NO CONNECTED ACCOUNT IS EVER CREATED HERE. This calls
// `getConnectRoutingForArtist`, which only READS `profiles`. `ensureConnectAccount`
// is not imported and must not be: spec section 1 says a connected account is
// created only inside the Plus payment-onboarding flow, so an artist who never
// upgrades never costs one.
//
// RECORDED, NOT HALF-FIXED, because closing it is bigger than this slice and
// belongs where the plan already puts it (plus-remaining-work-plan.md row A8,
// and plus-build-progress.md, which now carries it too): a
// FREE artist can still create a live Connect account today. The only caller of
// `ensureConnectAccount` is the payouts onboarding action
// (`app/(artist)/settings/payouts/actions.ts:78`), and it gates on
// authentication and a rate limit but on NO entitlement, so a Free artist can
// complete Custom Connect onboarding for an account they can never collect
// through. A3 does not widen that hole and does not narrow it; gating that
// action is A8's, together with the Plus payment-onboarding flow that replaces
// it. Half-fixing it here (an entitlement check bolted onto the action) would
// lock out the artists who already have accounts and would still leave the
// onboarding flow unbuilt.

/**
 * The statuses from which the lifecycle table permits a move to
 * `payment_processing`, DERIVED from the table rather than restated.
 *
 * This is the list the claiming UPDATE filters on. Deriving it is what makes
 * the database and the state machine one thing: `sent`, `viewed`,
 * `partially_paid` and `failed` fall out of A1's table today, and a future edit
 * to that table moves this without anyone remembering to.
 */
export const STATUSES_ENTERING_PROCESSING: readonly PaymentRequestStatus[] = (
  Object.keys(PAYMENT_REQUEST_TRANSITIONS) as PaymentRequestStatus[]
).filter((from) =>
  PAYMENT_REQUEST_TRANSITIONS[from].includes("payment_processing"),
);

/** Stripe statuses in which an existing intent is still worth returning to a
 *  client. `succeeded` and `canceled` are outcomes: A4 records them, and this
 *  path must not hand back a secret for either. */
const LIVE_INTENT_STATUSES: readonly Stripe.PaymentIntent.Status[] = [
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
  "processing",
];

export type PaymentIntentFailureCode =
  /** The quote refused. Its own code is carried through in `quoteCode`. */
  | "quote_refused"
  /** The request cannot move to `payment_processing` from where it is. */
  | "illegal_transition"
  /** The artist cannot receive card payments right now. */
  | "not_collectable"
  /** Stripe refused or was unreachable. */
  | "stripe_failed"
  /** The row moved underneath this attempt. */
  | "conflict"
  /** Anything else. */
  | "failed";

export type PaymentIntentResult =
  | {
      ok: true;
      paymentIntentId: string;
      clientSecret: string;
      /** True when this returned an intent that already existed rather than
       *  creating one. */
      reused: boolean;
      quote: PaymentQuote;
    }
  | {
      ok: false;
      code: PaymentIntentFailureCode;
      error: string;
      quoteCode?: string;
    };

/**
 * ONE FIELD, AND IT IS NOT AN AUTHORITY.
 *
 * This used to extend `BuildPaymentQuoteOptions`, which put `overrides`, `now`
 * and `finalServicePriceMinor` on the public signature of a money-spending
 * core: entitlement, expiry and the over-collection ceiling, all switchable by
 * the caller. They are gone, and the quote now reads all three from the server
 * unconditionally, which is the half that a cast cannot walk past.
 *
 * `stripeClient` stays because it is a different kind of thing. It decides
 * WHICH Stripe the core talks to, not whether the core is allowed to; a caller
 * that injects a fake gets fake answers back and moves no real money and no
 * gate. The two entry points that spend money are gated inside the quote, which
 * runs before this is used for anything.
 */
export type CreatePaymentIntentOptions = {
  /** Injected in tests. The real client is `@/lib/stripe`, and it is NEVER
   *  reached from a test: every test passes a mock. */
  stripeClient?: Stripe | null;
};

/**
 * Produce the payable PaymentIntent for a sent payment request.
 *
 * Takes the SERVICE client, because the caller is a client holding a link and
 * has no session, and because `payment_processing` is deliberately not a status
 * the artist's own policy can write (0125). Every ownership fact is read from
 * the stored row.
 */
export async function createPaymentRequestIntentCore(
  supabase: SupabaseClient,
  requestId: string,
  options: CreatePaymentIntentOptions = {},
): Promise<PaymentIntentResult> {
  const stripe =
    options.stripeClient === undefined ? defaultStripe : options.stripeClient;
  if (!stripe) {
    return {
      ok: false,
      code: "stripe_failed",
      error:
        "Card payments aren't available right now. Please try again later.",
    };
  }

  const quoted = await buildPaymentQuote(supabase, requestId);
  if (!quoted.ok) {
    return {
      ok: false,
      code: "quote_refused",
      error: quoted.error,
      quoteCode: quoted.code,
    };
  }
  const quote = quoted.quote;

  // --- The replay path. Answered from the row, before Stripe or the table. ---
  //
  // Checked FIRST because a returning client is the common case, not an error:
  // reloading the payment page must show the same intent, not create a second
  // one. It is also why the transition check below is not reached in that case,
  // which matters, since `payment_processing -> payment_processing` is
  // (correctly) not a legal move.
  if (quote.status === "payment_processing" && quote.existingPaymentIntentId) {
    return reuseExistingIntent(stripe, quote);
  }

  // --- The lifecycle table, before Stripe. ---------------------------------
  const transition = canTransitionPaymentRequest(
    quote.status,
    "payment_processing",
  );
  if (!transition.ok) {
    return {
      ok: false,
      code: "illegal_transition",
      error:
        "This payment can't be started from its current state. Ask the artist to send a new one.",
    };
  }

  // --- Connect routing. READ ONLY. -----------------------------------------
  const routing = await getConnectRoutingForArtist(quote.artistId);
  if (!routing.routeCharges || !routing.stripeAccountId) {
    // Cached Connect state can be stale in the OTHER direction too, but this is
    // the safe half: refusing a collection costs nobody money, and there is no
    // manual fallback on this path to degrade into.
    return {
      ok: false,
      code: "not_collectable",
      error:
        "The artist can't take card payments right now. Please contact them directly.",
    };
  }

  const idempotencyKey = paymentIntentIdempotencyKey(quote.fingerprintSource);

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: quote.amountMinor,
        currency: quote.currency,
        automatic_payment_methods: { enabled: true },
        // Destination charge, same shape as the deposit path: `on_behalf_of`
        // keeps the artist as merchant of record and `transfer_data` settles
        // into their balance. Under Custom Connect (fees.payer = application)
        // Stripe bills its own processing fee to Inklee's platform balance, so
        // `application_fee_amount` is the whole Inklee take and never a net.
        on_behalf_of: routing.stripeAccountId,
        transfer_data: { destination: routing.stripeAccountId },
        application_fee_amount: quote.applicationFeeMinor,
        description: `Appointment payment - request ${quote.requestId}`,
        metadata: intentMetadata(quote),
      },
      { idempotencyKey },
    );
  } catch (stripeErr) {
    Sentry.captureException(stripeErr, {
      tags: { action: "payment_request_create_intent" },
      extra: { requestId: quote.requestId, artistId: quote.artistId },
    });
    if (isConnectAccountUnreachable(stripeErr, routing.stripeAccountId)) {
      // The profile claimed this account was active and charge-ready and Stripe
      // says otherwise, naming it. Downgrade the cached state so the next read
      // stops believing it. NEVER clear `stripe_account_id`: a status downgrade
      // is undone by the next sync, wiping the id is not.
      await markConnectAccountUnreachable(quote.artistId);
      return {
        ok: false,
        code: "not_collectable",
        error:
          "The artist can't take card payments right now. Please contact them directly.",
      };
    }
    return {
      ok: false,
      code: "stripe_failed",
      error: "We couldn't start this payment. Please try again in a moment.",
    };
  }

  if (!intent.client_secret) {
    Sentry.captureMessage(
      "payment request intent created without a client secret",
      {
        tags: { action: "payment_request_create_intent" },
        extra: { requestId: quote.requestId, intentId: intent.id },
      },
    );
    // Unusable to the client and about to be referenced by nothing, so cancel
    // it rather than leave a live intent behind.
    await cancelQuietly(stripe, intent.id);
    return {
      ok: false,
      code: "stripe_failed",
      error: "We couldn't start this payment. Please try again in a moment.",
    };
  }

  // --- The claim. One row, its test in its own qual. -----------------------
  const { data: claimed, error: claimError } = await supabase
    .from("payment_requests")
    .update({
      status: "payment_processing",
      payment_intent_id: intent.id,
      payment_intent_amount_minor: quote.amountMinor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quote.requestId)
    .eq("revision", quote.revision)
    // Generated from A1's transition table. See section 2.
    .in("status", STATUSES_ENTERING_PROCESSING as string[])
    .select("id");

  if (claimError) {
    Sentry.captureException(claimError, {
      tags: { action: "payment_request_claim_processing" },
      extra: { requestId: quote.requestId, intentId: intent.id },
    });
    await cancelQuietly(stripe, intent.id);
    return {
      ok: false,
      code: "failed",
      error: "We couldn't start this payment. Please try again in a moment.",
    };
  }

  if (claimed && claimed.length > 0) {
    return {
      ok: true,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      reused: false,
      quote,
    };
  }

  // ZERO ROWS AND NO ERROR is the shape a core mistakes for success. Read back
  // rather than guess: with a stable idempotency key the overwhelmingly likely
  // cause is a concurrent twin of this same attempt, which holds the SAME
  // intent, in which case nothing was lost and nothing needs cancelling.
  const { data: after, error: afterError } = await supabase
    .from("payment_requests")
    .select("status, payment_intent_id")
    .eq("id", quote.requestId)
    .maybeSingle();

  // THE READ FAILED, SO WE DO NOT KNOW ANYTHING. Discarding this error was a
  // real defect: `after` came back null, which is indistinguishable from "the
  // row moved", so a transient SELECT blip cancelled an intent a twin might be
  // actively collecting on, and stranded the request.
  //
  // Refuse WITHOUT cancelling. Cancelling is the destructive branch and it must
  // never be reached on an unknown, only on a positive reading that the row
  // went somewhere else. Leaving the intent live costs nothing: the key is
  // stable, so the next attempt at this same quote finds this same object and
  // resolves it properly, and a genuinely orphaned intent expires at Stripe.
  if (afterError) {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't confirm that payment. Please try again.",
    };
  }

  // THE TWIN CASE. The row is collecting and it names THIS intent, so the
  // attempt that beat us is the same logical collection at the same Stripe
  // object: the key is derived from the request, its revision and the quoted
  // amount, so two concurrent attempts at one collection cannot land on
  // different intents.
  //
  // Returning a conflict here would be wrong twice over. The caller would be
  // told its payment failed when a perfectly good link exists, and the cancel
  // below would DESTROY A PAYMENT THE CLIENT IS IN THE MIDDLE OF MAKING.
  // `reused` is what tells the caller it did not create this one.
  if (
    after?.status === "payment_processing" &&
    after.payment_intent_id === intent.id
  ) {
    return {
      ok: true,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      reused: true,
      quote,
    };
  }

  // The row genuinely moved: settled, cancelled, expired or revised while this
  // attempt was at Stripe. The intent belongs to nothing now, so cancel it. A
  // cancelled intent is also what stops the stable key from handing the next
  // caller a dead object: the next attempt quotes a DIFFERENT amount or a
  // different revision, so it derives a different key.
  await cancelQuietly(stripe, intent.id);
  return {
    ok: false,
    code: "conflict",
    error: "This payment changed while you were paying. Please refresh.",
  };
}

/**
 * Hand back the intent this request is already collecting against.
 *
 * The stored id is trusted here for a reason that is a property of the schema
 * rather than of this function: nothing reads it unless the status is
 * `payment_processing`, and `payment_processing` is absent from the WITH CHECK
 * list of 0125's artist UPDATE policy, so an artist cannot put their own row
 * there. The only writer of that pair is the claim above, which sets both in
 * one statement. Migration 0127 records the same reasoning.
 *
 * The intent's metadata is verified anyway. It costs one comparison on an
 * object already fetched, and a secret returned for the wrong request is the
 * kind of thing that should be impossible twice over.
 *
 * AND SO IS ITS MONEY. Being the right object is not the same fact as being for
 * the right amount: this is the one path that returns a FRESH quote next to a
 * secret it did not create, so the two are compared before either is handed
 * back (see `intentDisagreesWithQuote`).
 */
async function reuseExistingIntent(
  stripe: Stripe,
  quote: PaymentQuote,
): Promise<PaymentIntentResult> {
  const intentId = quote.existingPaymentIntentId as string;
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(intentId);
  } catch (stripeErr) {
    Sentry.captureException(stripeErr, {
      tags: { action: "payment_request_retrieve_intent" },
      extra: { requestId: quote.requestId, intentId },
    });
    return {
      ok: false,
      code: "stripe_failed",
      error: "We couldn't load this payment. Please try again in a moment.",
    };
  }

  if (intent.metadata?.payment_request_id !== quote.requestId) {
    Sentry.captureMessage("payment request intent names a different request", {
      tags: { action: "payment_request_retrieve_intent" },
      extra: { requestId: quote.requestId, intentId },
    });
    return {
      ok: false,
      code: "conflict",
      error: "We couldn't load this payment. Please contact the artist.",
    };
  }

  if (!LIVE_INTENT_STATUSES.includes(intent.status) || !intent.client_secret) {
    // Succeeded or cancelled. Both are outcomes A4 records from the webhook,
    // and neither is something to hand a client a payable secret for. Reported
    // as a conflict rather than as a failure: nothing is broken, the request
    // has simply moved on and this reader has not caught up.
    return {
      ok: false,
      code: "conflict",
      error: "This payment has already been completed. Refresh to see it.",
    };
  }

  // THE STORED INTENT IS COMPARED TO THE QUOTE IT WOULD BE RETURNED BESIDE.
  //
  // Everything above this point checks that the intent is the RIGHT OBJECT
  // (it names this request) and that it is USABLE (live, with a secret).
  // Neither is a check that it is for the right MONEY, and this function
  // returns the fresh `quote` next to a secret it did not create, so without
  // this the two halves of spec section 8's "the displayed amount and the
  // Stripe charge come from the same quote" come from different quotes.
  //
  // Executed before the check existed (2026-07-30): a request quoting 15000
  // against a stored 20000 intent returned `ok: true` with that intent's
  // secret, i.e. 150.00 on the page and 200.00 at Stripe.
  //
  // THE IDEMPOTENCY KEY CANNOT REACH THIS. The key is derived per create, in
  // the path below, and this branch returns before any key is derived: a
  // re-quote at a new amount derives a different key only where a create
  // happens, and here none does. So this is a check gap and not a keying bug.
  // The key stops a SECOND intent being minted for one debt; it says nothing
  // about handing back a FIRST one that no longer matches.
  const disagreement = intentDisagreesWithQuote(intent, quote);
  if (disagreement) {
    Sentry.captureMessage("payment request intent disagrees with its quote", {
      tags: { action: "payment_request_retrieve_intent" },
      extra: { requestId: quote.requestId, intentId, disagreement },
    });
    // REFUSE, AND DO NOT CANCEL. `LIVE_INTENT_STATUSES` includes `processing`
    // and `requires_action`, which are payments a client may be in the middle
    // of making, and nothing here can tell one of those from an abandoned
    // attempt. That is the same rule the read-back branch above follows: the
    // destructive move is never taken on a reading that is ambiguous.
    //
    // The request stays in `payment_processing` until A4's webhook moves it,
    // which is what resolves this in both directions: a payment that lands
    // settles, and one that does not leaves a row whose stale attempt A8's
    // reconciliation is the backstop for (spec section 8). Recovering it from
    // this path would mean re-claiming a row this path deliberately does not
    // write, and `payment_processing -> payment_processing` is not a legal move.
    return {
      ok: false,
      code: "conflict",
      error: "This payment changed while you were paying. Please refresh.",
    };
  }

  return {
    ok: true,
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    reused: true,
    quote,
  };
}

/**
 * Every fact that decides what this intent will actually take, against the
 * quote that would be returned next to it. Returns a short description of the
 * first disagreement, or null when all of them agree.
 *
 * FOUR, NOT ONE. `amount` is the charge. `currency` is what the charge is
 * denominated in, and a quote in one currency beside an intent in another is
 * the same defect with a worse failure mode. `application_fee_amount` is
 * Inklee's whole take under Custom Connect, so an intent created under one fee
 * schedule and reused under another takes a rate the quote does not state.
 * `payment_intent_amount_minor` is the server's own record of what the attempt
 * was for (migration 0127), which nothing read before this: it and the Stripe
 * object are written from ONE quote by the claim, so a disagreement between
 * them means something else wrote one of the pair.
 */
function intentDisagreesWithQuote(
  intent: Stripe.PaymentIntent,
  quote: PaymentQuote,
): string | null {
  if (intent.amount !== quote.amountMinor) {
    return `amount ${intent.amount} vs quote ${quote.amountMinor}`;
  }
  // Stripe answers lowercase and this path stores what it was given, so the
  // fold is belt and braces rather than a known difference.
  if (intent.currency?.toLowerCase() !== quote.currency.toLowerCase()) {
    return `currency ${intent.currency} vs quote ${quote.currency}`;
  }
  if (intent.application_fee_amount !== quote.applicationFeeMinor) {
    return `fee ${intent.application_fee_amount} vs quote ${quote.applicationFeeMinor}`;
  }
  if (quote.existingPaymentIntentAmountMinor !== quote.amountMinor) {
    return `stored ${quote.existingPaymentIntentAmountMinor} vs quote ${quote.amountMinor}`;
  }
  return null;
}

/**
 * The idempotency key for one quote.
 *
 * Hashed rather than concatenated because Stripe caps the key at 255
 * characters and because the raw string carries internal amounts that have no
 * business travelling in a header. The hash is over the WHOLE canonical string,
 * so any field moving moves the key.
 */
export function paymentIntentIdempotencyKey(fingerprintSource: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(fingerprintSource)
    .digest("hex")
    .slice(0, 32);
  return `p9-apr-${digest}`;
}

/**
 * What A4 needs to settle this collection without re-deriving it.
 *
 * The subject and the request id are both carried, because an allocation binds
 * to both and a webhook has nothing else to read. `application_fee_minor` is
 * recorded as EVIDENCE OF INTENT, exactly like `sponsored_fee_cents` on the
 * deposit path: it says what Inklee asked Stripe for, and per the money-path
 * rules nothing is ever released or reconciled against it. What was actually
 * charged comes from the balance transaction at settlement.
 */
function intentMetadata(quote: PaymentQuote): Record<string, string> {
  return {
    payment_request_id: quote.requestId,
    artist_id: quote.artistId,
    ...(quote.subject.kind === "booking"
      ? { booking_id: quote.subject.id }
      : { project_id: quote.subject.id }),
    collects: quote.collects,
    revision: String(quote.revision),
    quoted_amount_minor: String(quote.amountMinor),
    application_fee_minor: String(quote.applicationFeeMinor),
    appointment_base_minor: String(quote.appointmentBaseMinor),
    goods_base_minor: String(quote.goodsBaseMinor),
    fee_schedule_version: quote.feeScheduleVersion,
    // G2 (FEE-STP-001): the tier this fee was priced at, read at settlement
    // (appointment-payment-settlement.ts) so the collection stamp doesn't
    // depend on the artist's CURRENT overrides, which may have changed since.
    fee_tier: quote.feeTier,
  };
}

/** Cancel an intent nothing references. Best effort by design: it is already
 *  unreachable, and a failure to cancel must not turn into the caller's error. */
async function cancelQuietly(stripe: Stripe, intentId: string): Promise<void> {
  try {
    await stripe.paymentIntents.cancel(intentId);
  } catch {
    // Already paid, already cancelled, or unreachable. Nothing to undo.
  }
}
