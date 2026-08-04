import { describe, it, expect } from "vitest";
import {
  ORDER_WITH_OBLIGATION_LABEL,
  orderWithObligationButtonLabel,
  addonPayButtonLabel,
  CUSTOM_MADE_ROW_MARKER,
  customMadeRowSuffix,
  sellerDataComplete,
  sellerDisclosureBlock,
  returnRightNotice,
  CUSTOM_MADE_NOTICE,
  RECEIPT_DURABLE_CLOSING_LINE,
  summarizeReturnDisclosure,
  shopEmptyBasketDisclosure,
  SHOP_CATALOGUE_MIXED_NOTICE,
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

  // CORRECTED 2026-08-02 (counsel Q6 implementation). This previously read
  // "appends the model withdrawal form reference ONLY when a link is given"
  // and asserted the clause disappears without one. That is not counsel's
  // text: C1.2 is one sentence, "...before the period ends; you may use the
  // model withdrawal form [link/attached]. Send the goods back...", and only
  // the BRACKET is optional. Because no receipt send site ever passed an
  // href, the old behaviour deleted counsel's clause from every receipt and
  // left "...before the period ends; Send the goods back...". The clause is
  // unconditional now; the bracket varies.
  it("always carries counsel's model-form clause, and fills the bracket from whichever pointer the surface has", () => {
    const withLink = returnRightNotice({
      sellerContact: SELLER.contact,
      supportEmail: SUPPORT_EMAIL,
      withdrawalFormHref: "https://inkl.ee/mika/shop/withdrawal-form",
    });
    expect(withLink).toContain(
      "you may use the model withdrawal form (https://inkl.ee/mika/shop/withdrawal-form).",
    );

    // A durable record reproduces the form instead of linking it (Q6), and
    // this reference wins over an href if a caller supplies both.
    const reproduced = returnRightNotice({
      sellerContact: SELLER.contact,
      supportEmail: SUPPORT_EMAIL,
      withdrawalFormHref: "https://inkl.ee/mika/shop/withdrawal-form",
      withdrawalFormRef: "reproduced below",
    });
    expect(reproduced).toContain(
      "you may use the model withdrawal form (reproduced below).",
    );
    expect(reproduced).not.toContain("https://");

    // With no pointer at all the clause still stands as counsel wrote it, and
    // the semicolon still governs something.
    const bare = returnRightNotice({
      sellerContact: SELLER.contact,
      supportEmail: SUPPORT_EMAIL,
    });
    expect(bare).toContain(
      "before the period ends; you may use the model withdrawal form. Send the goods back",
    );
    expect(bare).not.toContain("period ends; Send the goods back");
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

describe("shopEmptyBasketDisclosure (R5 Q1 (c): empty basket describes the catalogue)", () => {
  const RETURN = "RETURN-NOTICE-STANDIN";

  it("an all-custom shop shows the custom-made notice, NOT a return promise", () => {
    // The whole point of the ruling: an all-custom shop must not
    // headline-promise a 14-day return on an empty basket.
    const out = shopEmptyBasketDisclosure("all_custom_made", RETURN);
    expect(out).toEqual([CUSTOM_MADE_NOTICE]);
    expect(out).not.toContain(RETURN);
  });

  it("a fully-returnable shop shows the standard return notice", () => {
    expect(shopEmptyBasketDisclosure("all_returnable", RETURN)).toEqual([
      RETURN,
    ]);
  });

  it("a mixed shop shows the shop-level mixed notice, not the basket-mixed line", () => {
    const out = shopEmptyBasketDisclosure("mixed", RETURN);
    expect(out).toEqual([SHOP_CATALOGUE_MIXED_NOTICE]);
    // It must talk about the SHOP, not "your order" (which is empty here).
    expect(out[0]).toContain("in this shop");
    expect(out[0]).not.toContain("your order");
  });

  it("an empty catalogue promises nothing (nothing is on sale to return)", () => {
    expect(shopEmptyBasketDisclosure("empty", RETURN)).toEqual([]);
  });

  it("the shop-level mixed notice carries counsel's words and no em-dash (house copy rule)", () => {
    expect(SHOP_CATALOGUE_MIXED_NOTICE).toBe(
      "Some items in this shop are custom-made and cannot be returned. The 14-day right of return applies to all other items. Details at checkout.",
    );
    expect(SHOP_CATALOGUE_MIXED_NOTICE).not.toContain("—");
  });
});

describe("ORDER_WITH_OBLIGATION_LABEL", () => {
  it("is the exact Art. 8(2) button phrase counsel specified", () => {
    expect(ORDER_WITH_OBLIGATION_LABEL).toBe("Order with obligation to pay");
  });
});

// Counsel Q4 (2026-08-02). Two payable surfaces sell the same catalogue. The
// standalone shop carried the approved label; the appointment add-on lane
// carried "Pay deposit and selected items". Counsel: standardise on the
// approved label WITH the total on both.
describe("orderWithObligationButtonLabel (Q4)", () => {
  it("leads with the approved phrase and carries the total and the detail", () => {
    expect(
      orderWithObligationButtonLabel({
        totalLabel: "EUR 25.00",
        detail: "to Mika Ink",
      }),
    ).toBe("Order with obligation to pay EUR 25.00 to Mika Ink");
  });

  it("reproduces the standalone shop's pre-Q4 button string byte-exactly", () => {
    // Regression pin: the standalone shop's PayInner used to build this
    // inline. Moving it into the shared module must not have changed a single
    // character of what a buyer reads there — the point of Q4 is that the
    // OTHER surface moves, not this one.
    const artistName = "Mika Ink";
    const inlineBefore = `${ORDER_WITH_OBLIGATION_LABEL} EUR 25.00 to ${artistName}`;
    expect(
      orderWithObligationButtonLabel({
        totalLabel: "EUR 25.00",
        detail: `to ${artistName}`,
      }),
    ).toBe(inlineBefore);
  });

  it("DISTINCTION: omits the detail cleanly rather than leaving a dangling separator", () => {
    // A builder that always appended a separator would emit a trailing space
    // (or a stray "for") on a caller that has no detail to give. This is the
    // legitimate case that must keep working.
    expect(orderWithObligationButtonLabel({ totalLabel: "EUR 25.00" })).toBe(
      "Order with obligation to pay EUR 25.00",
    );
    expect(
      orderWithObligationButtonLabel({ totalLabel: "EUR 25.00", detail: "  " }),
    ).toBe("Order with obligation to pay EUR 25.00");
    expect(
      orderWithObligationButtonLabel({ totalLabel: "EUR 25.00", detail: null }),
    ).toBe("Order with obligation to pay EUR 25.00");
  });

  it("has no em-dash, despite counsel's example using one as a separator", () => {
    // Counsel's illustration was "Order with obligation to pay - [total]:
    // deposit and selected items". The separator is not part of the approved
    // wording, and the house copy rule forbids em-dashes in user-visible
    // strings.
    expect(
      orderWithObligationButtonLabel({
        totalLabel: "EUR 25.00",
        detail: "to Mika Ink",
      }),
    ).not.toContain("—");
  });
});

describe("addonPayButtonLabel (Q4)", () => {
  it("carries the Art. 8(2) label, the total, and what the total covers once goods are selected", () => {
    const label = addonPayButtonLabel({
      hasGoodsLines: true,
      totalLabel: "EUR 125.00",
    });
    expect(label).toBe(
      "Order with obligation to pay EUR 125.00 for the deposit and selected items",
    );
    expect(label.startsWith(ORDER_WITH_OBLIGATION_LABEL)).toBe(true);
  });

  it("no longer reads 'Pay deposit and selected items' — the string counsel refused to spend risk on", () => {
    expect(
      addonPayButtonLabel({ hasGoodsLines: true, totalLabel: "EUR 125.00" }),
    ).not.toBe("Pay deposit and selected items");
  });

  it("DISTINCTION: a deposit-only basket keeps the unchanged service-deposit label", () => {
    // The control. A label function that emitted the obligation wording
    // unconditionally would pass every assertion above while relabelling a
    // deposit-only payment as a goods order — the same over-broad-guard
    // failure `addonGoodsSellerGate` is scoped against. Counsel's answer is
    // about a contract that INCLUDES GOODS; a deposit-only basket sells none.
    expect(
      addonPayButtonLabel({ hasGoodsLines: false, totalLabel: "EUR 50.00" }),
    ).toBe("Pay deposit");
  });

  it("agrees with the standalone shop's builder on the label and the total, differing only in the detail", () => {
    const addon = addonPayButtonLabel({
      hasGoodsLines: true,
      totalLabel: "EUR 125.00",
    });
    const standalone = orderWithObligationButtonLabel({
      totalLabel: "EUR 125.00",
      detail: "to Mika Ink",
    });
    const head = `${ORDER_WITH_OBLIGATION_LABEL} EUR 125.00`;
    expect(addon.startsWith(head)).toBe(true);
    expect(standalone.startsWith(head)).toBe(true);
  });
});

describe("customMadeRowSuffix (Q4 per-row markers)", () => {
  it("marks a custom-made row", () => {
    expect(customMadeRowSuffix(true)).toBe(" · custom-made, no returns");
    expect(customMadeRowSuffix(true)).toContain(CUSTOM_MADE_ROW_MARKER);
  });

  it("DISTINCTION: a returnable row gets no marker at all", () => {
    // The control. A marker applied to every row would satisfy "the
    // custom-made row is marked" while telling a buyer that returnable goods
    // are non-returnable — a worse misstatement than the aggregate wording it
    // replaces, and it would make a mixed basket unreadable.
    expect(customMadeRowSuffix(false)).toBe("");
  });

  it("reproduces the standalone shop's pre-Q4 inline literal byte-exactly", () => {
    // shop-checkout.tsx carried this literal three times (bundle row, product
    // row, cart line). Extracting it must not change what those rows read.
    expect(customMadeRowSuffix(true)).toBe(" · custom-made, no returns");
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
      // Counsel §7.2 condition 1: the per-line claim is what earns the
      // exempt treatment, so the fixture has to carry it. It previously
      // relied on the order-level summary alone, which is the mis-flagged
      // shape the ruling now refuses.
      items: [{ title: "Print", quantity: 2, customMade: true }],
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

  it("Q4: marks the custom-made line and ONLY that line in a mixed order", () => {
    // The distinction and the failure mode in one case. Before this, the
    // receipt said "Some items in your order are custom-made" over an
    // unmarked list, which is the blanket claim counsel prohibited; marking
    // every line would be the opposite misstatement.
    const body = buildOrderReceiptBody({
      ...base,
      items: [
        { title: "Print", quantity: 1, customMade: false },
        { title: "Portrait commission", quantity: 1, customMade: true },
      ],
      disclosure: "mixed",
    });
    expect(body).toContain(
      "- Portrait commission x 1 · custom-made, no returns",
    );
    expect(body).toContain("- Print x 1\n");
    expect(body).not.toContain("- Print x 1 · custom-made, no returns");
  });

  it("Q4: the marker survives the variant suffix rather than replacing it", () => {
    const body = buildOrderReceiptBody({
      ...base,
      items: [{ title: "Tee", variant: "M", quantity: 2, customMade: true }],
      disclosure: "all_custom_made",
    });
    expect(body).toContain("- Tee (M) x 2 · custom-made, no returns");
  });

  it("Q4: omitting customMade leaves the line byte-identical to before the field existed", () => {
    const withoutField = buildOrderReceiptBody({
      ...base,
      items: [{ title: "Print", quantity: 2 }],
      disclosure: "all_returnable",
    });
    const explicitlyFalse = buildOrderReceiptBody({
      ...base,
      items: [{ title: "Print", quantity: 2, customMade: false }],
      disclosure: "all_returnable",
    });
    expect(withoutField).toBe(explicitlyFalse);
    expect(withoutField).toContain("- Print x 2");
    expect(withoutField).not.toContain(CUSTOM_MADE_ROW_MARKER);
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
