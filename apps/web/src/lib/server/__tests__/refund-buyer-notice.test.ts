import { describe, it, expect } from "vitest";
import {
  isPartialRefundForBuyer,
  partialRefundBuyerNotice,
} from "../refund-buyer-notice";

// C1.8 — docs/legal/counsel-accountant-handoff-2026-08.md Part 4. Named
// failure mode for the whole file: if either function stops distinguishing
// "something is left on the order" from "nothing is left", the buyer either
// gets the wrong template or a nonsensical "the rest of your order is
// unchanged" claim when there is no rest.

describe("isPartialRefundForBuyer", () => {
  it("is true whenever a balance remains after the refund", () => {
    expect(isPartialRefundForBuyer(1)).toBe(true);
    expect(isPartialRefundForBuyer(500)).toBe(true);
  });

  it("is false when nothing remains — a full refund, or a by-line/partial refund that drained the balance", () => {
    expect(isPartialRefundForBuyer(0)).toBe(false);
  });

  it("named failure mode: a mutant that returns true for 0 would send the partial notice on every full refund", () => {
    // Pins the exact boundary: not `>= 0`, not `!== 0` (which would also
    // wrongly fire on a negative, impossible but defensively worth pinning).
    expect(isPartialRefundForBuyer(0)).toBe(false);
    expect(isPartialRefundForBuyer(1)).toBe(true);
  });
});

describe("partialRefundBuyerNotice", () => {
  it("contains counsel's verbatim sentence structure", () => {
    const notice = partialRefundBuyerNotice({
      amountLabel: "12.34 EUR",
      lineNames: [],
    });
    expect(notice).toContain("We have refunded 12.34 EUR for");
    expect(notice).toContain(
      "The refund goes to your original payment method, typically within 5-10 business days.",
    );
    expect(notice).toContain("The rest of your order is unchanged");
    expect(notice).toContain(
      "your right of return for the remaining items (where it applies) is unaffected.",
    );
  });

  it("falls back to 'part of your order' when no line names are known (a bare custom amount)", () => {
    const notice = partialRefundBuyerNotice({
      amountLabel: "5.00 EUR",
      lineNames: [],
    });
    expect(notice).toContain("for part of your order.");
  });

  it("names the specific lines when known (a by-line refund) instead of the generic fallback", () => {
    const notice = partialRefundBuyerNotice({
      amountLabel: "20.00 EUR",
      lineNames: ["Print"],
    });
    expect(notice).toContain("for Print.");
    expect(notice).not.toContain("part of your order");
  });

  it("joins multiple named lines with a comma", () => {
    const notice = partialRefundBuyerNotice({
      amountLabel: "30.00 EUR",
      lineNames: ["Print", "Sticker pack"],
    });
    expect(notice).toContain("for Print, Sticker pack.");
  });

  it("has no em-dash (house copy rule)", () => {
    const notice = partialRefundBuyerNotice({
      amountLabel: "12.34 EUR",
      lineNames: ["Print"],
    });
    expect(notice).not.toContain("—");
  });

  it("omits the return-following clause when not supplied", () => {
    const notice = partialRefundBuyerNotice({
      amountLabel: "12.34 EUR",
      lineNames: ["Print"],
    });
    expect(notice).not.toContain("following your return");
  });

  it("appends the return-following clause when supplied", () => {
    const notice = partialRefundBuyerNotice({
      amountLabel: "12.34 EUR",
      lineNames: ["Print"],
      followsReturnOf: "Print",
    });
    expect(notice).toContain("for Print, following your return of Print.");
  });
});
