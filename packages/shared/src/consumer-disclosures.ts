// Consumer-law disclosures for the goods checkout (Plus build, counsel
// answers C1.1/C1.2/C1.3 — docs/legal/counsel-accountant-handoff-2026-08.md
// Part 4). Wording marked VERBATIM below is counsel's own text with only the
// bracketed variables filled in; do not paraphrase it. Everything else
// (section ordering, lead-in lines, fallbacks) is engineering scaffolding
// around that text, not counsel's wording.
//
// Pure module by design: the checkout page (server), the checkout UI
// (client), and the receipt email (server) all need the SAME answer to "what
// does this order's return-right disclosure say", and the only way to
// guarantee that is one shared, side-effect-free source read by all three
// (the OSOT pattern this codebase already uses for fees/bundles/availability).
// It also means the decision logic is testable directly, unlike the .tsx
// surfaces that render it (vitest's include is src/**/*.test.ts, not .tsx).

export const ORDER_WITH_OBLIGATION_LABEL = "Order with obligation to pay";

/**
 * The Art. 8(2) pay-button label, assembled in ONE place (counsel Q4,
 * 2026-08-02).
 *
 * Q4's premise correction: there are TWO payable surfaces selling the same
 * catalogue, not one. The standalone shop carried the approved label; the
 * appointment add-on lane carried "Pay deposit and selected items", which
 * counsel called "arguably an unambiguous payment formulation, but do not
 * spend risk on 'arguably'". A second hardcoded label string is what let the
 * two drift in the first place, so the label and its shape live here and both
 * surfaces call this.
 *
 * `detail` is the only part that legitimately differs between them (the
 * standalone names the payee, the add-on lane names what the total covers,
 * since a deposit-led basket is not self-evidently a goods purchase). Counsel
 * wrote the example as "Order with obligation to pay - [total]: deposit and
 * selected items"; the separator is rendered as a space rather than counsel's
 * em-dash because the house copy rule forbids em-dashes in user-visible
 * strings, and the separator is not part of the approved wording.
 */
export function orderWithObligationButtonLabel(opts: {
  /** Already-formatted total, e.g. "EUR 125.00". */
  totalLabel: string;
  /** What the total covers, e.g. "to Mika Ink" or "for the deposit and
   *  selected items". Omitted renders the bare label plus total. */
  detail?: string | null;
}): string {
  const detail = opts.detail?.trim();
  const head = `${ORDER_WITH_OBLIGATION_LABEL} ${opts.totalLabel}`;
  return detail ? `${head} ${detail}` : head;
}

/**
 * The appointment add-on lane's pay button (counsel Q4).
 *
 * The BRANCH lives here, not in the .tsx, because the branch is the decision
 * that has to be right: a goods-bearing basket concludes a distance contract
 * that includes goods and therefore needs the Art. 8(2) label, while a
 * deposit-only basket is the pre-existing service-deposit payment and is left
 * exactly as it was. This mirrors `addonGoodsSellerGate`'s scoping (goods
 * actually being sold on THIS attempt, never "add-on products exist"), and it
 * keeps the label testable, which the .tsx surface is not (vitest's include is
 * `src/**\/*.test.ts`).
 */
export function addonPayButtonLabel(input: {
  hasGoodsLines: boolean;
  /** Already-formatted grand total (deposit + goods - discount). */
  totalLabel: string;
}): string {
  return input.hasGoodsLines
    ? orderWithObligationButtonLabel({
        totalLabel: input.totalLabel,
        detail: "for the deposit and selected items",
      })
    : "Pay deposit";
}

export type SellerData = {
  tradingName: string | null;
  address: string | null;
  contact: string | null;
};

/**
 * Counsel's prerequisite (C1.1): "Artists without complete seller data cannot
 * enable the shop." All three fields required and non-blank — a shop cannot
 * partially disclose its seller.
 */
export function sellerDataComplete(seller: SellerData): boolean {
  return Boolean(
    seller.tradingName?.trim() &&
      seller.address?.trim() &&
      seller.contact?.trim(),
  );
}

export type CompleteSellerData = {
  tradingName: string;
  address: string;
  contact: string;
};

