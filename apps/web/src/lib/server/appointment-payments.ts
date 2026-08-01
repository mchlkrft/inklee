import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ARTIST_CANCELLABLE_PAYMENT_REQUEST_STATUSES,
  PAYMENT_LINE_CLASSIFICATIONS,
  PAYMENT_LINE_TAX_TREATMENTS,
  SUPERSEDABLE_PAYMENT_REQUEST_STATUSES,
  isPaymentRequestCollects,
  lineTotalMinor,
  requestTotalMinor,
  type PaymentLineClassification,
  type PaymentLineTaxTreatment,
  type PaymentRequestCollects,
  type PaymentRequestStatus,
} from "@inklee/shared/appointment-payments";
import { ACTIVE_FEE_SCHEDULE_VERSION } from "@inklee/shared/fee-schedule";
import { canAccess, type AccountOverrides } from "@/lib/entitlements";
import type { EntitlementFeature } from "@/lib/entitlements";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { getConnectRoutingForArtist } from "@/lib/stripe-connect";
import { isCapabilityDisabled } from "./app-config";

// The ONE write path for appointment payment requests (Plus build P9, slice
// A2), shared by the web action and the mobile route, same discipline as
// server/collections.ts and server/discount-write.ts: the entitlement is
// refused SERVER-SIDE rather than hidden in the UI.
//
// SCOPE. Create, revise, send, cancel, expire. No Stripe (A3), no webhook (A4),
// no refunds (A5), no client page (A6), no native surface (A7). Nothing here
// touches money that has moved; everything here decides what a client will be
// ASKED to pay.
//
// Spec: docs/product/plus-payments-architecture.md. Money-path rules in
// AGENTS.md apply to every line.
//
// =========================================================================
// 1. "CANCELLED AND REPLACED" AND "A NEW REVISION" ARE ONE IMPLEMENTATION.
//
// Spec section 3 allows both outcomes, and if they were two code paths an
// artist would eventually get the half that edits a price the client already
// reviewed, which is the exact thing the immutable revision exists to prevent.
//
// They are not two outcomes. They are the two halves of ONE operation seen from
// the two rows it touches:
//
//   revisePaymentRequestCore  creates the SUCCESSOR as a fresh draft carrying
//                             `supersedes_id` and `revision + 1`. It cancels
//                             nothing. Until it is sent, the client still has
//                             exactly the request they were given.
//
//   sendPaymentRequestCore    freezes the successor AND cancels the predecessor
//                             named by `supersedes_id`, in ONE transaction
//                             (`send_payment_request`, migration 0126). Neither
//                             half can happen without the other.
//
// So `supersedes_id` IS the artist's recorded decision about which request is
// being replaced, written once, at the moment they chose to revise. There is no
// second flag, no "replace?" parameter at send, and therefore no way for the two
// answers to disagree.
//
// WHY THE CANCEL BELONGS AT SEND AND NOT AT REVISE. If revise cancelled the
// predecessor immediately, an artist who starts a revision and then abandons it
// leaves their client with a dead link and nothing to pay. Deferring it means
// the outstanding request stays live until a replacement genuinely exists.
// 0125's partial unique index (at most one payable request per subject) then
// puts the collision exactly at send, which is the moment the artist must have
// decided. That is designed for, not fought.
//
// =========================================================================
// 2. ENTITLEMENT MAPPING. Seven keys, all accounted for.
//
// The keys resolve together commercially (one Plus payment package) but stay
// DISTINCT in the system, so a later package change is a resolution change
// rather than a rewrite. Which one gates what, and why:
//
//   card_deposit_collection            create / revise / send a `deposit`
//   appointment_balance_collection     create / revise / send a `balance`
//   full_appointment_payment_collection create / revise / send a `full_price`
//
//     Chosen by the request's `collects` column, not by its lines: one
//     `tattoo_service` line of 100.00 is any of the three, and spec section 1
//     prices and gates them separately. Send re-derives the key from the STORED
//     row, so an artist who composes while entitled and sends after a downgrade
//     is refused at the moment the client would be asked to pay. That is spec
//     section 12's "downgrade after sending a request".
//
//   appointment_payment_line_items     any request with MORE THAN ONE line
//
//     Its own key, per spec section 1 ("additional itemized lines"). One line
//     is the plain case: an amount for the tattoo. A second line is a tip, a
//     discount, goods, an additional service, tax or shipping, and that is the
//     itemization capability. Derived from the lines rather than declared, so
//     it cannot be understated by a caller.
//
//   manual_deposit_tracking            GATES NOTHING HERE, deliberately.
//
//     It is the Free baseline (the only feature `PLAN_FEATURES.free` grants)
//     and it describes the EXISTING manual / offline path on
//     `booking_requests.deposit_*`, which `requestDepositCore` in bookings.ts
//     owns and which this module does not touch. A payment request is a card
//     instrument by construction, so the key whose whole meaning is "no card"
//     cannot gate a card core. Naming it here as an explicit non-gate is the
//     point: a reader checking that all seven keys were considered can see the
//     answer instead of inferring an omission.
//
//   appointment_payment_refunds        A5. No refund path exists in this file.
//   appointment_payment_insights       P6 analytics. No read surface here.
//
// CANCEL AND EXPIRE ARE NOT GATED ON ANY OF THEM, and that is a decision.
// Cancelling is a WITHDRAWAL and expiring is a safety property of a link. An
// artist who lapses to Free, or a platform-wide pause, must never leave an
// outstanding request that nobody can stop; that would trap a live request to
// pay against a downgrade. The gate belongs on asking for money, not on
// stopping.
//
// THE LEGACY `deposits` KEY IS UNTOUCHED. It stays the live gate for the
// existing card-deposit path until P7 migrates those call sites (spec section
// 2), and nothing in this file reads or writes it. Both paths agree today
// anyway: `PLAN_FEATURES` grants Free only `manual_deposit_tracking` and Plus
// everything, so all seven keys resolve exactly as `deposits` does.
//
// THE PLATFORM PAUSE is the `appointment_payments` capability, one noun for the
// whole feature exactly as `deposits` is one noun for the card-deposit path.
// GRANT shape (`!disabled && canAccess`), because this is a new capability:
// pausing it reverts to today's behaviour, which is that no payment request
// exists at all. Note `isCapabilityDisabled` is FAIL-OPEN by design
// (app-config.ts), so the pause is an operational kill switch and not what
// keeps A2 dark. What keeps it dark is that nothing calls these cores yet and
// all seven keys are Plus-only.

