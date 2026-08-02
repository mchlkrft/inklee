import { describe, it, expect, vi, beforeEach } from "vitest";

// COUNSEL Q6, 2026-08-02, at the two SEND SITES. The shared assembly is
// covered in lib/__tests__/receipt-durable-record.test.ts; this file is about
// what the appointment ADD-ON lane actually hands to the mailer, because that
// is where the defect lived: it called buildOrderReceiptBody with no
// `termsSection` at all, so its receipt carried zero Terms text. Counsel:
// "A confirmation with no Terms text is non-compliant on its face... checkout
// acceptance of terms on a mutable web page does not cure it."
//
// The Terms document is mocked to a short fixture on purpose: this file tests
// the WIRING (does the send site read and pass the section), not the content
// of terms.md. That the real document loads is proven separately in
// lib/legal/__tests__/receipt-terms.test.ts.

const { sendEmail, getLegalDoc } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  getLegalDoc: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));
vi.mock("@/lib/legal/documents", () => ({
  getLegalDoc: (...a: unknown[]) => getLegalDoc(...a),
}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: {} }));

import { sendGoodsOrderConfirmation } from "@/lib/email/send-booking-email";

const SELLER = {
  tradingName: "Mika Ink Studio",
  address: "12 Ink Street, Berlin, Germany",
  contact: "mika@example.com",
};
const SUPPORT_EMAIL = "support@inklee.app";

const RETURNABLE_LINE = {
  title: "Print",
  variant: null,
  quantity: 1,
  total: 15,
  customMade: false,
};
const CUSTOM_LINE = {
  title: "Portrait commission",
  variant: null,
  quantity: 1,
  total: 40,
  customMade: true,
};

function html(): string {
  return (sendEmail.mock.calls.at(-1)?.[0] as { html: string }).html;
}

async function send(
  lines: (typeof RETURNABLE_LINE)[] = [RETURNABLE_LINE],
): Promise<void> {
  await sendGoodsOrderConfirmation({
    to: "buyer@example.com",
    artistName: "Mika Ink",
    lines,
    total: lines.reduce((s, l) => s + l.total, 0),
    currency: "eur",
    seller: SELLER,
    supportEmail: SUPPORT_EMAIL,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue(undefined);
  getLegalDoc.mockReturnValue({
    version: "2026-07-24",
    body: "Clause 1. Buyers are lovely.",
  });
});

describe("add-on goods receipt — Q6(b): the Terms text", () => {
  it("reproduces the Terms body and version, which this lane previously omitted entirely", async () => {
    await send();
    expect(getLegalDoc).toHaveBeenCalledWith("terms");
    expect(html()).toContain("Terms of Service (version 2026-07-24):");
    expect(html()).toContain("Clause 1. Buyers are lovely.");
  });

  it("reproduces the Terms even for a wholly custom-made order, which has no return right but still has a contract", async () => {
    await send([CUSTOM_LINE]);
    expect(html()).toContain("Clause 1. Buyers are lovely.");
  });

  it("still sends the receipt, and logs, when the Terms document cannot be read", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    getLegalDoc.mockImplementation(() => {
      throw new Error("terms.md missing");
    });
    await send();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(html()).not.toContain("Terms of Service (version");
    expect(err).toHaveBeenCalledWith(
      "[email] goods order confirmation sent without inline Terms text:",
      expect.stringContaining("terms.md missing"),
    );
    err.mockRestore();
  });
});

describe("add-on goods receipt — Q6(a): the model withdrawal form", () => {
  it("reproduces the whole form, addressed to the artist with Inklee as alternative", async () => {
    await send();
    expect(html()).toContain("Model withdrawal form");
    expect(html()).toContain("I/we hereby give notice");
    expect(html()).toContain("Mika Ink Studio");
    expect(html()).toContain("or Inklee (support@inklee.app)");
  });

  it("carries the Q7 forwarding-without-delay rule", async () => {
    await send();
    expect(html()).toContain("without delay");
    expect(html()).toContain(
      "counts as received on the day Inklee receives it",
    );
  });

  it("does not fall back to a link to the form page", async () => {
    await send();
    expect(html()).not.toContain("/shop/withdrawal-form");
  });

  it("DISTINCTION: no form on a wholly custom-made order, but the exemption notice IS there", async () => {
    await send([CUSTOM_LINE]);
    expect(html()).not.toContain("I/we hereby give notice");
    expect(html()).toContain("Custom-made item: no right of return.");
  });

  it("DISTINCTION: a MIXED order keeps the form, because some items keep the right", async () => {
    await send([RETURNABLE_LINE, CUSTOM_LINE]);
    expect(html()).toContain("I/we hereby give notice");
    expect(html()).toContain("Custom-made item: no right of return.");
  });
});
