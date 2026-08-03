import { describe, it, expect } from "vitest";
import {
  buildOrderReceiptBody,
  CUSTOM_MADE_NOTICE,
  CUSTOM_MADE_ROW_MARKER,
  MODEL_WITHDRAWAL_FORM_HEADING,
  RECEIPT_DURABLE_CLOSING_LINE,
} from "@inklee/shared/consumer-disclosures";

// COUNSEL §7.2, docs/legal/counsel-handoff-round-4-2026-08-02.md (2026-08-02).
//
// The carve-out that suppresses the model withdrawal form for an all-custom-made
// order is RATIFIED, on the Art. 6(1)(h)/(k) pairing rather than on the
// Art. 6(1)(h) reading engineering had made for itself: the model-form duty
// applies where a right of withdrawal EXISTS, and where it does not, what is
// owed instead is the 6(1)(k) statement that the consumer will not benefit from
// one. Two conditions ride with the ratification, and this file is the guard on
// both of them:
//
//   1. Suppression triggers ONLY when EVERY line carries a validly disclosed,
//      snapshot-frozen custom-made claim. "Any order with even one standard
//      line gets the form."
//   2. When suppressed, the no-withdrawal statement must be carried
//      PROMINENTLY: "the approved custom-made notice satisfies this if rendered
//      per line and in the summary."
//
// The failure mode counsel names, and the reason condition 1 is strict rather
// than convenient: "if a custom-made claim is ever invalid (mis-flagged,
// undisclosed), the suppressed form compounds the Art. 10 exposure." A missing
// form on an order that turns out to be returnable is worse than a redundant
// form on one that is not, so every ambiguous case here resolves toward the
// form.

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
  totalLabel: "180.00 EUR",
  termsSection: TERMS,
};

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The form is REPRODUCED in the receipt, not linked, so its presence is
 *  detected by its own text rather than by a href (counsel Q6). Both markers
 *  are checked because the heading alone could survive a change that dropped
 *  the form's body. */
function carriesTheForm(body: string): boolean {
  return (
    body.includes(MODEL_WITHDRAWAL_FORM_HEADING) &&
    body.includes("I/we hereby give notice")
  );
}

describe("counsel §7.2 condition 1 — suppression is earned by every line", () => {
  it("suppresses the form when every line carries the custom-made claim", () => {
    const body = buildOrderReceiptBody({
      ...base,
      items: [
        { title: "Portrait commission", quantity: 1, customMade: true },
        {
          title: "Lettering piece",
          variant: "A4",
          quantity: 2,
          customMade: true,
        },
      ],
      disclosure: "all_custom_made",
    });

    expect(carriesTheForm(body)).toBe(false);
    // The standard return notice goes with it: an order with no withdrawal
    // right must not be told how to exercise one.
    expect(body).not.toContain("Right of return.");
    // ...and the lead-in must not promise a document that is not there.
    expect(body).not.toContain("the model withdrawal form and");
  });

  it("restores the form when a single standard line is present", () => {
    const body = buildOrderReceiptBody({
      ...base,
      items: [
        { title: "Portrait commission", quantity: 1, customMade: true },
        { title: "Studio print", quantity: 1, customMade: false },
      ],
      disclosure: "mixed",
    });

    expect(carriesTheForm(body)).toBe(true);
    expect(body).toContain("Right of return.");
    // Both notices, because both kinds of line are on the order.
    expect(body).toContain(CUSTOM_MADE_NOTICE);
  });

  it("restores the form when the order-level claim is not backed by the lines (the mis-flagged case)", () => {
    // The order summary says every line is exempt; one line does not carry the
    // claim. This is the shape counsel warns compounds Art. 10 exposure, and
    // it is reachable precisely because `disclosure` and `items` are two
    // independent arguments to the same function.
    const body = buildOrderReceiptBody({
      ...base,
      items: [
        { title: "Portrait commission", quantity: 1, customMade: true },
        { title: "Mystery line", quantity: 1 },
      ],
      disclosure: "all_custom_made",
    });

    expect(carriesTheForm(body)).toBe(true);
    // Resolved toward DISCLOSURE rather than toward suppression: the exempt
    // line keeps its notice and the unclaimed one keeps its return right.
    expect(body).toContain(CUSTOM_MADE_NOTICE);
    expect(body).toContain("Right of return.");
  });

  it("never suppresses on an order with no lines at all", () => {
    // `[].every(...)` is true, so a length check is the only thing standing
    // between "every line carries the claim" and "there are no lines".
    const body = buildOrderReceiptBody({
      ...base,
      items: [],
      disclosure: "all_custom_made",
    });

    expect(carriesTheForm(body)).toBe(true);
  });
});

