import { describe, it, expect } from "vitest";
import {
  buildOrderReceiptBody,
  modelWithdrawalFormText,
  modelWithdrawalFormLines,
  withdrawalForwardingNotice,
  CUSTOM_MADE_NOTICE,
  RECEIPT_DURABLE_CLOSING_LINE,
  MODEL_WITHDRAWAL_FORM_HEADING,
} from "@inklee/shared/consumer-disclosures";

// COUNSEL Q6 (2026-08-02): "The model form must be REPRODUCED IN or ATTACHED
// TO the confirmation... A plain-text path reference satisfies neither
// [Art. 6(1)(h) nor Art. 8(7)]." And Q6(b): "A confirmation with no Terms
// text is non-compliant on its face... checkout acceptance of terms on a
// mutable web page does not cure it."
//
// This supersedes the earlier engineering finding that `buildOrderReceiptBody`
// was never passed `withdrawalFormHref`. Wiring the href would have fixed a
// different, weaker requirement. The regression this file guards is therefore
// NOT "the link went missing" but "the reproduction degraded back into a
// reference", which is why the tests assert on the form's whole text and on
// the absence of a URL rather than on a href being present.
//
// COUNSEL Q7 rides along: the reproduced copy must carry the artist's real
// identity and the forwarding-without-delay rule, or naming Inklee as an
// alternative recipient becomes a trap on a 14-day deadline.

const SELLER = {
  tradingName: "Mika Ink Studio",
  address: "12 Ink Street, Berlin, Germany",
  contact: "mika@example.com",
};
const SUPPORT_EMAIL = "support@inklee.app";
const TERMS = "Terms of Service (version 2026-07-24):\n\nClause 1. Be nice.";

const base = {
  artistName: "Mika Ink",
  seller: SELLER,
  supportEmail: SUPPORT_EMAIL,
  items: [{ title: "Print", quantity: 2 }],
  totalLabel: "60.00 EUR",
};

// COUNSEL §7.2 condition 1 (2026-08-02): suppression is earned by the LINES,
// not by the order-level summary. Fixtures that assert the exempt behaviour
// must therefore carry the per-line claim; passing `disclosure:
// "all_custom_made"` over an unflagged line is now the mis-flagged case, and
// it deliberately gets the form.
const exemptBase = {
  ...base,
  items: [{ title: "Commission", quantity: 1, customMade: true }],
};

describe("modelWithdrawalFormText (Q7: the reproduced form itself)", () => {
  it("renders the seller's real identity, never a placeholder", () => {
    const text = modelWithdrawalFormText(SELLER, {
      supportEmail: SUPPORT_EMAIL,
    });
    expect(text).toContain(
      "To: Mika Ink Studio, 12 Ink Street, Berlin, Germany (contact: mika@example.com), or Inklee (support@inklee.app).",
    );
  });

  it("states the forwarding-without-delay rule counsel made a condition of naming Inklee", () => {
    const text = modelWithdrawalFormText(SELLER, {
      supportEmail: SUPPORT_EMAIL,
    });
    expect(text).toContain(
      "A withdrawal sent to Inklee counts as received on the day Inklee receives it, and Inklee passes it to the artist without delay.",
    );
    expect(text).toContain("costs you no time on the 14-day deadline");
  });

  it("carries every Annex I(B) line and its fill-in entry", () => {
    const text = modelWithdrawalFormText(SELLER, {
      supportEmail: SUPPORT_EMAIL,
    });
    for (const line of modelWithdrawalFormLines(SELLER, {
      supportEmail: SUPPORT_EMAIL,
    })) {
      expect(text).toContain(line.text);
      if (line.entry) expect(text).toContain(line.entry);
    }
  });

  it("obeys the house copy rules on a buyer-visible string: no em-dash", () => {
    expect(
      modelWithdrawalFormText(SELLER, { supportEmail: SUPPORT_EMAIL }),
    ).not.toContain("—");
    expect(withdrawalForwardingNotice(SUPPORT_EMAIL)).not.toContain("—");
  });
});

