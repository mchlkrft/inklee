import { describe, it, expect } from "vitest";
import {
  ORDER_WITH_OBLIGATION_LABEL,
  sellerDataComplete,
  sellerDisclosureBlock,
  returnRightNotice,
  CUSTOM_MADE_NOTICE,
  RECEIPT_DURABLE_CLOSING_LINE,
  summarizeReturnDisclosure,
  buildOrderReceiptBody,
  addonGoodsSellerGate,
  addonCheckoutDisclosureSections,
} from "@inklee/shared/consumer-disclosures";

const SELLER = {
  tradingName: "Mika Ink Studio",
  address: "12 Ink Street, Berlin, Germany",
  contact: "mika@example.com",
};
const SUPPORT_EMAIL = "support@inklee.app";

describe("sellerDataComplete", () => {
  it("is false when any of the three fields is missing, blank, or whitespace-only", () => {
    expect(
      sellerDataComplete({ tradingName: null, address: null, contact: null }),
    ).toBe(false);
    expect(sellerDataComplete({ ...SELLER, tradingName: "  " })).toBe(false);
    expect(sellerDataComplete({ ...SELLER, address: null })).toBe(false);
    expect(sellerDataComplete({ ...SELLER, contact: "" })).toBe(false);
  });

  it("is true only when all three fields are present and non-blank", () => {
    expect(sellerDataComplete(SELLER)).toBe(true);
  });
});

describe("sellerDisclosureBlock", () => {
  it("renders the artist's real seller data into the verbatim C1.1 block", () => {
    const block = sellerDisclosureBlock(SELLER, {
      supportEmail: SUPPORT_EMAIL,
    });
    expect(block).toContain(
      "Sold by Mika Ink Studio, 12 Ink Street, Berlin, Germany.",
    );
    expect(block).toContain(
      "Inklee hosts this shop and processes the payment on the artist's behalf.",
    );
    expect(block).toContain("Your purchase contract is with the artist.");
    expect(block).toContain(
      "Pickup or delivery is arranged with the artist directly.",
    );
    expect(block).toContain("You have a 14-day right of return (see below).");
    expect(block).toContain('Items marked "custom-made" cannot be returned.');
    expect(block).toContain(
      "Questions or complaints: contact the artist at mika@example.com; if unresolved, contact Inklee at support@inklee.app.",
    );
  });

  it("has no em-dash (house copy rule N/A here — counsel's wording wins, but it happens to already comply)", () => {
    const block = sellerDisclosureBlock(SELLER, {
      supportEmail: SUPPORT_EMAIL,
    });
    expect(block).not.toContain("—");
  });
});

describe("returnRightNotice", () => {
  it("renders the verbatim 14-day return notice with the seller contact and support email", () => {
    const notice = returnRightNotice({
      sellerContact: SELLER.contact,
      supportEmail: SUPPORT_EMAIL,
    });
    expect(notice).toContain("Right of return.");
    expect(notice).toContain(
      "within 14 days of the day you (or someone you nominate) receive the goods",
    );
    expect(notice).toContain(
      `tell the artist (${SELLER.contact}) or Inklee (${SUPPORT_EMAIL})`,
    );
    expect(notice).toContain(
      "You bear the direct cost of returning the goods.",
    );
    expect(notice).toContain("within 14 days of your withdrawal");
  });

  it("appends the model withdrawal form reference only when a link is given", () => {
    const withLink = returnRightNotice({
      sellerContact: SELLER.contact,
      supportEmail: SUPPORT_EMAIL,
      withdrawalFormHref: "https://inkl.ee/mika/shop/withdrawal-form",
    });
    expect(withLink).toContain("model withdrawal form");
    expect(withLink).toContain("https://inkl.ee/mika/shop/withdrawal-form");

    const withoutLink = returnRightNotice({
      sellerContact: SELLER.contact,
      supportEmail: SUPPORT_EMAIL,
    });
    expect(withoutLink).not.toContain("model withdrawal form");
  });
});

