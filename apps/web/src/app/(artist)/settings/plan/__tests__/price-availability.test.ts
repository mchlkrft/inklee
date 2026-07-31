import { describe, it, expect } from "vitest";
import { isPlusPriceUnavailable } from "../price-availability";

// BILL-UI-003 (ruling 16): no displayed authoritative price -> the order is
// blocked. This pins the decision that gates the obligation-to-pay button.
describe("isPlusPriceUnavailable", () => {
  it("blocks the consumer monthly order when the monthly price did not resolve", () => {
    expect(
      isPlusPriceUnavailable({
        businessTier: false,
        yearlyChosen: false,
        priceLabel: null,
        yearlyBaseLabel: null,
      }),
    ).toBe(true);
  });

  it("allows the order once the monthly price is on screen", () => {
    expect(
      isPlusPriceUnavailable({
        businessTier: false,
        yearlyChosen: false,
        priceLabel: "3.00 EUR per month",
        yearlyBaseLabel: null,
      }),
    ).toBe(false);
  });

  it("keys on the CHOSEN interval: yearly with a resolved base is orderable even if monthly is null", () => {
    expect(
      isPlusPriceUnavailable({
        businessTier: false,
        yearlyChosen: true,
        priceLabel: null,
        yearlyBaseLabel: "30.00 EUR per year",
      }),
    ).toBe(false);
  });

  it("blocks a yearly order if the yearly base did not resolve", () => {
    expect(
      isPlusPriceUnavailable({
        businessTier: false,
        yearlyChosen: true,
        priceLabel: "3.00 EUR per month",
        yearlyBaseLabel: null,
      }),
    ).toBe(true);
  });

  it("never blocks the (dormant) business tier here: its gate is the declaration, not this price", () => {
    expect(
      isPlusPriceUnavailable({
        businessTier: true,
        yearlyChosen: false,
        priceLabel: null,
        yearlyBaseLabel: null,
      }),
    ).toBe(false);
  });
});
