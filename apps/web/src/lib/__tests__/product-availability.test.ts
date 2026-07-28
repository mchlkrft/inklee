import { describe, it, expect } from "vitest";
import {
  productAvailability,
  availabilityLabel,
  shouldAlertLowStock,
} from "@inklee/shared/product-availability";

const NOW = Date.parse("2026-07-15T12:00:00Z");
const FUTURE = "2026-08-01T18:00:00Z";
const PAST = "2026-07-01T18:00:00Z";

const p = (over: Partial<Parameters<typeof productAvailability>[0]> = {}) =>
  productAvailability(
    {
      status: "active",
      availableFrom: null,
      preorder: false,
      stockQuantity: null,
      ...over,
    },
    NOW,
  );

describe("productAvailability", () => {
  it("is available by default, which is every pre-drop product", () => {
    expect(p()).toEqual({ state: "available", purchasable: true });
  });

  it("is upcoming and NOT purchasable before its drop", () => {
    expect(p({ availableFrom: FUTURE })).toEqual({
      state: "upcoming",
      purchasable: false,
      availableFrom: FUTURE,
    });
  });

  it("is available once the drop time has passed", () => {
    expect(p({ availableFrom: PAST })).toMatchObject({ state: "available" });
  });

  // Preorder is what makes an announced product buyable early. Without it, an
  // upcoming product is a queue, which is the artist's other choice.
  it("is purchasable before the drop when preorder is on", () => {
    expect(p({ availableFrom: FUTURE, preorder: true })).toMatchObject({
      state: "preorder",
      purchasable: true,
    });
  });

  it("blocks on exhausted tracked stock", () => {
    expect(p({ stockQuantity: 0 })).toEqual({
      state: "sold_out",
      purchasable: false,
    });
  });

  it("ignores stock when it is untracked, which is most artist goods", () => {
    expect(p({ stockQuantity: null })).toMatchObject({ state: "available" });
  });

  it("lets preorder sell past zero, the more-coming case", () => {
    expect(p({ stockQuantity: 0, preorder: true })).toMatchObject({
      state: "preorder",
      purchasable: true,
    });
  });

  it("honours an explicit sold_out status", () => {
    expect(p({ status: "sold_out" })).toMatchObject({ state: "sold_out" });
  });

  it("refuses anything that is not on sale at all", () => {
    for (const status of ["archived", "draft", "nonsense"]) {
      expect(p({ status }), status).toEqual({
        state: "unavailable",
        purchasable: false,
      });
    }
  });

  // The failure mode of bad data must be a product the artist can sell, not
  // one silently frozen out of their own shop.
  it("treats an unparseable drop time as no drop time", () => {
    expect(p({ availableFrom: "not-a-date" })).toMatchObject({
      state: "available",
      purchasable: true,
    });
  });

  it("opens exactly AT the drop instant, not a moment later", () => {
    const at = productAvailability(
      {
        status: "active",
        availableFrom: "2026-07-15T12:00:00Z",
        preorder: false,
        stockQuantity: null,
      },
      NOW,
    );
    expect(at).toMatchObject({ state: "available", purchasable: true });
  });
});

describe("availabilityLabel", () => {
  const fmt = (iso: string) => iso.slice(0, 10);
  it("names the drop date", () => {
    expect(availabilityLabel(p({ availableFrom: FUTURE }), fmt)).toBe(
      "Drops 2026-08-01",
    );
  });
  it("labels preorder and sold out", () => {
    expect(
      availabilityLabel(p({ availableFrom: FUTURE, preorder: true }), fmt),
    ).toBe("Preorder");
    expect(availabilityLabel(p({ stockQuantity: 0 }), fmt)).toBe("Sold out");
  });
  it("gives an ordinary product no badge", () => {
    expect(availabilityLabel(p(), fmt)).toBeNull();
  });
  it("contains no em-dash (founder copy rule)", () => {
    expect(availabilityLabel(p({ availableFrom: FUTURE }), fmt)).not.toContain(
      "—",
    );
  });
});

describe("shouldAlertLowStock", () => {
  it("fires when a sale takes stock to the threshold", () => {
    expect(
      shouldAlertLowStock({
        threshold: 3,
        stockAfter: 3,
        alreadyAlerted: false,
      }),
    ).toBe(true);
  });

  it("does not fire above the threshold", () => {
    expect(
      shouldAlertLowStock({
        threshold: 3,
        stockAfter: 4,
        alreadyAlerted: false,
      }),
    ).toBe(false);
  });

  // An artist selling ten of a low-stocked item wants one notification, not
  // ten. The alerted stamp is what makes that true.
  it("does not fire again while already alerted", () => {
    expect(
      shouldAlertLowStock({
        threshold: 3,
        stockAfter: 1,
        alreadyAlerted: true,
      }),
    ).toBe(false);
  });

  it("never fires without a threshold or without tracked stock", () => {
    expect(
      shouldAlertLowStock({
        threshold: null,
        stockAfter: 0,
        alreadyAlerted: false,
      }),
    ).toBe(false);
    expect(
      shouldAlertLowStock({
        threshold: 3,
        stockAfter: null,
        alreadyAlerted: false,
      }),
    ).toBe(false);
  });

  it("fires at zero, which is the sold-out case", () => {
    expect(
      shouldAlertLowStock({
        threshold: 0,
        stockAfter: 0,
        alreadyAlerted: false,
      }),
    ).toBe(true);
  });
});