describe("summarizeReturnDisclosure", () => {
  it("reports all_returnable when every item is not custom-made", () => {
    expect(
      summarizeReturnDisclosure([{ customMade: false }, { customMade: false }]),
    ).toBe("all_returnable");
  });

  it("reports all_custom_made when every item is flagged", () => {
    expect(
      summarizeReturnDisclosure([{ customMade: true }, { customMade: true }]),
    ).toBe("all_custom_made");
  });

  it("reports mixed for a cart combining both — the named failure mode", () => {
    expect(
      summarizeReturnDisclosure([{ customMade: true }, { customMade: false }]),
    ).toBe("mixed");
  });

  it("reports empty for no items, without throwing", () => {
    expect(summarizeReturnDisclosure([])).toBe("empty");
  });
});

describe("ORDER_WITH_OBLIGATION_LABEL", () => {
  it("is the exact Art. 8(2) button phrase counsel specified", () => {
    expect(ORDER_WITH_OBLIGATION_LABEL).toBe("Order with obligation to pay");
  });
});

describe("buildOrderReceiptBody", () => {
  const base = {
    artistName: "Mika Ink",
    seller: SELLER,
    supportEmail: SUPPORT_EMAIL,
    items: [{ title: "Print", quantity: 2 }],
    totalLabel: "60.00 EUR",
  };

  it("contains every C1.3-required element for a normal (returnable) order", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
    });
    // Seller block (identity + address + complaint route)
    expect(body).toContain(
      "Sold by Mika Ink Studio, 12 Ink Street, Berlin, Germany.",
    );
    expect(body).toContain("Questions or complaints:");
    // Items, prices, total
    expect(body).toContain("- Print x 2");
    expect(body).toContain("Total paid: 60.00 EUR.");
    // Delivery arrangement (folded into the seller block, not duplicated)
    expect(body).toContain(
      "Pickup or delivery is arranged with the artist directly.",
    );
    // Return notice
    expect(body).toContain("Right of return.");
    expect(body).not.toContain(CUSTOM_MADE_NOTICE);
    // Closing durable-medium line
    expect(body.trim().endsWith(RECEIPT_DURABLE_CLOSING_LINE)).toBe(true);
  });

  it("shows the custom-made claim instead of the return notice when every item is flagged", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "all_custom_made",
    });
    expect(body).toContain(CUSTOM_MADE_NOTICE);
    expect(body).not.toContain("Right of return.");
  });

  it("shows BOTH notices for a mixed order — the named cross-cutting failure mode", () => {
    const body = buildOrderReceiptBody({ ...base, disclosure: "mixed" });
    expect(body).toContain(CUSTOM_MADE_NOTICE);
    expect(body).toContain("Right of return.");
  });

  it("preserves the pre-existing '- Title (Variant) x Qty' line format for bundle lines", () => {
    const body = buildOrderReceiptBody({
      ...base,
      items: [{ title: "Starter kit", quantity: 2 }],
      disclosure: "all_returnable",
    });
    expect(body).toContain("- Starter kit x 2");
  });

  it("includes a variant name in parentheses when present", () => {
    const body = buildOrderReceiptBody({
      ...base,
      items: [{ title: "Tee", variant: "M", quantity: 1 }],
      disclosure: "all_returnable",
    });
    expect(body).toContain("- Tee (M) x 1");
  });

  it("appends the applicable terms text when supplied", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
      termsSection:
        "Terms of Service (version 2026-07-24):\n\nSome terms text.",
    });
    expect(body).toContain("Terms of Service (version 2026-07-24):");
    expect(body).toContain("Some terms text.");
    // The closing line still comes last, after the terms text.
    expect(body.trim().endsWith(RECEIPT_DURABLE_CLOSING_LINE)).toBe(true);
  });

  it("never throws and still closes on the durable-medium line when terms are unavailable", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
      termsSection: null,
    });
    expect(body.trim().endsWith(RECEIPT_DURABLE_CLOSING_LINE)).toBe(true);
  });

  it("omits the fulfillment note by default (byte-identical to before the option existed)", () => {
    const withoutNote = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
    });
    expect(withoutNote).not.toContain("waiting for you");
  });

  it("inserts the fulfillment note, right after the total, when supplied (GOODS-DISC-001)", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
      fulfillmentNote:
        "Your goods will be waiting for you at your appointment.",
    });
    expect(body).toContain(
      "Your goods will be waiting for you at your appointment.",
    );
    // Ordering: after the total, before the return notice.
    const totalIdx = body.indexOf("Total paid:");
    const noteIdx = body.indexOf("waiting for you");
    const noticeIdx = body.indexOf("Right of return.");
    expect(totalIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(totalIdx);
    expect(noticeIdx).toBeGreaterThan(noteIdx);
  });
});