/**
 * VERBATIM (C1.1), bracketed variables filled: seller identity, the
 * Inklee-hosts/artist-is-the-contract-party statement, delivery arrangement,
 * the 14-day return right with the custom-made carve-out named, and the
 * complaint route. Rendered above the pay button per counsel's instruction;
 * `returnNoticeRef` defaults to "see below" because the standard return
 * notice (returnRightNotice, below) always renders on the SAME screen /
 * SAME email, per C1.2 — a separate link is only needed if a caller ever
 * splits them across pages.
 */
export function sellerDisclosureBlock(
  seller: CompleteSellerData,
  opts: { supportEmail: string; returnNoticeRef?: string },
): string {
  const returnRef = opts.returnNoticeRef ?? "see below";
  return [
    `Sold by ${seller.tradingName}, ${seller.address}.`,
    "Inklee hosts this shop and processes the payment on the artist's behalf. Your purchase contract is with the artist.",
    "Pickup or delivery is arranged with the artist directly. Any delivery cost is agreed with the artist and is not included in this total.",
    `You have a 14-day right of return (${returnRef}). Items marked "custom-made" cannot be returned.`,
    `Questions or complaints: contact the artist at ${seller.contact}; if unresolved, contact Inklee at ${opts.supportEmail}.`,
  ].join("\n\n");
}

/**
 * VERBATIM (C1.2), bracketed variables filled: the standard 14-day return
 * notice.
 *
 * CORRECTED 2026-08-02 while implementing counsel Q6. Counsel's text is one
 * sentence: "...before the period ends; you may use the model withdrawal form
 * [link/attached]. Send the goods back..." The clause was implemented as
 * OPTIONAL on `withdrawalFormHref`, and neither receipt send site ever passed
 * one, so every receipt rendered "...before the period ends; Send the goods
 * back...": counsel's clause silently deleted, and a semicolon left governing
 * nothing. The clause is therefore unconditional now, and only the BRACKET
 * varies. Counsel's lowercase "you may use" is restored with it.
 */
export function returnRightNotice(opts: {
  sellerContact: string;
  supportEmail: string;
  /** A link to the model form page. Correct on a SCREEN, which is not a
   *  durable medium. */
  withdrawalFormHref?: string | null;
  /** Q6: where the form actually is, when it is not behind a link. In a
   *  durable record counsel requires the form to be REPRODUCED in the same
   *  message ("A plain-text path reference satisfies neither"), so the
   *  receipt passes "reproduced below" and never a path. Wins over
   *  `withdrawalFormHref` when both are given. */
  withdrawalFormRef?: string | null;
}): string {
  const formLocation = opts.withdrawalFormRef ?? opts.withdrawalFormHref;
  const formSentence = formLocation
    ? ` you may use the model withdrawal form (${formLocation}).`
    : " you may use the model withdrawal form.";
  return (
    "Right of return. You may withdraw from this purchase within 14 days of the day you (or someone you nominate) receive the goods, without giving a reason. " +
    `To do so, tell the artist (${opts.sellerContact}) or Inklee (${opts.supportEmail}) in a clear statement before the period ends;` +
    `${formSentence} ` +
    "Send the goods back to the artist within 14 days of telling us. You bear the direct cost of returning the goods. " +
    "The refund, including standard delivery cost, if you paid one, is made within 14 days of your withdrawal, though it may be withheld until the goods are back or you prove you sent them. " +
    "You are liable only for any diminished value from handling beyond what a shop would allow."
  );
}

/** VERBATIM (C1.2): the per-product Art. 16(c) exemption notice. No
 *  variables — rendered as-is at the product, in the cart, at checkout and
 *  in the confirmation for every item the artist has flagged custom-made. */
export const CUSTOM_MADE_NOTICE =
  'Custom-made item: no right of return. This item is made to your specification or clearly personalised, so the 14-day right of return does not apply (Art. 16(c), Consumer Rights Directive).';