/** Spec section 10: "a bounded number of line items". This is not a general
 *  invoice platform, and a client has to READ this list before paying. */
export const MAX_PAYMENT_REQUEST_LINES = 20;

/** How long a sent request stays payable when the caller does not say.
 *  A link with no expiry is a link that can be paid months later against a
 *  price nobody remembers agreeing. Overridable per request. */
export const DEFAULT_PAYMENT_REQUEST_TTL_DAYS = 7;

/**
 * The largest magnitude any amount on this path may have, in minor units.
 *
 * THE SCHEMA'S OWN CEILING, not a product opinion: `unit_amount_minor`,
 * `line_total_minor` and `total_minor` are all `integer` in 0125, and
 * `payment_request_lines_total_check` asserts `line_total_minor =
 * unit_amount_minor * quantity` as int4 arithmetic, which raises 22003 on
 * overflow. Anything above this is a row Postgres will not store.
 *
 * WHY IT IS CHECKED HERE AT ALL, given `assertIntegerMinor` exists.
 * `Number.isSafeInteger` is checked on the unit and on the quantity
 * SEPARATELY, and both pass for a pair whose PRODUCT is not a safe integer:
 * `lineTotalMinor` returns that product unchecked and `requestTotalMinor` then
 * THROWS on it. A TypeError is not a refusal, and a money path that answers one
 * bad amount with a sentence and another with a stack trace does not have an
 * error contract. Executed before the bound existed:
 * `{ quantity: 2, unitAmountMinor: Number.MAX_SAFE_INTEGER }` produced
 * `TypeError: lineTotalMinor must be an integer number of minor units, received
 * 18014398509481982`, while a plain over-int32 amount was refused cleanly.
 *
 * Symmetric, so `-2147483648` (storable, one below the column's floor) is
 * refused too. Nobody discounts twenty-one million euros, and one magnitude is
 * simpler to reason about than an asymmetric pair.
 */
export const MAX_PAYMENT_AMOUNT_MINOR = 2_147_483_647;

export type PaymentRequestWriteCode =
  /** The plan does not include this capability, or it is paused platform-wide. */
  | "not_entitled"
  /** The input is wrong and the artist can fix it. */
  | "invalid"
  /** No such request for this artist. */
  | "not_found"
  /** The request is sent, so its amount and lines are closed. */
  | "frozen"
  /** Another request for this subject is already waiting to be paid. */
  | "already_outstanding"
  /** Money has been collected or is being collected against it. */
  | "settled"
  /** The artist has no charge-ready payout account, so a client could not pay. */
  | "not_connected"
  /** Something changed underneath; a refresh and retry is the answer. */
  | "conflict"
  /** Anything else. */
  | "failed";

export type PaymentRequestWriteResult =
  | {
      ok: true;
      id: string;
      status: PaymentRequestStatus;
      customerToken?: string;
    }
  | { ok: false; code: PaymentRequestWriteCode; error: string };

export type PaymentRequestExpiryResult =
  | { ok: true; expiredIds: string[] }
  | { ok: false; code: PaymentRequestWriteCode; error: string };

/** Exactly one of an appointment or a project, matching the
 *  `payment_requests_subject_check` constraint. */
export type PaymentSubjectInput =
  | { kind: "booking"; id: string }
  | { kind: "project"; id: string };

export type PaymentLineInput = {
  name?: unknown;
  description?: unknown;
  quantity?: unknown;
  /** Integer MINOR units. Signed: a discount is negative. */
  unitAmountMinor?: unknown;
  classification?: unknown;
  taxTreatment?: unknown;
  /** Only on a `physical_goods` line. */
  productId?: unknown;
};

export type PaymentRequestInput = {
  subject?: unknown;
  collects?: unknown;
  currency?: unknown;
  lines?: unknown;
};

// ---------------------------------------------------------------------------
// Entitlement.

// `Partial<Record<EntitlementFeature, string>>` rather than
// `Record<string, string>`: partial because only the four keys this module gates
// belong here, and KEYED BY THE FEATURE TYPE so a mistyped or renamed key is a
// compile error instead of a silent miss that falls through to the generic
// sentence at run time.
const NOT_ENTITLED_COPY: Partial<Record<EntitlementFeature, string>> = {
  card_deposit_collection:
    "Card deposits aren't included in your current plan.",
  appointment_balance_collection:
    "Collecting a remaining balance isn't included in your current plan.",
  full_appointment_payment_collection:
    "Collecting the full appointment price isn't included in your current plan.",
  appointment_payment_line_items:
    "Extra payment lines aren't included in your current plan.",
};

/** The collection key for what a request collects. One switch, exhaustive over
 *  `PaymentRequestCollects`, so adding a fourth value is a type error here
 *  rather than a silently ungated capability. */
export function collectionEntitlementKey(
  collects: PaymentRequestCollects,
): EntitlementFeature {
  switch (collects) {
    case "deposit":
      return "card_deposit_collection";
    case "balance":
      return "appointment_balance_collection";
    case "full_price":
      return "full_appointment_payment_collection";
  }
}

