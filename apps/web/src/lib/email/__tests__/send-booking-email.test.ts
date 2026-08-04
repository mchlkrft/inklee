import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));

import { sendGoodsOrderConfirmation } from "@/lib/email/send-booking-email";

// GOODS-DISC-001: the appointment add-on checkout's receipt used to be a bare
// item/total list with no seller identity and no return-right disclosure —
// exactly the gap this rewrite closes by building on the SAME
// buildOrderReceiptBody the standalone shop's receipt uses. Named failure
// mode for the whole file: if `sendGoodsOrderConfirmation` stopped calling
// buildOrderReceiptBody (or called it with the wrong `disclosure`), the
// seller block / return notice would silently drop out of this receipt again
// while the standalone shop's stayed intact — the two must never drift.

const SELLER = {
  tradingName: "Mika Ink Studio",
  address: "12 Ink Street, Berlin, Germany",
  contact: "mika@example.com",
};
const SUPPORT_EMAIL = "support@inklee.app";

// The distinctive opening of the STANDARD return NOTICE (returnRightNotice).
// The receipt now reproduces the FULL Terms of Service in the durable record
// (counsel Q6(b)), and the Terms body carries its own "Right of return." label
// in the Goods-orders section — so a bare `toContain("Right of return.")` /
// `not.toContain("Right of return.")` no longer distinguishes "the order's
// return notice is shown" from "the Terms happen to mention returns". This
// sentence appears ONLY in the notice, never in the Terms, so asserting on it
// makes each branch's presence/absence check actually about the notice.
const STANDARD_RETURN_NOTICE =
  "Right of return. You may withdraw from this purchase within 14 days";

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue(undefined);
});

function html(): string {
  return (sendEmail.mock.calls.at(-1)?.[0] as { html: string }).html;
}

