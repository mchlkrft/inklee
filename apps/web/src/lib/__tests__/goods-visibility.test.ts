import { describe, it, expect } from "vitest";
import { goodsDestinationAvailability } from "../goods-visibility";
import { parseBioPageSettings } from "../bio-page-settings";

// FD8 (founder ruling, 2026-08-01): the two ANDs the goods block's editor
// warning, the public render, and the FD7 /goods summary must all agree on.

describe("goodsDestinationAvailability", () => {
  it("standalone_shop is available by default ONCE the park switch is on (shop_checkout defaults on)", () => {
    const bioPage = parseBioPageSettings({});
    const result = goodsDestinationAvailability({}, bioPage, true);
    expect(result.standalone_shop).toBe(true);
  });

  it("standalone_shop is UNAVAILABLE while the platform park switch is off, whatever the artist set", () => {
    // Supervisor fix on the FD8 slice (gap found by the implementing worker):
    // the standalone route calls notFound() while GOODS_COMMERCE_ENABLED is
    // off, so calling the destination "available" would link every visitor to
    // a 404 — and since a NEW block defaults to standalone_shop, that would be
    // the DEFAULT state, with no editor warning, for as long as the flag stays
    // dark. Fails if the park switch is dropped from the formula.
    const bioPage = parseBioPageSettings({});
    expect(
      goodsDestinationAvailability(
        { features: { shop_checkout: true } },
        bioPage,
        false,
      ).standalone_shop,
    ).toBe(false);
  });

  it("standalone_shop is unavailable when the artist's toggle is off", () => {
    const bioPage = parseBioPageSettings({});
    const result = goodsDestinationAvailability(
      { features: { shop_checkout: false } },
      bioPage,
    );
    expect(result.standalone_shop).toBe(false);
  });

  it("standalone_shop is unavailable when the whole goods module is off, toggle aside", () => {
    const bioPage = parseBioPageSettings({});
    const result = goodsDestinationAvailability(
      { features: { goods_module: false, shop_checkout: true } },
      bioPage,
    );
    expect(result.standalone_shop).toBe(false);
  });

  it("booking_page is available by default (goods module on, shop teaser not hidden)", () => {
    const bioPage = parseBioPageSettings({});
    const result = goodsDestinationAvailability({}, bioPage);
    expect(result.booking_page).toBe(true);
  });

  it("booking_page is unavailable when the shop teaser is hidden, goods module on", () => {
    const bioPage = parseBioPageSettings({ hidden: ["shop"] });
    const result = goodsDestinationAvailability(
      { features: { goods_module: true } },
      bioPage,
    );
    expect(result.booking_page).toBe(false);
  });

  it("booking_page is unavailable when the goods module is off, teaser visibility aside", () => {
    const bioPage = parseBioPageSettings({});
    const result = goodsDestinationAvailability(
      { features: { goods_module: false } },
      bioPage,
    );
    expect(result.booking_page).toBe(false);
  });

  it("the two destinations are independent (one off does not affect the other)", () => {
    const bioPage = parseBioPageSettings({ hidden: ["shop"] });
    const result = goodsDestinationAvailability(
      { features: { shop_checkout: true } },
      bioPage,
      true,
    );
    expect(result.booking_page).toBe(false);
    expect(result.standalone_shop).toBe(true);
  });

  it("the park switch bounds ONLY standalone_shop, never the booking page", () => {
    // The booking-page teaser is served by the artist page, which the park
    // switch does not gate. Fails if a future change hangs both destinations
    // off one platform flag.
    const bioPage = parseBioPageSettings({});
    const result = goodsDestinationAvailability({}, bioPage, false);
    expect(result.standalone_shop).toBe(false);
    expect(result.booking_page).toBe(true);
  });
});
