import "server-only";

// C1.8 — the buyer-facing PARTIAL-refund notice, counsel's wording VERBATIM
// (docs/legal/counsel-accountant-handoff-2026-08.md Part 4): "We have
// refunded [amount] for [items/lines, or 'part of your order']. The refund
// goes to your original payment method, typically within 5-10 business days.
// The rest of your order is unchanged, and your right of return for the
// remaining items (where it applies) is unaffected." Shared by BOTH refund
// lanes (appointment-payment-delivery.ts, goods-order-refund.ts) because
// counsel's wording is lane-agnostic and both cores already compute the same
// two facts this decision needs: how much money moved, and whether anything
// is left on the underlying request/order.
//
// A FULL refund keeps its own pre-existing messaging (per the founder's
// brief: "A full refund already has messaging; this is the partial case") —
// this module governs only when THIS event leaves something behind.

/**
 * "Partial", for this notice's purposes, means "there is a remaining balance
 * after this event" — exactly `remainingRefundableMinor`, which both cores
 * already compute from real allocations. This needs no separate signal from
 * `refundType`: a `full` refund always drains the balance to zero by
 * construction, and a `by_line`/`partial` refund that happens to drain the
 * LAST remaining balance has, at that point, nothing left to call "the rest
 * of your order" — so it is correctly excluded here too, and falls through
 * to the existing full-refund wording instead of claiming an unchanged
 * remainder that does not exist.
 */
export function isPartialRefundForBuyer(remainingAfterMinor: number): boolean {
  return remainingAfterMinor > 0;
}

export type PartialRefundNoticeInput = {
  /** Pre-formatted, e.g. "12.34 EUR". */
  amountLabel: string;
  /** Names of the specific lines this refund covered, when known (a by-line
   *  refund). Empty for a bare custom amount not tied to named lines — the
   *  wording then falls back to counsel's own alternative, verbatim:
   *  "part of your order". */
  lineNames: string[];
  /**
   * "Where the artist retains items or the refund follows a return,
   * reference it ('following your return of [item]')" — counsel, C1.8.
   *
   * NOT WIRED AT EITHER CALL SITE YET. Neither refund core currently records
   * a trustworthy "this event followed a CONFIRMED return" signal: the goods
   * lane's own `restocked` flag fires on every by-line/full refund
   * regardless of whether the buyer ever actually shipped the item back
   * (goods-order-refund.ts restocks unconditionally on refund, not on
   * confirmed receipt), so it is not a safe proxy and this module does not
   * treat it as one. The parameter exists so a real signal (e.g. an
   * artist-supplied "this follows a return" flag at refund time) can be
   * threaded through later without reshaping this function; until then every
   * caller passes null/undefined and this clause never renders.
   */
  followsReturnOf?: string | null;
};

/** Build the verbatim C1.8 paragraph. Pure string assembly — every value is
 *  already resolved by the caller, same discipline as
 *  `consumer-disclosures.ts`'s `buildOrderReceiptBody`. */
export function partialRefundBuyerNotice(
  input: PartialRefundNoticeInput,
): string {
  const covers =
    input.lineNames.length > 0
      ? input.lineNames.join(", ")
      : "part of your order";
  const returnClause = input.followsReturnOf
    ? `, following your return of ${input.followsReturnOf}`
    : "";
  return (
    `We have refunded ${input.amountLabel} for ${covers}${returnClause}. ` +
    "The refund goes to your original payment method, typically within 5-10 business days. " +
    "The rest of your order is unchanged, and your right of return for the remaining items (where it applies) is unaffected."
  );
}