/**
 * The PER-ROW marker (counsel Q4, 2026-08-02): the short label appended to an
 * individual line so the exemption is claimed against an IDENTIFIED item.
 *
 * Counsel: "an exemption claimed against an unidentified item is claimed
 * against no item, and the unmarked items' return windows extend under Art.
 * 10." The aggregate lead-in ("Some of your selected items are custom-made")
 * is a lead-in to these markers, not a substitute for them; on its own it is
 * the blanket-claim shape C1.2 prohibits. Note the C1.1 seller block already
 * says 'Items marked "custom-made" cannot be returned' verbatim, so a surface
 * with no marks is also referring the buyer to something that is not there.
 *
 * Single-sourced because the marker previously existed only as three copies of
 * a literal inside the standalone shop's checkout and nowhere on the add-on
 * lane, which is exactly the divergence Q4 was raised about.
 */
export const CUSTOM_MADE_ROW_MARKER = "custom-made, no returns";

/**
 * The marker as a suffix, separator included, or "" when the row is
 * returnable. Callers append this to an existing metadata run ("EUR 20.00 ·
 * sold out"), so the separator belongs to the marker rather than to each
 * caller.
 */
export function customMadeRowSuffix(customMade: boolean): string {
  return customMade ? ` · ${CUSTOM_MADE_ROW_MARKER}` : "";
}

/** VERBATIM (C1.3): the durable-medium closing line, mirroring the approved
 *  Plus E2 pattern (billing/withdrawal.ts's confirmation emails). */
export const RECEIPT_DURABLE_CLOSING_LINE =
  "This message is your order confirmation on a durable medium.";

// ---------------------------------------------------------------------------
// Model withdrawal form (Consumer Rights Directive, Annex I(B))
//
// Counsel Q7: the Annex I(B) construction is APPROVED, including addressing
// the form to the ARTIST as seller (the purchase contract is with the artist)
// and naming Inklee as an alternative recipient — on one condition, which is
// `withdrawalForwardingNotice` below.
//
// Counsel Q7 also requires the artist's real name and address to be rendered
// into the form, not placeholders. That is why every entry point takes
// `CompleteSellerData`: there is no way to build this form without them.
//
// Counsel Q6: the form must be REPRODUCED in the confirmation, not linked.
// So the form has two renderers over ONE definition (`modelWithdrawalFormLines`):
// the page renders it as JSX, `modelWithdrawalFormText` renders it as the
// plain text embedded in the receipt. They cannot drift.
// ---------------------------------------------------------------------------

export const MODEL_WITHDRAWAL_FORM_HEADING = "Model withdrawal form";

export const MODEL_WITHDRAWAL_FORM_INTRO =
  "You do not have to use this form. Any clear statement that you are withdrawing works, sent to the artist or to Inklee. This is provided so you always have a working template available.";

/**
 * Counsel Q7's condition on naming Inklee as an alternative recipient: the
 * buyer "must not lose days in forwarding", so both this form and the Terms
 * must state that a withdrawal reaching Inklee counts as received on the day
 * Inklee receives it and is passed to the artist without delay. Without this
 * sentence, offering Inklee as a recipient is a trap rather than a
 * convenience: the 14-day deadline runs on the buyer while the notice sits in
 * a queue.
 */
export function withdrawalForwardingNotice(supportEmail: string): string {
  return (
    `Send this to the artist, or to Inklee at ${supportEmail}. ` +
    "A withdrawal sent to Inklee counts as received on the day Inklee receives it, and Inklee passes it to the artist without delay. " +
    "Choosing Inklee costs you no time on the 14-day deadline."
  );
}

export const MODEL_WITHDRAWAL_FORM_CUSTOM_MADE_FOOTNOTE =
  'Items marked "custom-made" are not covered by this right of return.';

export type WithdrawalFormLine = {
  /** The form's own line: Annex I(B) wording, or the rendered "To:" address. */
  text: string;
  /** What the buyer fills in, when the line is a prompt rather than a
   *  statement. Rendered muted on the page, and on its own line in email. */
  entry?: string;
};

/** The form itself, Annex I(B) order, with the seller resolved. */
export function modelWithdrawalFormLines(
  seller: CompleteSellerData,
  opts: { supportEmail: string },
): WithdrawalFormLine[] {
  return [
    {
      text: `To: ${seller.tradingName}, ${seller.address} (contact: ${seller.contact}), or Inklee (${opts.supportEmail}).`,
    },
    {
      text: "I/we hereby give notice that I/we withdraw from my/our contract of sale of the following goods:",
      entry: "[describe the item(s) you are returning]",
    },
    { text: "Ordered on / received on:", entry: "[date]" },
    { text: "Name of consumer(s):", entry: "[your name]" },
    { text: "Address of consumer(s):", entry: "[your address]" },
    { text: "Signature of consumer(s) (only if this form is sent on paper):" },
    { text: "Date:" },
  ];
}