describe("addonGoodsSellerGate", () => {
  it("never blocks a deposit-only checkout, even with no seller data at all", () => {
    expect(
      addonGoodsSellerGate({
        hasGoodsLines: false,
        seller: { tradingName: null, address: null, contact: null },
      }),
    ).toEqual({ ok: true });
  });

  it("blocks goods lines when the artist's seller data is incomplete", () => {
    expect(
      addonGoodsSellerGate({
        hasGoodsLines: true,
        seller: { tradingName: null, address: null, contact: null },
      }),
    ).toEqual({ ok: false, reason: "seller_data_incomplete" });
  });

  it("allows goods lines once seller data is complete", () => {
    expect(
      addonGoodsSellerGate({ hasGoodsLines: true, seller: SELLER }),
    ).toEqual({ ok: true });
  });

  it("named failure mode: a gate that ignores hasGoodsLines would wrongly block deposit-only checkouts", () => {
    // If addonGoodsSellerGate ever collapsed to `sellerDataComplete(seller)`
    // alone (dropping the hasGoodsLines branch), this deposit-only case would
    // flip to blocked — the exact regression this test pins.
    const incompleteSeller = {
      tradingName: null,
      address: null,
      contact: null,
    };
    const depositOnly = addonGoodsSellerGate({
      hasGoodsLines: false,
      seller: incompleteSeller,
    });
    const withGoods = addonGoodsSellerGate({
      hasGoodsLines: true,
      seller: incompleteSeller,
    });
    expect(depositOnly.ok).toBe(true);
    expect(withGoods.ok).toBe(false);
  });
});

describe("addonCheckoutDisclosureSections", () => {
  it("returns nothing for an empty selection (deposit-only basket)", () => {
    expect(addonCheckoutDisclosureSections([], SELLER, SUPPORT_EMAIL)).toEqual(
      [],
    );
  });

  it("includes the seller block and the standard return notice for an all-returnable selection", () => {
    const sections = addonCheckoutDisclosureSections(
      [{ customMade: false }],
      SELLER,
      SUPPORT_EMAIL,
    );
    expect(sections[0]).toContain(
      "Sold by Mika Ink Studio, 12 Ink Street, Berlin, Germany.",
    );
    expect(sections.join("\n")).toContain("Right of return.");
    expect(sections.join("\n")).not.toContain(CUSTOM_MADE_NOTICE);
  });

  it("shows the custom-made exemption instead of the return notice when everything selected is flagged", () => {
    const sections = addonCheckoutDisclosureSections(
      [{ customMade: true }],
      SELLER,
      SUPPORT_EMAIL,
    );
    expect(sections.join("\n")).toContain(CUSTOM_MADE_NOTICE);
    expect(sections.join("\n")).not.toContain("Right of return.");
  });

  it("shows BOTH notices for a mixed selection — the named cross-cutting failure mode", () => {
    const sections = addonCheckoutDisclosureSections(
      [{ customMade: true }, { customMade: false }],
      SELLER,
      SUPPORT_EMAIL,
    );
    const joined = sections.join("\n");
    expect(joined).toContain(CUSTOM_MADE_NOTICE);
    expect(joined).toContain("Right of return.");
  });
});