describe("buildOrderReceiptBody — Q6(a): the form is reproduced, not referenced", () => {
  it("carries the ENTIRE model form inside a returnable order's receipt", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
      termsSection: TERMS,
    });
    const form = modelWithdrawalFormText(SELLER, {
      supportEmail: SUPPORT_EMAIL,
    });
    for (const chunk of form.split("\n")) expect(body).toContain(chunk);
  });

  it("does NOT satisfy itself with a path or URL to the form page", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
      termsSection: TERMS,
    });
    // The rejected shape was a path in the return notice. A receipt that
    // reverts to referencing the page reintroduces the exact defect counsel
    // rejected, and would still pass a naive "mentions the form" assertion.
    expect(body).not.toContain("/shop/withdrawal-form");
    expect(body).not.toMatch(/model withdrawal form \(https?:/);
    // Counsel's clause is still there, pointing at the reproduction rather
    // than at a page.
    expect(body).toContain(
      "you may use the model withdrawal form (reproduced below).",
    );
  });

  it("says 'reproduced below' if and only if the form really is below, for every disclosure state", () => {
    // Falsifiable both ways: reproducing the form without the pointer breaks
    // counsel's clause, and pointing at a reproduction that is not there
    // sends the buyer looking for a document the email does not contain.
    for (const disclosure of [
      "all_returnable",
      "mixed",
      "all_custom_made",
      "empty",
    ] as const) {
      const body = buildOrderReceiptBody({
        ...base,
        disclosure,
        termsSection: TERMS,
      });
      const pointsBelow = body.includes("reproduced below");
      const formIsBelow = body.includes("I/we hereby give notice");
      expect({ disclosure, pointsBelow }).toEqual({
        disclosure,
        pointsBelow: formIsBelow,
      });
    }
  });

  it("reproduces the form for a MIXED order too, since some of its items keep the right", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "mixed",
      termsSection: TERMS,
    });
    expect(body).toContain(MODEL_WITHDRAWAL_FORM_HEADING);
    expect(body).toContain("I/we hereby give notice");
    expect(body).toContain(CUSTOM_MADE_NOTICE);
  });

  it("DISTINCTION: omits the form when the whole order is Art. 16(c) exempt, so the receipt does not print a withdrawal template under 'no right of return'", () => {
    const body = buildOrderReceiptBody({
      ...exemptBase,
      disclosure: "all_custom_made",
      termsSection: TERMS,
    });
    expect(body).toContain(CUSTOM_MADE_NOTICE);
    expect(body).not.toContain(MODEL_WITHDRAWAL_FORM_HEADING);
    expect(body).not.toContain("I/we hereby give notice");
    // ... and the Terms are still reproduced. An implementation that dropped
    // the whole document appendix for exempt orders would pass the two
    // assertions above and fail this one.
    expect(body).toContain("Clause 1. Be nice.");
  });
});

describe("buildOrderReceiptBody — Q6(b): the Terms text is reproduced", () => {
  it("carries the supplied Terms text and its version", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
      termsSection: TERMS,
    });
    expect(body).toContain("Terms of Service (version 2026-07-24):");
    expect(body).toContain("Clause 1. Be nice.");
  });

  it("still sends, and still closes correctly, when the Terms cannot be read", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
      termsSection: null,
    });
    // Fail-soft, because a receipt that never arrives is worse. The lead-in
    // must then promise ONLY what is actually in the email.
    expect(body).not.toContain("Terms of Service (version");
    expect(body).toContain("your own copy of the model withdrawal form,");
    expect(body.trim().endsWith(RECEIPT_DURABLE_CLOSING_LINE)).toBe(true);
  });
});

describe("buildOrderReceiptBody — readability of a receipt carrying two documents", () => {
  it("puts both documents AFTER the transaction and the rights notice", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
      termsSection: TERMS,
    });
    const totalIdx = body.indexOf("Total paid:");
    const noticeIdx = body.indexOf("Right of return.");
    const formIdx = body.indexOf(MODEL_WITHDRAWAL_FORM_HEADING);
    const termsIdx = body.indexOf("Terms of Service (version");
    const closingIdx = body.indexOf(RECEIPT_DURABLE_CLOSING_LINE);
    expect(totalIdx).toBeGreaterThan(-1);
    expect(noticeIdx).toBeGreaterThan(totalIdx);
    expect(formIdx).toBeGreaterThan(noticeIdx);
    expect(termsIdx).toBeGreaterThan(formIdx);
    expect(closingIdx).toBeGreaterThan(termsIdx);
  });

  it("announces the appendix once, naming exactly the documents it actually contains", () => {
    const both = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
      termsSection: TERMS,
    });
    expect(both).toContain(
      "Below this line is your own copy of the model withdrawal form and the Terms of Service, reproduced in full so this email is a complete record on its own.",
    );

    // Exempt order: no form, so the lead-in must not promise one.
    const termsOnly = buildOrderReceiptBody({
      ...exemptBase,
      disclosure: "all_custom_made",
      termsSection: TERMS,
    });
    expect(termsOnly).toContain(
      "Below this line is your own copy of the Terms of Service,",
    );
    expect(termsOnly).not.toContain("the model withdrawal form and");
  });

  it("separates the appendix with the same rule the approved Plus E2 confirmation uses", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "all_returnable",
      termsSection: TERMS,
    });
    // Opening rule, one between the two documents, closing rule.
    expect(body.split("\n\n---\n\n").length - 1).toBe(3);
  });

  it("emits no stray rule when there is no appendix at all", () => {
    const body = buildOrderReceiptBody({
      ...exemptBase,
      disclosure: "all_custom_made",
      termsSection: null,
    });
    expect(body).not.toContain("---");
    expect(body).not.toContain("Below this line");
    expect(body.trim().endsWith(RECEIPT_DURABLE_CLOSING_LINE)).toBe(true);
  });

  it("keeps the durable-medium line last, after everything reproduced", () => {
    const body = buildOrderReceiptBody({
      ...base,
      disclosure: "mixed",
      termsSection: TERMS,
    });
    expect(body.trim().endsWith(RECEIPT_DURABLE_CLOSING_LINE)).toBe(true);
  });
});
