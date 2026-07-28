// Discount codes (Plus build P5b).
//
// Pure evaluation: given a code's stored terms and a goods subtotal, decide
// whether it applies and by how much. Every caller (the public checkout, the
// artist's editor preview, the tests) runs this same function, so a code can
// never mean one thing in the basket and another at the till.
//
// Ordered first among the goods tools because the approved goods fee applies
// to the subtotal AFTER discounts. The fee base is not correct until this
// exists, which is why fee schedule v2 could not activate before it.

export const DISCOUNT_KINDS = ["percent", "fixed"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export const DISCOUNT_CODE_MIN = 3;
export const DISCOUNT_CODE_MAX = 24;
/** Letters and digits only. No dashes or spaces: a client reading a code off a
 *  story and typing it on a phone should not have to reproduce punctuation. */
const CODE_RE = /^[A-Z0-9]+$/;

export type DiscountCode = {
  id: string;
  code: string;
  kind: DiscountKind;
  /** Basis points for percent (1000 = 10%), minor units for fixed. */
  value: number;
  currency: string;
  minSubtotalMinor: number;
  maxRedemptions: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

/** Normalize to the stored form. Uppercased and stripped of the spaces people
 *  paste in, because case is never the difference between a working code and a
 *  rejected one. */
export function normalizeDiscountCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function validateDiscountCode(code: string): string | null {
  if (code.length < DISCOUNT_CODE_MIN) return "Use at least 3 characters.";
  if (code.length > DISCOUNT_CODE_MAX) return "Use at most 24 characters.";
  if (!CODE_RE.test(code)) return "Use letters and numbers only.";
  return null;
}

export type DiscountRejection =
  | "unknown"
  | "inactive"
  | "not_started"
  | "expired"
  | "used_up"
  | "below_minimum"
  | "currency_mismatch";

export type DiscountResult =
  | { ok: true; discountMinor: number }
  | { ok: false; reason: DiscountRejection };

/**
 * Evaluate a code against a goods subtotal.
 *
 * `subtotalMinor` is GOODS ONLY. A discount must never reach the deposit: that
 * is tattoo-service value the artist quoted, and a client applying a shop code
 * to it would be reducing the artist's own fee.
 *
 * `nowMs` and `redemptionsUsed` are passed in rather than read here, so this
 * stays pure and the caller owns both the clock and the count that only the
 * database can answer authoritatively.
 */
export function evaluateDiscount(input: {
  code: DiscountCode | null;
  subtotalMinor: number;
  currency: string;
  nowMs: number;
  redemptionsUsed: number;
}): DiscountResult {
  const c = input.code;
  if (!c) return { ok: false, reason: "unknown" };
  if (!c.active) return { ok: false, reason: "inactive" };

  if (c.currency.toLowerCase() !== input.currency.toLowerCase()) {
    // A EUR code against a CZK basket has no meaningful conversion, and
    // guessing one would silently change the amount taken off.
    return { ok: false, reason: "currency_mismatch" };
  }

  if (c.startsAt && input.nowMs < Date.parse(c.startsAt)) {
    return { ok: false, reason: "not_started" };
  }
  if (c.endsAt && input.nowMs >= Date.parse(c.endsAt)) {
    return { ok: false, reason: "expired" };
  }
  if (c.maxRedemptions !== null && input.redemptionsUsed >= c.maxRedemptions) {
    return { ok: false, reason: "used_up" };
  }

  const subtotal = Math.max(0, Math.trunc(input.subtotalMinor || 0));
  if (subtotal < c.minSubtotalMinor) {
    return { ok: false, reason: "below_minimum" };
  }
  if (subtotal === 0) return { ok: true, discountMinor: 0 };

  const raw =
    c.kind === "percent"
      ? Math.round((subtotal * c.value) / 10000)
      : Math.trunc(c.value);

  // Never more than the goods are worth. A fixed EUR 50 code on a EUR 30
  // basket takes off 30, not 50: the alternative is a negative subtotal, which
  // would become a negative payable amount and a negative fee base.
  return { ok: true, discountMinor: Math.min(subtotal, Math.max(0, raw)) };
}

/** Artist-facing explanation of a rejection. Client-facing copy deliberately
 *  says less (see `clientRejectionMessage`): a stranger at a checkout should
 *  not learn that a code exists but is used up. */
export const DISCOUNT_REJECTION_LABELS: Record<DiscountRejection, string> = {
  unknown: "No code with that name.",
  inactive: "That code is switched off.",
  not_started: "That code has not started yet.",
  expired: "That code has expired.",
  used_up: "That code has been used the maximum number of times.",
  below_minimum: "The order is below this code's minimum.",
  currency_mismatch: "That code is for a different currency.",
};

/**
 * What the CLIENT is told.
 *
 * Deliberately collapses every "the code exists but you cannot use it" case
 * into one message, except the minimum, which is the only one they can act on.
 * Distinguishing expired from used-up from switched-off tells someone probing
 * codes which strings are real.
 */
export function clientRejectionMessage(reason: DiscountRejection): string {
  if (reason === "below_minimum") {
    return "Your order is below the minimum for that code.";
  }
  return "That code isn't valid for this order.";
}

/** Short human label for a code's terms, e.g. "10% off" or "5.00 off". */
export function discountLabel(
  code: Pick<DiscountCode, "kind" | "value">,
  formatMinor: (minor: number) => string,
): string {
  return code.kind === "percent"
    ? `${code.value / 100}% off`
    : `${formatMinor(code.value)} off`;
}
