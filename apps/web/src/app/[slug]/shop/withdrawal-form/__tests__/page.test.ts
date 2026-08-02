import { describe, it, expect, vi, beforeEach } from "vitest";

// COUNSEL Q7 (2026-08-02): the model withdrawal form was "the only
// consumer-facing surface in this set with no counsel-authored source, and it
// has no dedicated test." Counsel then APPROVED the Annex I(B) construction
// with one addition (the forwarding-without-delay rule) and one requirement
// (the artist's real name and address rendered in, not placeholders). This
// file is that missing test.
//
// NAMED FAILURE MODES pinned here:
//  1. A form that reaches a buyer with placeholder seller details, or with
//     Inklee named as a recipient but NO forwarding rule, is the exact trap
//     counsel warned about: the buyer loses days on a 14-day deadline.
//  2. The page and the reproduced-in-the-receipt copy drifting apart. Both
//     read `modelWithdrawalFormLines`; the last test here proves the page
//     really does render that text and not a hand-maintained twin.
//  3. THE DISTINCTION CONTROL: three notFound() gates guard this page, so a
//     page that 404s unconditionally would pass every negative test in this
//     file. The "renders when all three gates pass" case is the control that
//     catches it.

const { flags, maybeSingle } = vi.hoisted(() => ({
  flags: { goodsCommerce: true, shopCheckout: true },
  maybeSingle: vi.fn(),
}));

class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError();
  },
}));

vi.mock("@/lib/features", () => ({
  isGoodsCommerceEnabled: () => flags.goodsCommerce,
  shopCheckoutEnabled: () => flags.shopCheckout,
}));

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  },
}));

import WithdrawalFormPage, {
  metadata,
} from "@/app/[slug]/shop/withdrawal-form/page";
import { SUPPORT_INBOX_EMAIL } from "@/lib/server/support";
import {
  modelWithdrawalFormLines,
  modelWithdrawalFormText,
  withdrawalForwardingNotice,
} from "@inklee/shared/consumer-disclosures";

const SELLER = {
  tradingName: "Mika Ink Studio",
  address: "12 Ink Street, Berlin, Germany",
  contact: "mika@example.com",
};

const COMPLETE_ARTIST = {
  display_name: "Mika Ink",
  settings: { shop_checkout_enabled: true },
  seller_trading_name: SELLER.tradingName,
  seller_address: SELLER.address,
  seller_contact: SELLER.contact,
};

/** Flattens a rendered React element tree to its visible text. Avoids pulling
 *  react-dom into a node-environment test; the page is plain elements. */
function textOf(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("\n");
  if (typeof node === "object" && "props" in (node as Record<string, unknown>))
    return textOf((node as { props?: { children?: unknown } }).props?.children);
  return "";
}

async function render(slug = "mika"): Promise<string> {
  const element = await WithdrawalFormPage({
    params: Promise.resolve({ slug }),
  });
  return textOf(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  flags.goodsCommerce = true;
  flags.shopCheckout = true;
  maybeSingle.mockResolvedValue({ data: COMPLETE_ARTIST, error: null });
});

describe("withdrawal form page — gates", () => {
  it("404s when goods commerce is off (the dark-build posture)", async () => {
    flags.goodsCommerce = false;
    await expect(render()).rejects.toThrow(NotFoundError);
  });

  it("404s when the artist slug does not resolve", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(render("nobody")).rejects.toThrow(NotFoundError);
  });

  it("404s when the artist has not switched their shop checkout on", async () => {
    flags.shopCheckout = false;
    await expect(render()).rejects.toThrow(NotFoundError);
  });

  it("404s when seller data is incomplete — a form cannot be addressed to an unidentified seller", async () => {
    maybeSingle.mockResolvedValue({
      data: { ...COMPLETE_ARTIST, seller_address: null },
      error: null,
    });
    await expect(render()).rejects.toThrow(NotFoundError);
  });

  it("DISTINCTION CONTROL: renders when all three gates pass, so the 404 tests above are not passing on a page that always 404s", async () => {
    const text = await render();
    expect(text).toContain("Model withdrawal form");
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("withdrawal form page — Q7 wording", () => {
  it("renders the artist's real trading name, address and contact, not placeholders", async () => {
    const text = await render();
    expect(text).toContain("Mika Ink Studio");
    expect(text).toContain("12 Ink Street, Berlin, Germany");
    expect(text).toContain("mika@example.com");
    // Counsel Q7: "Render the artist's name and address into the form, not
    // placeholders." The buyer's OWN fields stay as placeholders (they are
    // the ones filling them in); the SELLER's must never be.
    expect(text).not.toContain("[seller");
    expect(text).not.toContain("[artist");
    expect(text).not.toContain("[address of the trader]");
  });

  it("keeps the buyer's own fields as fill-in placeholders", async () => {
    const text = await render();
    expect(text).toContain("[your name]");
    expect(text).toContain("[your address]");
    expect(text).toContain("[date]");
  });

  it("names Inklee as an alternative recipient AND states the forwarding rule counsel conditioned that on", async () => {
    const text = await render();
    expect(text).toContain(`or Inklee (${SUPPORT_INBOX_EMAIL})`);
    expect(text).toContain(withdrawalForwardingNotice(SUPPORT_INBOX_EMAIL));
    expect(text).toContain("without delay");
    expect(text).toContain("counts as received on the day Inklee receives it");
  });

  it("carries the Annex I(B) statements in order", async () => {
    const text = await render();
    for (const line of modelWithdrawalFormLines(SELLER, {
      supportEmail: SUPPORT_INBOX_EMAIL,
    })) {
      expect(text).toContain(line.text);
    }
    const withdrawIdx = text.indexOf("I/we hereby give notice");
    const nameIdx = text.indexOf("Name of consumer(s):");
    const dateIdx = text.lastIndexOf("Date:");
    expect(withdrawIdx).toBeGreaterThan(-1);
    expect(nameIdx).toBeGreaterThan(withdrawIdx);
    expect(dateIdx).toBeGreaterThan(nameIdx);
  });

  it("says the form is optional, and that any clear statement works", async () => {
    const text = await render();
    expect(text).toContain("You do not have to use this form.");
    expect(text).toContain("Any clear statement that you are withdrawing");
  });

  it("still tells the buyer the custom-made carve-out applies", async () => {
    const text = await render();
    expect(text).toContain(
      'Items marked "custom-made" are not covered by this right of return.',
    );
  });

  it("obeys the house copy rules: no em-dash anywhere a buyer can read", async () => {
    expect(await render()).not.toContain("—");
  });
});

describe("withdrawal form page — no drift from the reproduced copy (Q6)", () => {
  it("renders exactly the text the receipt reproduces, line for line", async () => {
    const text = await render();
    const reproduced = modelWithdrawalFormText(SELLER, {
      supportEmail: SUPPORT_INBOX_EMAIL,
    });
    // Every paragraph of the emailed copy must be present on the page. If
    // either surface is ever hand-edited away from the shared source, one of
    // these paragraphs stops matching.
    for (const paragraph of reproduced.split("\n\n")) {
      for (const chunk of paragraph.split("\n")) {
        expect(text).toContain(chunk);
      }
    }
  });
});

describe("withdrawal form page — metadata", () => {
  it("is noindex, nofollow (a per-artist legal template is not a search result)", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