/** Every key a request needs, in the order they are reported. Exported so the
 *  UI can show the right upgrade prompt without re-deriving the rule. */
export function requiredPaymentEntitlements(
  collects: PaymentRequestCollects,
  lineCount: number,
): EntitlementFeature[] {
  const keys: EntitlementFeature[] = [collectionEntitlementKey(collects)];
  // More than ONE line is the itemization capability (spec section 1,
  // "additional itemized lines").
  if (lineCount > 1) keys.push("appointment_payment_line_items");
  return keys;
}

/** Pure half of the gate, so the same rule can be asserted without a database.
 *  Returns the FIRST missing key, or null when everything is held. */
export function missingPaymentEntitlement(
  overrides: AccountOverrides,
  collects: PaymentRequestCollects,
  lineCount: number,
): EntitlementFeature | null {
  for (const key of requiredPaymentEntitlements(collects, lineCount)) {
    if (!canAccess(overrides, key)) return key;
  }
  return null;
}

/**
 * The gate every money-asking core runs first.
 *
 * A FAILED ENTITLEMENT READ IS AN ERROR, never "free plan". That is the
 * money-path rule the deposit path already follows (`getAccountOverrides`
 * throws on purpose): swallowing it would resolve a comped Plus artist to Free
 * and refuse a request they are entitled to, or worse, in a variant of this
 * code, quietly degrade what the client is shown.
 */
async function requirePaymentEntitlement(
  artistId: string,
  collects: PaymentRequestCollects,
  lineCount: number,
): Promise<PaymentRequestWriteResult | null> {
  if (isCapabilityDisabled("appointment_payments")) {
    return {
      ok: false,
      code: "not_entitled",
      error: "Payment requests are paused right now. Please try again later.",
    };
  }
  let overrides: AccountOverrides;
  try {
    overrides = await getAccountOverrides(artistId);
  } catch {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't verify your plan. Please try again.",
    };
  }
  const missing = missingPaymentEntitlement(overrides, collects, lineCount);
  if (missing) {
    return {
      ok: false,
      code: "not_entitled",
      error:
        NOT_ENTITLED_COPY[missing] ??
        "That isn't included in your current plan.",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation. Inputs arrive as `unknown` and are narrowed here, following
// discount-write.ts: a money path does not trust a caller's types.

const MAX_LINE_NAME = 120;
const MAX_LINE_DESCRIPTION = 500;

function trimmed(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asSubject(value: unknown): PaymentSubjectInput | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { kind?: unknown; id?: unknown };
  if (typeof v.id !== "string" || v.id.trim() === "") return null;
  if (v.kind !== "booking" && v.kind !== "project") return null;
  return { kind: v.kind, id: v.id };
}

function asCurrency(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "eur";
  if (typeof value !== "string") return null;
  const c = value.trim().toLowerCase();
  return c.length === 3 ? c : null;
}

/** One validated line, in database column shape. `lineTotalMinor` is COMPUTED
 *  here and never taken from the caller: a caller-supplied total that disagreed
 *  with unit x quantity is a price the client would see one of and be charged
 *  the other. The database asserts the same identity in
 *  `payment_request_lines_total_check`. */
type ValidatedLine = {
  name: string;
  description: string | null;
  quantity: number;
  unit_amount_minor: number;
  line_total_minor: number;
  classification: PaymentLineClassification;
  tax_treatment: PaymentLineTaxTreatment;
  product_id: string | null;
  source: "artist_manual" | "linked_product";
  position: number;
};

type LineValidation =
  | { ok: true; lines: ValidatedLine[]; totalMinor: number }
  | { ok: false; error: string };

function validateLines(raw: unknown): LineValidation {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Add at least one line to charge for." };
  }
  if (raw.length > MAX_PAYMENT_REQUEST_LINES) {
    return {
      ok: false,
      error: `A payment request can have at most ${MAX_PAYMENT_REQUEST_LINES} lines.`,
    };
  }

  const lines: ValidatedLine[] = [];
  let runningTotalMinor = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const input = (raw[i] ?? {}) as PaymentLineInput;

    const name = trimmed(input.name, MAX_LINE_NAME);
    if (name === "") {
      return { ok: false, error: "Every line needs a name." };
    }

    const classification = (
      PAYMENT_LINE_CLASSIFICATIONS as readonly string[]
    ).includes(String(input.classification))
      ? (input.classification as PaymentLineClassification)
      : null;
    if (!classification) {
      return { ok: false, error: "Choose what each line is for." };
    }

    const quantity = input.quantity === undefined ? 1 : Number(input.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      return {
        ok: false,
        error: "Quantity has to be a whole number above zero.",
      };
    }

    // `Number(null)`, `Number(undefined)` and `Number("")` are 0, NaN and 0
    // respectively, so a missing amount would otherwise become a silent zero on
    // two of those three. An absent amount is a mistake, not a free line.
    const rawUnit = input.unitAmountMinor;
    const unit =
      typeof rawUnit === "number"
        ? rawUnit
        : typeof rawUnit === "string" && rawUnit.trim() !== ""
          ? Number(rawUnit.trim())
          : NaN;
    if (!Number.isSafeInteger(unit)) {
      return { ok: false, error: "Enter an amount for every line." };
    }
    // BOUNDED, not just integral. See `MAX_PAYMENT_AMOUNT_MINOR`: the three
    // checks below (unit, unit x quantity, running total) are what keep an
    // amount this module cannot store from reaching `requestTotalMinor`, which
    // answers an out-of-range value with a thrown TypeError rather than with a
    // refusal the artist can act on.
    if (Math.abs(unit) > MAX_PAYMENT_AMOUNT_MINOR) {
      return {
        ok: false,
        error: "That line amount is too large. Lower it and try again.",
      };
    }

    // Mirrors `payment_request_lines_sign_check`. Refused here as well as in the
    // database so the artist gets a sentence instead of a constraint name: a
    // "tip" of -50.00 would otherwise read to the client as a tip while quietly
    // reducing the total.
    if (classification === "discount") {
      if (unit > 0) {
        return {
          ok: false,
          error: "A discount line has to be a negative amount.",
        };
      }
    } else if (unit < 0) {
      return {
        ok: false,
        error: "Only a discount line can be a negative amount.",
      };
    }

    const taxTreatment = (
      PAYMENT_LINE_TAX_TREATMENTS as readonly string[]
    ).includes(String(input.taxTreatment))
      ? (input.taxTreatment as PaymentLineTaxTreatment)
      : "unspecified";

    const productId =
      typeof input.productId === "string" && input.productId.trim() !== ""
        ? input.productId
        : null;
    // Mirrors `payment_request_lines_product_class_check`. A linked product on
    // a non-goods line would put goods value in the appointment fee lane, which
    // spec section 6 forbids: the two fees are never charged on the same value.
    if (productId && classification !== "physical_goods") {
      return {
        ok: false,
        error: "Only a physical goods line can be linked to a product.",
      };
    }

    // THE PRODUCT is the value neither safe-integer check above can see, and it
    // is the one that escaped. Computed through the shared identity so there is
    // still exactly one implementation of "unit x quantity", then bounded.
    const lineTotal = lineTotalMinor({ unitAmountMinor: unit, quantity });
    if (Math.abs(lineTotal) > MAX_PAYMENT_AMOUNT_MINOR) {
      return {
        ok: false,
        error:
          "That line adds up to more than we can charge. Lower the amount or the quantity.",
      };
    }

    // The RUNNING total, checked per line rather than once at the end, so the
    // accumulator itself can never leave safe-integer range: every term is now
    // bounded and there are at most `MAX_PAYMENT_REQUEST_LINES` of them, which
    // caps the sum far below 2^53 even before this refuses.
    runningTotalMinor += lineTotal;
    if (Math.abs(runningTotalMinor) > MAX_PAYMENT_AMOUNT_MINOR) {
      return {
        ok: false,
        error:
          "This payment request adds up to more than we can charge. Remove a line or lower an amount.",
      };
    }

    lines.push({
      name,
      description: trimmed(input.description, MAX_LINE_DESCRIPTION) || null,
      quantity,
      unit_amount_minor: unit,
      line_total_minor: lineTotal,
      classification,
      tax_treatment: taxTreatment,
      product_id: productId,
      source: productId ? "linked_product" : "artist_manual",
      position: i,
    });
  }

  // Kept as the authoritative computation even though the loop already carries
  // the same running sum: this is the mirror of what the freeze trigger asserts
  // in SQL, and re-deriving it from the stored line totals is what makes the two
  // comparable. It can no longer THROW, because every term reaching it has been
  // bounded above; that is the property the bound exists for.
  const totalMinor = requestTotalMinor(
    lines.map((l) => ({ lineTotalMinor: l.line_total_minor })),
  );
  // Spec section 4: a zero balance produces no request at all rather than a
  // 0.00 one. A negative total is a discount larger than everything it discounts
  // and is not a refund; refunds are A5.
  if (totalMinor <= 0) {
    return {
      ok: false,
      error: "A payment request has to add up to more than zero.",
    };
  }

  return { ok: true, lines, totalMinor };
}

