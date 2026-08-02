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
 * notice. `withdrawalFormHref` is appended as "you may use the model
 * withdrawal form" per counsel's `[link/attached]` bracket; omit it and the
 * sentence still stands without a dangling reference.
 */
export function returnRightNotice(opts: {
  sellerContact: string;
  supportEmail: string;
  withdrawalFormHref?: string | null;
}): string {
  const formSentence = opts.withdrawalFormHref
    ? ` You may use the model withdrawal form (${opts.withdrawalFormHref}).`
    : "";
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

/** VERBATIM (C1.3): the durable-medium closing line, mirroring the approved
 *  Plus E2 pattern (billing/withdrawal.ts's confirmation emails). */
export const RECEIPT_DURABLE_CLOSING_LINE =
  "This message is your order confirmation on a durable medium.";

export type ReturnDisclosureItem = { customMade: boolean };

export type ReturnDisclosureSummary =
  | "empty"
  | "all_returnable"
  | "all_custom_made"
  | "mixed";

/**
 * What to render for a set of order lines (product lines directly, or bundle
 * lines where ANY component is custom-made — a bundle sold as one fixed unit
 * cannot honour a return right on the whole while one of its parts is
 * legally exempt, so the conservative/disclosing-more-often direction is to
 * treat the bundle as custom-made too; see the P5d/C1 handoff note on
 * bundles, which counsel's wording does not cover explicitly).
 *
 * "mixed" is the case counsel calls out by name: "A cart mixing custom-made
 * and returnable items must show both correctly" — never collapse it to
 * either single notice, and never omit the notice because SOME items in the
 * cart do not need it.
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

/** One line per purchased item, matching the pre-existing receipt format
 *  ("- Title (Variant) x Qty") so the C1.3 rewrite does not disturb the
 *  bundle-line assertion that format already has test coverage for. */
export type ReceiptLineItem = {
  title: string;
  variant?: string | null;
  quantity: number;
};

function formatReceiptLine(item: ReceiptLineItem): string {
  return `- ${item.title}${item.variant ? ` (${item.variant})` : ""} x ${item.quantity}`;
}

/**
 * Assemble the full C1.3 buyer receipt body: the C1.1 seller block, the
 * purchased items, the total, the C1.2 return/custom-made disclosure (mixed
 * carts get BOTH notices, each introduced so it is clear which items it
 * covers), the complaint route (already inside the seller block), the
 * applicable Terms text, and the closing durable-medium line.
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
  withdrawalFormHref?: string | null;
  /** Pre-rendered "Terms of Service (version X):\n\n..." block, or null if
   *  unavailable — the receipt still sends without it (a receipt failure
   *  must never fail settlement), but this should not happen in practice. */
  termsSection?: string | null;
}): string {
  const sections: string[] = [
    `Thanks for your order from ${input.artistName}.`,
    sellerDisclosureBlock(input.seller, { supportEmail: input.supportEmail }),
    input.items.map(formatReceiptLine).join("\n"),
    `Total paid: ${input.totalLabel}.`,
  ];

  const returnNotice = returnRightNotice({
    sellerContact: input.seller.contact,
    supportEmail: input.supportEmail,
    withdrawalFormHref: input.withdrawalFormHref,
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

  if (input.termsSection) sections.push(input.termsSection);
  sections.push(RECEIPT_DURABLE_CLOSING_LINE);

  return sections.filter(Boolean).join("\n\n");
}