describe("counsel §7.2 condition 2 — the statement is prominent when the form is gone", () => {
  const items = [
    { title: "Portrait commission", quantity: 1, customMade: true },
    { title: "Lettering piece", variant: "A4", quantity: 2, customMade: true },
    { title: "Cover-up design", quantity: 1, customMade: true },
  ];

  it("renders the approved notice against EVERY line, immediately after that line", () => {
    const body = buildOrderReceiptBody({
      ...base,
      items,
      disclosure: "all_custom_made",
    });

    // Attached to the line, not floating somewhere in the message: an
    // exemption claimed against an unidentified item is claimed against no
    // item (counsel Q4, which §7.2 condition 2 builds on).
    for (const item of items) {
      const variant = item.variant ? ` (${item.variant})` : "";
      const line = `- ${item.title}${variant} x ${item.quantity} · ${CUSTOM_MADE_ROW_MARKER}`;
      expect(body).toContain(`${line}\n${CUSTOM_MADE_NOTICE}`);
    }
  });

  it("renders the notice in the summary as well as per line", () => {
    const body = buildOrderReceiptBody({
      ...base,
      items,
      disclosure: "all_custom_made",
    });

    // One per line, plus the order-level statement standing in for the form.
    // A per-line-only implementation gives 3, a summary-only one gives 1;
    // counsel requires both, so only 4 passes.
    expect(occurrences(body, CUSTOM_MADE_NOTICE)).toBe(items.length + 1);
  });

  it("does NOT repeat the notice per line when the form is present", () => {
    // Prominence is required where the form is suppressed. Where the form is
    // there, the short row marker already identifies the exempt line and the
    // notice appears once, so this pins the behaviour to the suppressed case
    // rather than letting it leak into every receipt.
    const body = buildOrderReceiptBody({
      ...base,
      items: [
        { title: "Portrait commission", quantity: 1, customMade: true },
        { title: "Studio print", quantity: 1, customMade: false },
      ],
      disclosure: "mixed",
    });

    expect(occurrences(body, CUSTOM_MADE_NOTICE)).toBe(1);
  });
});

describe("counsel §7.2 — DISTINCTION: the suppressed receipt is still a complete durable record", () => {
  // A guard that refuses everything passes every failure test above. These
  // assert the legitimate case still produces the receipt it is supposed to.
  const suppressed = () =>
    buildOrderReceiptBody({
      ...base,
      items: [{ title: "Portrait commission", quantity: 1, customMade: true }],
      disclosure: "all_custom_made",
    });

  it("keeps the seller block, the items, the total and the Terms", () => {
    const body = suppressed();
    expect(body).toContain(
      "Sold by Mika Ink Studio, 12 Ink Street, Berlin, Germany.",
    );
    expect(body).toContain("- Portrait commission x 1");
    expect(body).toContain("Total paid: 180.00 EUR.");
    // Q6(b): dropping the whole appendix for exempt orders would satisfy "no
    // form" and still be non-compliant on its face.
    expect(body).toContain("Terms of Service (version 2026-07-24):");
    expect(body).toContain("Clause 1. Be nice.");
  });

  it("still closes on the durable-medium line", () => {
    expect(suppressed().trim().endsWith(RECEIPT_DURABLE_CLOSING_LINE)).toBe(
      true,
    );
  });

  it("still reproduces the form for an ordinary returnable order", () => {
    // The control that fails if suppression ever becomes unconditional.
    const body = buildOrderReceiptBody({
      ...base,
      items: [{ title: "Studio print", quantity: 1, customMade: false }],
      disclosure: "all_returnable",
    });
    expect(carriesTheForm(body)).toBe(true);
    expect(body).toContain("Right of return.");
    expect(body).not.toContain(CUSTOM_MADE_NOTICE);
  });
});