// ---------------------------------------------------------------------------
// Shared write helpers.

/**
 * Replace a draft's whole line set.
 *
 * Clear-then-insert rather than a diff, because the editor holds the whole
 * answer and sends the whole answer, and because the alternative (matching
 * lines up across an edit) invents an identity a client-facing snapshot does
 * not have. Both statements are refused by the lines trigger if the parent is
 * frozen, for every role, so this can only ever rewrite something nobody has
 * been shown.
 *
 * The DELETE is a wasted round trip on a freshly created request. Kept anyway:
 * create and revise then write lines through ONE implementation, and the
 * alternative is two code paths that agree today.
 *
 * Returns the database's message on failure, or null. The CALLER decides what
 * happens next, because the compensation differs: create discards its draft,
 * revise discards its revision.
 */
async function replaceDraftLines(
  supabase: SupabaseClient,
  artistId: string,
  requestId: string,
  currency: string,
  lines: ValidatedLine[],
): Promise<string | null> {
  const { error: clearError } = await supabase
    .from("payment_request_lines")
    .delete()
    .eq("request_id", requestId)
    .eq("artist_id", artistId);
  if (clearError) return clearError.message;

  const { error } = await supabase.from("payment_request_lines").insert(
    lines.map((line) => ({
      request_id: requestId,
      artist_id: artistId,
      currency,
      ...line,
    })),
  );
  return error ? error.message : null;
}

/**
 * Undo a half-built draft.
 *
 * Only ever called on a request this core just created and has not sent, which
 * is exactly the set 0125's DELETE policy allows an artist to remove. Best
 * effort on purpose: if it fails, the residual is a STRANDED EMPTY DRAFT, and a
 * stranded draft is harmless by construction. It can never be sent, because the
 * freeze trigger verifies the total against the sum of the lines and a draft
 * with no lines fails that check for every role. The artist can delete it.
 */
async function discardDraft(
  supabase: SupabaseClient,
  artistId: string,
  requestId: string,
): Promise<void> {
  await supabase
    .from("payment_requests")
    .delete()
    .eq("id", requestId)
    .eq("artist_id", artistId);
}