describe("sendGoodsOrderConfirmation", () => {
  it("includes the C1.1 seller block", async () => {
    await sendGoodsOrderConfirmation({
      to: "buyer@example.com",
      artistName: "Mika Ink",
      lines: [
        {
          title: "Print",
          variant: null,
          quantity: 1,
          total: 15,
          customMade: false,
        },
      ],
      total: 15,
      currency: "eur",
      seller: SELLER,
      supportEmail: SUPPORT_EMAIL,
    });
    expect(html()).toContain(
      "Sold by Mika Ink Studio, 12 Ink Street, Berlin, Germany.",
    );
  });

  it("shows the standard return notice for an all-returnable order", async () => {
    await sendGoodsOrderConfirmation({
      to: "buyer@example.com",
      artistName: "Mika Ink",
      lines: [
        {
          title: "Print",
          variant: null,
          quantity: 1,
          total: 15,
          customMade: false,
        },
      ],
      total: 15,
      currency: "eur",
      seller: SELLER,
      supportEmail: SUPPORT_EMAIL,
    });
    expect(html()).toContain(STANDARD_RETURN_NOTICE);
    expect(html()).not.toContain("Custom-made item");
  });

  it("shows the custom-made exemption instead when every line is flagged", async () => {
    await sendGoodsOrderConfirmation({
      to: "buyer@example.com",
      artistName: "Mika Ink",
      lines: [
        {
          title: "Portrait commission",
          variant: null,
          quantity: 1,
          total: 40,
          customMade: true,
        },
      ],
      total: 40,
      currency: "eur",
      seller: SELLER,
      supportEmail: SUPPORT_EMAIL,
    });
    expect(html()).toContain("Custom-made item: no right of return.");
    expect(html()).not.toContain(STANDARD_RETURN_NOTICE);
  });

  it("shows BOTH notices for a mixed order (the cross-cutting failure mode)", async () => {
    await sendGoodsOrderConfirmation({
      to: "buyer@example.com",
      artistName: "Mika Ink",
      lines: [
        {
          title: "Print",
          variant: null,
          quantity: 1,
          total: 15,
          customMade: false,
        },
        {
          title: "Portrait commission",
          variant: null,
          quantity: 1,
          total: 40,
          customMade: true,
        },
      ],
      total: 55,
      currency: "eur",
      seller: SELLER,
      supportEmail: SUPPORT_EMAIL,
    });
    expect(html()).toContain("Custom-made item: no right of return.");
    expect(html()).toContain(STANDARD_RETURN_NOTICE);
  });

  it("Q4: marks the custom-made line, and only that line, in the durable record", async () => {
    // The add-on lane's receipt is the second payable surface's durable
    // record. Named failure mode: if `sendGoodsOrderConfirmation` stopped
    // forwarding `customMade` into the receipt items, the mixed-basket
    // lead-in above would go back to claiming the exemption over an
    // unidentified subset while the standalone shop's receipt stayed marked.
    // The negative half is the control: marking every line would pass the
    // positive assertion and still misstate the returnable item.
    await sendGoodsOrderConfirmation({
      to: "buyer@example.com",
      artistName: "Mika Ink",
      lines: [
        {
          title: "Print",
          variant: null,
          quantity: 1,
          total: 15,
          customMade: false,
        },
        {
          title: "Portrait commission",
          variant: null,
          quantity: 1,
          total: 40,
          customMade: true,
        },
      ],
      total: 55,
      currency: "eur",
      seller: SELLER,
      supportEmail: SUPPORT_EMAIL,
    });
    expect(html()).toContain(
      "Portrait commission x 1 · custom-made, no returns",
    );
    expect(html()).not.toContain("Print x 1 · custom-made, no returns");
  });

  it("includes the pickup fulfillment note (distinguishing this from the standalone shop's shipped/collected framing)", async () => {
    await sendGoodsOrderConfirmation({
      to: "buyer@example.com",
      artistName: "Mika Ink",
      lines: [
        {
          title: "Print",
          variant: null,
          quantity: 1,
          total: 15,
          customMade: false,
        },
      ],
      total: 15,
      currency: "eur",
      seller: SELLER,
      supportEmail: SUPPORT_EMAIL,
    });
    expect(html()).toContain(
      "Your goods will be waiting for you at your appointment.",
    );
  });

  it("closes on the durable-medium line (C1.3)", async () => {
    await sendGoodsOrderConfirmation({
      to: "buyer@example.com",
      artistName: "Mika Ink",
      lines: [
        {
          title: "Print",
          variant: null,
          quantity: 1,
          total: 15,
          customMade: false,
        },
      ],
      total: 15,
      currency: "eur",
      seller: SELLER,
      supportEmail: SUPPORT_EMAIL,
    });
    expect(html()).toContain(
      "This message is your order confirmation on a durable medium.",
    );
  });

  it("states the goods-only total, not a combined figure — the GOODS-DISC-001 total fix", async () => {
    await sendGoodsOrderConfirmation({
      to: "buyer@example.com",
      artistName: "Mika Ink",
      lines: [
        {
          title: "Print",
          variant: null,
          quantity: 1,
          total: 15,
          customMade: false,
        },
      ],
      total: 15,
      currency: "eur",
      seller: SELLER,
      supportEmail: SUPPORT_EMAIL,
    });
    expect(html()).toContain("Total paid: EUR 15.00.");
  });

  it("never throws when the provider fails, and does not rethrow", async () => {
    sendEmail.mockRejectedValue(new Error("resend down"));
    await expect(
      sendGoodsOrderConfirmation({
        to: "buyer@example.com",
        artistName: "Mika Ink",
        lines: [
          {
            title: "Print",
            variant: null,
            quantity: 1,
            total: 15,
            customMade: false,
          },
        ],
        total: 15,
        currency: "eur",
        seller: SELLER,
        supportEmail: SUPPORT_EMAIL,
      }),
    ).resolves.toBeUndefined();
  });
});