/**
 * The whole form as plain text, for reproduction inside the durable record
 * (counsel Q6: reproduce, do not reference). Heading, the "you need not use
 * it" intro, the forwarding rule, then the form.
 */
export function modelWithdrawalFormText(
  seller: CompleteSellerData,
  opts: { supportEmail: string },
): string {
  return [
    MODEL_WITHDRAWAL_FORM_HEADING,
    MODEL_WITHDRAWAL_FORM_INTRO,
    withdrawalForwardingNotice(opts.supportEmail),
    ...modelWithdrawalFormLines(seller, opts).map((line) =>
      line.entry ? `${line.text}\n${line.entry}` : line.text,
    ),
  ].join("\n\n");
}

/**
 * GOODS-DISC-001. The appointment add-on checkout sells the SAME
 * `custom_made`-capable catalogue as the standalone shop, riding on a
 * booking's deposit PaymentIntent (`computeAddonLines`, shared by both). The
 * two checkouts differ in what the buyer is primarily there for (a service
 * deposit vs. a goods purchase), so this gate is scoped to whether a GOODS
 * SALE is actually happening on THIS attempt, never to whether add-on
 * products merely exist: a deposit-only checkout (no goods lines selected)
 * has no goods contract to disclose, so an artist's incomplete seller data
 * must never block it.
 *
 * The moment goods lines are non-empty, though, the add-on path is doing
 * exactly what the standalone shop does when it enforces `sellerDataComplete`
 * on its own money path (createStandaloneGoodsCheckoutCore) rather than only
 * at the page layer: selling goods with no disclosable seller is the harm
 * C1.1's prerequisite exists to prevent, and it is not less true because the
 * sale happens to share a PaymentIntent with a deposit.
 */
export function addonGoodsSellerGate(input: {
  hasGoodsLines: boolean;
  seller: SellerData;
}): { ok: true } | { ok: false; reason: "seller_data_incomplete" } {
  if (!input.hasGoodsLines) return { ok: true };
  return sellerDataComplete(input.seller)
    ? { ok: true }
    : { ok: false, reason: "seller_data_incomplete" };
}

export type ReturnDisclosureItem = { customMade: boolean };

export type ReturnDisclosureSummary =
  | "empty"
  | "all_returnable"
  | "all_custom_made"
  | "mixed";

/**
 * What to render for a set of order lines (product lines directly, and bundle
 * lines by the one answer all of a bundle's components give: counsel Q2
 * (2026-08-02) settled that a bundle is all custom-made or all standard, so
 * there is no bundle-level aggregation question left to decide here. The
 * earlier engineering rule "any custom-made component makes the whole bundle
 * non-returnable" is WITHDRAWN, not merely relocated; `bundleMixesCustomMade`
 * refuses the composition it applied to).
 *
 * "mixed" is about the CART, and it stays: it is the case counsel calls out
 * by name, "A cart mixing custom-made and returnable items must show both
 * correctly", and it is exactly what an artist who wants to sell a custom
 * piece alongside stock is told to do instead of bundling them. Never
 * collapse it to either single notice, and never omit the notice because
 * SOME items in the cart do not need it.
 */
export function summarizeReturnDisclosure(
  items: ReturnDisclosureItem[],
): ReturnDisclosureSummary {
  if (items.length === 0) return "empty";
  const anyCustom = items.some((i) => i.customMade);
  const anyReturnable = items.some((i) => !i.customMade);
  if (anyCustom && anyReturnable) return "mixed";
  return anyCustom ? "all_custom_made" : "all_returnable";
}

/**
 * GOODS-DISC-001: the return-right disclosure sections for the appointment
 * ADD-ON checkout SCREEN — the seller block plus whichever notice(s) the
 * CURRENT SELECTION needs, empty when nothing is selected. Distinct from
 * `buildOrderReceiptBody` (which assembles the finished RECEIPT, "your
 * order") because this describes a still-editable basket ("your selected
 * items"), but it rests on the exact same primitives
 * (`summarizeReturnDisclosure`, `sellerDisclosureBlock`, `returnRightNotice`,
 * `CUSTOM_MADE_NOTICE`) so the two surfaces can never independently drift on
 * WHICH notice applies, only on how it is introduced.
 */