type StoredRequest = {
  id: string;
  status: PaymentRequestStatus;
  currency: string;
  collects: PaymentRequestCollects | null;
  revision: number;
  booking_id: string | null;
  project_id: string | null;
  sent_at: string | null;
  total_minor: number;
};

async function readRequest(
  supabase: SupabaseClient,
  artistId: string,
  id: string,
): Promise<
  | { ok: true; request: StoredRequest }
  | { ok: false; code: PaymentRequestWriteCode; error: string }
> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select(
      "id, status, currency, collects, revision, booking_id, project_id, sent_at, total_minor",
    )
    .eq("id", id)
    .eq("artist_id", artistId)
    .maybeSingle();
  // A READ ERROR AND AN ABSENT ROW ARE DIFFERENT FACTS and are kept apart, code
  // and copy. Collapsing them turns a transient database blip into "that
  // request is gone" in front of an artist who is trying to stop a payment, and
  // a caller retrying a `failed` is right where retrying a `not_found` is not.
  if (error) {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't load that payment request. Please try again.",
    };
  }
  if (!data) {
    return {
      ok: false,
      code: "not_found",
      error: "That payment request is gone.",
    };
  }
  return { ok: true, request: data as StoredRequest };
}

// ---------------------------------------------------------------------------
// CREATE.

/**
 * Compose a new payment request as a DRAFT.
 *
 * Nothing is frozen and nobody is asked for anything: 0125's INSERT policy will
 * not accept a row that is already sent, and this core does not try. The draft
 * becomes a client-facing commitment only in `sendPaymentRequestCore`.
 */
export async function createPaymentRequestCore(
  supabase: SupabaseClient,
  artistId: string,
  input: PaymentRequestInput,
): Promise<PaymentRequestWriteResult> {
  const subject = asSubject(input.subject);
  if (!subject) {
    return {
      ok: false,
      code: "invalid",
      error: "Pick the appointment or project this payment is for.",
    };
  }
  if (!isPaymentRequestCollects(input.collects)) {
    return {
      ok: false,
      code: "invalid",
      error:
        "Choose whether this collects a deposit, a balance or the full price.",
    };
  }
  const collects = input.collects;

  const currency = asCurrency(input.currency);
  if (!currency) {
    return { ok: false, code: "invalid", error: "That currency isn't valid." };
  }

  const validated = validateLines(input.lines);
  if (!validated.ok) {
    return { ok: false, code: "invalid", error: validated.error };
  }

  // The gate runs AFTER validation so an un-entitled artist is told about their
  // plan rather than about a typo, and after the line count is known because
  // itemization is its own key.
  const gate = await requirePaymentEntitlement(
    artistId,
    collects,
    validated.lines.length,
  );
  if (gate) return gate;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("payment_requests")
    .insert({
      artist_id: artistId,
      booking_id: subject.kind === "booking" ? subject.id : null,
      project_id: subject.kind === "project" ? subject.id : null,
      status: "draft",
      currency,
      collects,
      total_minor: validated.totalMinor,
      revision: 1,
      updated_at: now,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    // 23503 here means the subject is not this artist's: the composite FK binds
    // (booking_id, artist_id) so a guessed id cannot resolve. 42501 means the
    // INSERT policy refused. Both are the same answer to the artist.
    return {
      ok: false,
      code: "invalid",
      error: "Couldn't start that payment request.",
    };
  }
  const id = data.id as string;

  const lineError = await replaceDraftLines(
    supabase,
    artistId,
    id,
    currency,
    validated.lines,
  );
  if (lineError) {
    await discardDraft(supabase, artistId, id);
    return {
      ok: false,
      code: "invalid",
      error: "Couldn't save those payment lines.",
    };
  }

  return { ok: true, id, status: "draft" };
}

// ---------------------------------------------------------------------------
// REVISE.

/**
 * Start a new revision of a request that has already been sent.
 *
 * Creates the SUCCESSOR only. The predecessor stays exactly as the client has
 * it, and is cancelled by `sendPaymentRequestCore` at the instant the
 * replacement becomes payable. See the header: this is half of one operation,
 * not an outcome of its own.
 *
 * `input.lines` absent means CARRY THE PREDECESSOR'S LINES OVER, so an artist
 * changing one amount starts from what the client actually saw rather than from
 * an empty form. Lineage is recorded by `supersedes_id`, not by a line's
 * `source`, which is why a carried line keeps whatever source it had.
 */
export async function revisePaymentRequestCore(
  supabase: SupabaseClient,
  artistId: string,
  requestId: string,
  input: Omit<PaymentRequestInput, "subject"> = {},
): Promise<PaymentRequestWriteResult> {
  const read = await readRequest(supabase, artistId, requestId);
  if (!read.ok) return read;
  const previous = read.request;

  // An unsent request is not revised, it is EDITED. Sending the artist round a
  // revision loop for a draft nobody has seen would leave a trail of dead
  // drafts and a revision number that means nothing.
  if (previous.sent_at === null) {
    return {
      ok: false,
      code: "invalid",
      error:
        "This payment request hasn't been sent yet, so you can edit it directly.",
    };
  }

  // Advisory: `send_payment_request` re-checks this under a row lock, in a
  // later statement, because a predecessor can settle while a revision is being
  // composed. Checking here as well means the artist finds out before writing
  // the revision rather than after.
  if (!SUPERSEDABLE_PAYMENT_REQUEST_STATUSES.includes(previous.status)) {
    return {
      ok: false,
      code: "settled",
      error:
        "This payment request already has a payment against it, so it can't be replaced. Refund it first if the amount needs to change.",
    };
  }

  const collects = isPaymentRequestCollects(input.collects)
    ? input.collects
    : previous.collects;
  if (!collects) {
    return {
      ok: false,
      code: "invalid",
      error:
        "Choose whether this collects a deposit, a balance or the full price.",
    };
  }

  // The currency is inherited, never re-chosen. The composite FK on
  // `supersedes_id` is (id, artist_id, currency), so a revision in a different
  // currency is not a row Postgres will store; refusing it here would be the
  // same answer with a worse message, and allowing it to be passed at all would
  // invite the question.
  const currency = previous.currency;

  let lines: ValidatedLine[];
  let totalMinor: number;
  if (input.lines === undefined) {
    const carried = await carryOverLines(supabase, artistId, requestId);
    if (!carried.ok) {
      return { ok: false, code: "failed", error: carried.error };
    }
    lines = carried.lines;
    totalMinor = carried.totalMinor;
    if (lines.length === 0 || totalMinor <= 0) {
      return {
        ok: false,
        code: "invalid",
        error:
          "There's nothing to carry over. Add the lines you want to charge for.",
      };
    }
  } else {
    const validated = validateLines(input.lines);
    if (!validated.ok) {
      return { ok: false, code: "invalid", error: validated.error };
    }
    lines = validated.lines;
    totalMinor = validated.totalMinor;
  }

  const gate = await requirePaymentEntitlement(
    artistId,
    collects,
    lines.length,
  );
  if (gate) return gate;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("payment_requests")
    .insert({
      artist_id: artistId,
      booking_id: previous.booking_id,
      project_id: previous.project_id,
      status: "draft",
      currency,
      collects,
      total_minor: totalMinor,
      revision: previous.revision + 1,
      supersedes_id: previous.id,
      updated_at: now,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      code: "invalid",
      error: "Couldn't start a new version of that payment request.",
    };
  }
  const id = data.id as string;

  const lineError = await replaceDraftLines(
    supabase,
    artistId,
    id,
    currency,
    lines,
  );
  if (lineError) {
    await discardDraft(supabase, artistId, id);
    return {
      ok: false,
      code: "invalid",
      error: "Couldn't save those payment lines.",
    };
  }

  return { ok: true, id, status: "draft" };
}

/** The predecessor's lines, re-shaped as new rows. Positions are re-numbered so
 *  a gap left by an earlier edit does not travel forward. */
async function carryOverLines(
  supabase: SupabaseClient,
  artistId: string,
  requestId: string,
): Promise<
  | { ok: true; lines: ValidatedLine[]; totalMinor: number }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("payment_request_lines")
    .select(
      "name, description, quantity, unit_amount_minor, line_total_minor, classification, tax_treatment, product_id, source, position",
    )
    .eq("request_id", requestId)
    .eq("artist_id", artistId)
    .order("position", { ascending: true });
  // FAIL LOUD. An empty result from a failed read would silently produce a
  // revision with NO lines, which is a request for zero against a client who
  // was quoted an amount.
  if (error) {
    return { ok: false, error: "Couldn't read the current payment lines." };
  }

  const lines: ValidatedLine[] = (data ?? []).map((row, index) => ({
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    quantity: row.quantity as number,
    unit_amount_minor: row.unit_amount_minor as number,
    line_total_minor: row.line_total_minor as number,
    classification: row.classification as PaymentLineClassification,
    tax_treatment: row.tax_treatment as PaymentLineTaxTreatment,
    product_id: (row.product_id as string | null) ?? null,
    source:
      (row.source as "artist_manual" | "linked_product") ?? "artist_manual",
    position: index,
  }));

  return {
    ok: true,
    lines,
    totalMinor: requestTotalMinor(
      lines.map((l) => ({ lineTotalMinor: l.line_total_minor })),
    ),
  };
}

