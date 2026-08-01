import { describe, it, expect } from "vitest";
import { goodsDestinationAvailability } from "../goods-visibility";
import { parseBioPageSettings } from "../bio-page-settings";

// FD8 (founder ruling, 2026-08-01): the two ANDs the goods block's editor
// warning, the public render, and the FD7 /goods summary must all agree on.

describe("goodsDestinationAvailability", () => {
  it("standalone_shop is available by default (shop_checkout defaults on)", () => {
    const bioPage = parseBioPageSettings({});
    const result = goodsDestinationAvailability({}, bioPage);
    expect(result.standalone_shop).toBe(true);
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
    );
    expect(result.booking_page).toBe(false);
    expect(result.standalone_shop).toBe(true);
  });
});
