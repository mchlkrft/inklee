import { describe, it, expect } from "vitest";
import {
  computeInterestRows,
  parseInterestSelections,
  MAX_INTEREST_QUANTITY,
} from "../booking-interests";
import type { AddonProduct } from "../orders";

const shirt: AddonProduct = {
  id: "p-shirt",
  title: "Studio shirt",
  price: 30,
  currency: "eur",
  status: "active",
  isCheckoutAddon: true,
  quantity: null,
  variants: [
    { id: "v-s", name: "S", priceOverride: null, stock: 2, status: "active" },
    { id: "v-l", name: "L", priceOverride: 35, stock: null, status: "active" },
    { id: "v-x", name: "XL", priceOverride: null, stock: 0, status: "hidden" },
  ],
};

const print: AddonProduct = {
  id: "p-print",
  title: "A4 print",
  price: 15,
  currency: "eur",
  status: "active",
  isCheckoutAddon: true,
  quantity: 5,
  variants: [],
};

const products = [shirt, print];

function ok(r: ReturnType<typeof computeInterestRows>) {
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
  return r;
}

describe("parseInterestSelections", () => {
  it("returns [] for non-string / empty / invalid JSON", () => {
    expect(parseInterestSelections(undefined)).toEqual([]);
    expect(parseInterestSelections("")).toEqual([]);
    expect(parseInterestSelections("not-json")).toEqual([]);
    expect(parseInterestSelections('{"not":"array"}')).toEqual([]);
  });

  it("coerces fields and drops zero-quantity / blank productId entries", () => {
    const raw = JSON.stringify([
      { productId: "p1", variantId: "v1", quantity: 2 },
      { productId: "p2", variantId: null, quantity: 0 }, // dropped
      { productId: "", variantId: null, quantity: 3 }, // dropped
      { productId: "p3", quantity: "1" }, // coerces
    ]);
    expect(parseInterestSelections(raw)).toEqual([
      { productId: "p1", variantId: "v1", quantity: 2 },
      { productId: "p3", variantId: null, quantity: 1 },
    ]);
  });
});

describe("computeInterestRows", () => {
  it("returns an empty row set for empty selections", () => {
    const r = ok(computeInterestRows(products, []));
    expect(r.rows).toEqual([]);
  });

  it("snapshots a variant-less product line with unitPrice", () => {
    const r = ok(
      computeInterestRows(products, [
        { productId: "p-print", variantId: null, quantity: 2 },
      ]),
    );
    expect(r.rows[0]).toMatchObject({
      productId: "p-print",
      variantId: null,
      titleSnapshot: "A4 print",
      variantSnapshot: null,
      unitPrice: 15,
      quantity: 2,
    });
  });

  it("uses the variant priceOverride and snapshots the variant name", () => {
    const r = ok(
      computeInterestRows(products, [
        { productId: "p-shirt", variantId: "v-l", quantity: 1 },
      ]),
    );
    expect(r.rows[0]).toMatchObject({
      variantId: "v-l",
      variantSnapshot: "L",
      unitPrice: 35,
    });
  });

  it("merges duplicate (product, variant) entries into one row", () => {
    const r = ok(
      computeInterestRows(products, [
        { productId: "p-print", variantId: null, quantity: 1 },
        { productId: "p-print", variantId: null, quantity: 2 },
      ]),
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].quantity).toBe(3);
  });

  it("requires a variant for a product that has options", () => {
    const r = computeInterestRows(products, [
      { productId: "p-shirt", variantId: null, quantity: 1 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects a variant on a product with no options", () => {
    const r = computeInterestRows(products, [
      { productId: "p-print", variantId: "v-s", quantity: 1 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects an inactive variant", () => {
    const r = computeInterestRows(products, [
      { productId: "p-shirt", variantId: "v-x", quantity: 1 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects unknown or hidden products", () => {
    expect(
      computeInterestRows(products, [
        { productId: "ghost", variantId: null, quantity: 1 },
      ]).ok,
    ).toBe(false);
    const hidden: AddonProduct = { ...print, id: "p-h", status: "hidden" };
    expect(
      computeInterestRows(
        [hidden],
        [{ productId: "p-h", variantId: null, quantity: 1 }],
      ).ok,
    ).toBe(false);
  });

  it("accepts non-addon products (interest is broader than checkout)", () => {
    // Interest signalling intentionally decoupled from is_checkout_addon —
    // the artist still sees what the client wanted even for non-addon items.
    const notAddon: AddonProduct = {
      ...print,
      id: "p-n",
      isCheckoutAddon: false,
    };
    const r = ok(
      computeInterestRows(
        [notAddon],
        [{ productId: "p-n", variantId: null, quantity: 1 }],
      ),
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].productId).toBe("p-n");
  });

  it("rejects exceeding variant stock (combined across duplicates)", () => {
    const r = computeInterestRows(products, [
      { productId: "p-shirt", variantId: "v-s", quantity: 2 },
      { productId: "p-shirt", variantId: "v-s", quantity: 2 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects exceeding product-level stock", () => {
    const r = computeInterestRows(products, [
      { productId: "p-print", variantId: null, quantity: 6 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects qty over the per-item max (combined across duplicates)", () => {
    const r = computeInterestRows(products, [
      { productId: "p-print", variantId: null, quantity: 6 },
      { productId: "p-print", variantId: null, quantity: 6 },
    ]);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/at most/i);
    void MAX_INTEREST_QUANTITY; // re-export sanity
  });
});