// ---------------------------------------------------------------------------
// SEND.

export type SendPaymentRequestOptions = {
  /** When the link stops being payable. Defaults to
   *  `DEFAULT_PAYMENT_REQUEST_TTL_DAYS` from now. */
  expiresAt?: string | Date | null;
};

/** The refusals `send_payment_request` can return, mapped to copy. Keyed by the
 *  stable snake_case tokens the function returns, so nothing here matches on
 *  prose. */
const SEND_REFUSALS: Record<
  string,
  { code: PaymentRequestWriteCode; error: string }
> = {
  gone: { code: "not_found", error: "That payment request is gone." },
  already_sent: {
    code: "frozen",
    error: "This payment request has already been sent.",
  },
  not_sendable: {
    code: "frozen",
    error: "This payment request can't be sent from its current state.",
  },
  purpose_missing: {
    code: "invalid",
    error:
      "This payment request doesn't say what it collects. Start a new one instead.",
  },
  empty: {
    code: "invalid",
    error: "There's nothing to collect, so this request can't be sent.",
  },
  already_outstanding: {
    code: "already_outstanding",
    error:
      "A payment request is already waiting to be paid. Cancel it first, or send a version that replaces it.",
  },
  supersedes_gone: {
    code: "not_found",
    error:
      "The request this replaces is no longer there. Start a new payment request instead.",
  },
  // "or project", because the RPC branch behind this token compares BOTH
  // `booking_id` and `project_id`, and A2 supports a project subject. Naming
  // only the appointment told half the artists who can reach this that the
  // message was about something else.
  supersedes_foreign: {
    code: "invalid",
    error:
      "This version belongs to a different appointment or project. Start a new payment request instead.",
  },
  supersedes_settled: {
    code: "settled",
    error:
      "The request this replaces already has a payment against it, so it can't be replaced. Refund it first if the amount needs to change.",
  },
  supersedes_changed: {
    code: "conflict",
    error: "That payment request changed. Refresh and try again.",
  },
};