export function addonCheckoutDisclosureSections(
  selectedItems: ReturnDisclosureItem[],
  seller: CompleteSellerData,
  supportEmail: string,
): string[] {
  const summary = summarizeReturnDisclosure(selectedItems);
  if (summary === "empty") return [];
  const sections = [sellerDisclosureBlock(seller, { supportEmail })];
  const notice = returnRightNotice({
    sellerContact: seller.contact,
    supportEmail,
  });
  if (summary === "all_custom_made") {
    sections.push(CUSTOM_MADE_NOTICE);
  } else if (summary === "mixed") {
    sections.push(
      "Some of your selected items are custom-made and cannot be returned:",
      CUSTOM_MADE_NOTICE,
      "The rest qualify for the standard return right:",
      notice,
    );
  } else {
    sections.push(notice);
  }
  return sections;
}

/** One line per purchased item, matching the pre-existing receipt format
 *  ("- Title (Variant) x Qty") so the C1.3 rewrite does not disturb the
 *  bundle-line assertion that format already has test coverage for. */
export type ReceiptLineItem = {
  title: string;
  variant?: string | null;
  quantity: number;
  /** Q4: the sale-time custom-made snapshot for THIS line, so the durable
   *  record identifies which items the exemption was claimed against instead
   *  of asserting it over an unidentified subset. Optional and defaulting to
   *  false so a caller that omits it produces a byte-identical receipt to
   *  before this field existed. */
  customMade?: boolean;
};

function formatReceiptLine(item: ReceiptLineItem): string {
  return `- ${item.title}${item.variant ? ` (${item.variant})` : ""} x ${item.quantity}${customMadeRowSuffix(item.customMade === true)}`;
}

/** The rule between the transactional half of the receipt and the reproduced
 *  documents, and between the documents themselves. Same separator the
 *  approved Plus E2 confirmation already uses (billing/withdrawal.ts). */
const RECEIPT_DOCUMENT_RULE = "---";

/**
 * The one line that keeps a receipt carrying two reproduced documents
 * readable: it tells the buyer that the transaction is finished above and
 * that everything below is their copy, so a long scroll is expected rather
 * than alarming. Built from what is ACTUALLY reproduced, never from what
 * should have been, so it can never promise a document the email does not
 * carry.
 */