/**
 * Freeze a draft and make it payable.
 *
 * THIS IS A STATE TRANSITION UNDER CONCURRENCY, and it is the reason migration
 * 0126 exists. Two things happen at once (the successor freezes, the
 * predecessor cancels) and they must live or die together. Through PostgREST
 * they would be two transactions, and a freeze that failed after the cancel had
 * committed would destroy the artist's outstanding request and send nothing.
 * `apps/web/tests/db/payment-request-send-race.test.ts` performs that
 * two-round-trip shape against a real interleaving and asserts the loss, so the
 * atomic version is measured against something rather than asserted.
 *
 * The RPC additionally locks the predecessor and re-checks it in a LATER
 * statement, because under READ COMMITTED a statement sees one snapshot and
 * blocking on a lock does not re-evaluate a subquery. Without that, a
 * settlement landing mid-send would let this ask a client to pay a balance they
 * had just paid. Read 0126's header before changing anything here.
 *
 * The entitlement is re-derived from the STORED row rather than from anything
 * the caller passes, so a request composed while entitled cannot be sent after
 * a downgrade.
 */
export async function sendPaymentRequestCore(
  supabase: SupabaseClient,
  artistId: string,
  requestId: string,
  options: SendPaymentRequestOptions = {},
): Promise<PaymentRequestWriteResult> {
  const read = await readRequest(supabase, artistId, requestId);
  if (!read.ok) return read;
  const request = read.request;

  if (!request.collects) {
    return {
      ok: false,
      code: "invalid",
      error:
        "This payment request doesn't say what it collects. Start a new one instead.",
    };
  }

  // Counted, not trusted: the itemization key is decided by what is actually
  // stored on the request being sent.
  const { count, error: countError } = await supabase
    .from("payment_request_lines")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId)
    .eq("artist_id", artistId);
  if (countError || count === null) {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't read the payment lines. Please try again.",
    };
  }

  const gate = await requirePaymentEntitlement(
    artistId,
    request.collects,
    count,
  );
  if (gate) return gate;

  // CONNECT GATE (M10). A payment link is only sendable when a client could
  // actually PAY it: without a charge-ready Connect account the failure would
  // otherwise land on the CLIENT at pay time, which is the wrong party. Checked
  // BEFORE the freeze RPC so a refused send leaves the draft untouched. Cached
  // Connect state can lie toward stale-active (AGENTS.md), so a send can still
  // pass here and fail later at intent creation, which refuses safely; this
  // gate's job is the common case, never sending from a never-onboarded or
  // known-disabled account.
  const routing = await getConnectRoutingForArtist(artistId);
  if (!routing.routeCharges) {
    return {
      ok: false,
      code: "not_connected",
      error:
        "Connect your payout account before sending a payment request. Set it up in settings, then send again.",
    };
  }

  const expiresAt = resolveExpiry(options.expiresAt);
  if (!expiresAt.ok) {
    return { ok: false, code: "invalid", error: expiresAt.error };
  }

  const { data, error } = await supabase.rpc("send_payment_request", {
    p_request_id: requestId,
    p_artist_id: artistId,
    p_expires_at: expiresAt.value,
    p_fee_schedule_version: ACTIVE_FEE_SCHEDULE_VERSION,
  });

  if (error) {
    // 23505: the partial unique index refused a second payable request for this
    // subject. It is the ARBITER, not a failure mode to be pre-empted, and the
    // whole RPC transaction has already rolled back, so nothing was cancelled.
    // Same posture as saveDiscountCore: two tabs both pass a read and only one
    // can pass this.
    if (error.code === "23505") {
      return {
        ok: false,
        code: "already_outstanding",
        error: SEND_REFUSALS.already_outstanding.error,
      };
    }
    // 23514 carries a stable snake_case token at the start of the message
    // (0125's triggers). The only one reachable from here is the freeze-time
    // check that the total still equals the sum of the lines, which means the
    // lines changed under this send.
    if (
      error.code === "23514" &&
      String(error.message).includes("payment_request_total_mismatch")
    ) {
      return {
        ok: false,
        code: "conflict",
        error:
          "The lines changed while this was sending. Refresh and try again.",
      };
    }
    return {
      ok: false,
      code: "failed",
      error: "Couldn't send that payment request. Please try again.",
    };
  }

  const verdict = String(data ?? "");
  if (verdict !== "sent") {
    const refusal = SEND_REFUSALS[verdict];
    if (refusal) return { ok: false, ...refusal };
    return {
      ok: false,
      code: "failed",
      error: "Couldn't send that payment request. Please try again.",
    };
  }

  // The client-facing payment link token. Generated at SEND time so drafts
  // have no URL, and stored as a SHA-256 hash so the database never holds
  // the credential a client uses. Same pattern as booking_requests and
  // projects: the raw token goes in the URL, only the hash is stored.
  const customerToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto
    .createHash("sha256")
    .update(customerToken)
    .digest("hex");

  // Best effort: if the hash fails to store, the request is already sent and
  // the artist can resend (which generates a fresh token). The alternative
  // is rolling back a successfully frozen request because a credential
  // column failed, which would destroy a committed state transition.
  await supabase
    .from("payment_requests")
    .update({ customer_token_hash: tokenHash })
    .eq("id", requestId)
    .eq("artist_id", artistId);

  return { ok: true, id: requestId, status: "sent", customerToken };
}

function resolveExpiry(
  value: string | Date | null | undefined,
): { ok: true; value: string } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    const at = new Date(
      Date.now() + DEFAULT_PAYMENT_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    return { ok: true, value: at.toISOString() };
  }
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) {
    return { ok: false, error: "That expiry date isn't valid." };
  }
  // A link that is already expired is a link nobody can pay, and sending one
  // would present the artist with a success they cannot act on.
  if (at.getTime() <= Date.now()) {
    return { ok: false, error: "The expiry date has to be in the future." };
  }
  return { ok: true, value: at.toISOString() };
}

// ---------------------------------------------------------------------------
// CANCEL.

/**
 * Withdraw a payment request.
 *
 * REFUSES ANYTHING ALREADY COLLECTING MONEY. `payment_processing`,
 * `partially_paid`, `paid`, `partially_refunded`, `refunded` and `disputed` are
 * all absent from `ARTIST_CANCELLABLE_PAYMENT_REQUEST_STATUSES`. Some of those
 * moves are LEGAL in the transition table, because A4 has to be able to record
 * a Stripe-cancelled intent; they are not things an artist may do. Money that
 * exists is A5's refund path.
 *
 * NO ENTITLEMENT GATE, deliberately. Stopping a request for money must work for
 * an artist who has lapsed to Free and while the capability is paused; the
 * alternative is a live request to pay that nobody can withdraw.
 *
 * WHY THIS NEEDS NO RPC while send does, which is the precise version of the
 * 0124 lesson rather than the folk version. This is ONE row and the status test
 * is in the statement's OWN qual, not in a subquery. Postgres re-evaluates the
 * qual of an UPDATE against the updated row version after blocking on its lock
 * (EvalPlanQual), so a settlement that commits while this waits leaves this
 * affecting zero rows. A SUBQUERY is what is not re-evaluated, and that is why
 * send, which reads a second row, has to lock and re-check in a later statement.
 */
export async function cancelPaymentRequestCore(
  supabase: SupabaseClient,
  artistId: string,
  requestId: string,
): Promise<PaymentRequestWriteResult> {
  const { data, error } = await supabase
    .from("payment_requests")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("artist_id", artistId)
    .in("status", ARTIST_CANCELLABLE_PAYMENT_REQUEST_STATUSES as string[])
    .select("id");

  if (error) {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't cancel that payment request. Please try again.",
    };
  }
  if (data && data.length > 0) {
    return { ok: true, id: requestId, status: "cancelled" };
  }

  // ZERO ROWS AND NO ERROR is the shape a core mistakes for success. It happens
  // when 0125's UPDATE policy USING clause excludes the row, or when the status
  // filter above does. Both are silent (0125's DELETE policy note: whether a
  // refusal is silent depends on WHICH HALF refused, not on the verb), so the
  // reason is read back rather than guessed.
  const read = await readRequest(supabase, artistId, requestId);
  if (!read.ok) return read;
  if (read.request.status === "cancelled") {
    // Already in the goal state. Cancelling twice is not an error: a double tap
    // on a "cancel request" button is not a mistake worth a message.
    return { ok: true, id: requestId, status: "cancelled" };
  }
  return {
    ok: false,
    code: "settled",
    error:
      "This payment request is already collecting a payment, so it can't be cancelled. Refund it instead once it has gone through.",
  };
}

// ---------------------------------------------------------------------------
// EXPIRE.

/** The statuses expiry may move OUT of. Everything settled, cancelled or
 *  contested is absent, which is what makes expiry unable to resurrect or
 *  overwrite an outcome; and `expired` itself is absent, which is what makes
 *  running it twice a no-op. */
// Exported for the cron fleet sweep (sweepExpiredPaymentRequests), so the
// service-role sweep and the per-artist core can never disagree about what
// expiry may touch.
export const EXPIRABLE_STATUSES: readonly PaymentRequestStatus[] = [
  "sent",
  "viewed",
  "failed",
];

/**
 * Expire every payment request of this artist whose link has run out.
 *
 * IDEMPOTENT: the second run matches nothing, because `expired` is not in
 * `EXPIRABLE_STATUSES`. It cannot RESURRECT anything: `paid`, `cancelled`,
 * `refunded`, `partially_paid`, `partially_refunded`, `disputed` and
 * `payment_processing` are all outside that set, so a settled or withdrawn
 * request is never touched, and 0125's UPDATE policy excludes most of them
 * again underneath.
 *
 * NO ENTITLEMENT GATE, for a stronger version of cancel's reason: expiry is a
 * safety property of a link, it runs unattended, and a paused capability or a
 * lapsed plan must not leave payable links alive indefinitely.
 *
 * Takes the client, so the artist's own session can expire lazily when a page
 * loads AND a service-role sweep can run the same rule. One implementation
 * either way.
 *
 * The cutoff is the CALLER'S clock rather than the database's, because
 * PostgREST filters cannot call `now()`. On a window measured in days, seconds
 * of skew are immaterial; if that ever stops being true, this becomes an RPC.
 */
export async function expirePaymentRequestsCore(
  supabase: SupabaseClient,
  artistId: string,
  options: { requestId?: string; now?: Date } = {},
): Promise<PaymentRequestExpiryResult> {
  const cutoff = (options.now ?? new Date()).toISOString();

  let query = supabase
    .from("payment_requests")
    .update({ status: "expired", updated_at: cutoff })
    .eq("artist_id", artistId)
    .in("status", EXPIRABLE_STATUSES as string[])
    .not("expires_at", "is", null)
    .lte("expires_at", cutoff);
  if (options.requestId) query = query.eq("id", options.requestId);

  const { data, error } = await query.select("id");
  if (error) {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't expire those payment requests. Please try again.",
    };
  }
  return { ok: true, expiredIds: (data ?? []).map((r) => r.id as string) };
}

/** One request, same rule. Returns `ok` with an empty list when it was not due,
 *  which is the honest answer: nothing was wrong and nothing changed. */
export async function expirePaymentRequestCore(
  supabase: SupabaseClient,
  artistId: string,
  requestId: string,
  now?: Date,
): Promise<PaymentRequestExpiryResult> {
  return expirePaymentRequestsCore(supabase, artistId, { requestId, now });
}