function reproducedDocumentsLeadIn(names: string[]): string | null {
  if (names.length === 0) return null;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Below this line is your own copy of ${list}, reproduced in full so this email is a complete record on its own. Keep this email for your records.`;
}

/**
 * Assemble the full C1.3 buyer receipt body: the C1.1 seller block, the
 * purchased items, the total, the C1.2 return/custom-made disclosure (mixed
 * carts get BOTH notices, each introduced so it is clear which items it
 * covers), the complaint route (already inside the seller block), the
 * reproduced model withdrawal form, the applicable Terms text, and the
 * closing durable-medium line.
 *
 * COUNSEL Q6 (2026-08-02): "The model form must be reproduced in or attached
 * to the confirmation... A plain-text path reference satisfies neither
 * [Art. 6(1)(h) nor Art. 8(7)]." So this function BUILDS the form rather than
 * accepting a link to it: it already has the two inputs the form needs (the
 * complete seller and the support inbox), which means no send site can
 * produce a receipt that omits it, and there is deliberately no
 * `withdrawalFormHref` knob left on this function to tempt one back into
 * linking. The on-SCREEN checkout link is unaffected and still correct: a web
 * page is not the durable medium, so `returnRightNotice` keeps its href
 * parameter for that surface.
 *
 * The form is reproduced only when a right of withdrawal EXISTS for this
 * order. Art. 6(1)(h) is conditional on that right, and an all-custom-made
 * order is exempt under Art. 16(c); printing a withdrawal template directly
 * beneath "no right of return" would contradict the notice it follows. Mixed
 * orders keep the form, because some of their items do carry the right.
 *
 * Pure string assembly: every value is already resolved by the caller
 * (goods-checkout.ts reads the DB and the current Terms snapshot; this
 * function only decides ORDER and WORDING, which is the part that needs to
 * be independently testable per the C1.3 brief).
 */
export function buildOrderReceiptBody(input: {
  artistName: string;
  seller: CompleteSellerData;
  supportEmail: string;
  items: ReceiptLineItem[];
  totalLabel: string;
  disclosure: ReturnDisclosureSummary;
  /** Pre-rendered "Terms of Service (version X):\n\n..." block, or null if
   *  unavailable — the receipt still sends without it (a receipt failure
   *  must never fail settlement), but counsel Q6(b) is explicit that a
   *  confirmation with no Terms text is "non-compliant on its face", so a
   *  null here is an incident to report, not a supported mode. */
  termsSection?: string | null;
  /** GOODS-DISC-001: an optional line inserted right after the total, before
   *  the return-right disclosure — e.g. the add-on checkout's "reserved for
   *  pickup at your appointment" (goods paid for alongside a deposit are not
   *  shipped/collected the same way a standalone-shop order is). Omitted by
   *  default, so the standalone shop's receipt is byte-identical to before
   *  this option existed. */
  fulfillmentNote?: string | null;
}): string {
  const sections: string[] = [
    `Thanks for your order from ${input.artistName}.`,
    sellerDisclosureBlock(input.seller, { supportEmail: input.supportEmail }),
    input.items.map(formatReceiptLine).join("\n"),
    `Total paid: ${input.totalLabel}.`,
  ];
  if (input.fulfillmentNote) sections.push(input.fulfillmentNote);

  // ONE decision, read twice: whether this order carries a right of
  // withdrawal at all. It governs BOTH whether the form is reproduced below
  // and whether the return notice may tell the buyer to look for it, so the
  // notice can never point at a document this email does not contain.
  const reproducesForm = input.disclosure !== "all_custom_made";

  const returnNotice = returnRightNotice({
    sellerContact: input.seller.contact,
    supportEmail: input.supportEmail,
    // Q6: counsel's "[link/attached]" bracket, filled for a durable record.
    // The form is further down THIS message, so the buyer is pointed at the
    // reproduction and never at a path.
    //
    // The null branch is UNREACHABLE today (the exempt branch below does not
    // render this notice at all, so nothing renders the pointer either) and
    // is therefore untested; it is written this way so the pointer and the
    // reproduction cannot decouple if the exempt branch ever starts showing
    // a notice.
    withdrawalFormRef: reproducesForm ? "reproduced below" : null,
  });

  if (input.disclosure === "all_custom_made") {
    sections.push(CUSTOM_MADE_NOTICE);
  } else if (input.disclosure === "mixed") {
    sections.push(
      "Some items in your order are custom-made and cannot be returned:",
      CUSTOM_MADE_NOTICE,
      "The remaining items qualify for the standard return right:",
      returnNotice,
    );
  } else {
    // "all_returnable" and "empty" (a receipt is never sent for an empty
    // order, but this keeps the function total rather than throwing) both
    // get the standard notice — an omitted return right silently extends the
    // withdrawal window to 12 months (counsel's own warning), so the safer
    // default when disclosure state is unknown is to disclose it.
    sections.push(returnNotice);
  }

  // Q6: the reproduced documents, last, so the buyer reads what they bought
  // and what their rights are before a scroll of legal text, and so the
  // closing durable-medium line still closes the message.
  const documents: string[] = [];
  const documentNames: string[] = [];
  if (reproducesForm) {
    documents.push(
      modelWithdrawalFormText(input.seller, {
        supportEmail: input.supportEmail,
      }),
    );
    documentNames.push("the model withdrawal form");
  }
  if (input.termsSection) {
    documents.push(input.termsSection);
    documentNames.push("the Terms of Service");
  }
  const leadIn = reproducedDocumentsLeadIn(documentNames);
  if (leadIn) sections.push(leadIn);
  for (const document of documents) {
    sections.push(RECEIPT_DOCUMENT_RULE, document);
  }
  if (documents.length > 0) sections.push(RECEIPT_DOCUMENT_RULE);
  sections.push(RECEIPT_DURABLE_CLOSING_LINE);

  return sections.filter(Boolean).join("\n\n");
}
