import { describe, it, expect } from "vitest";
import {
  computeAddonLines,
  MAX_ADDON_QUANTITY,
  type AddonProduct,
} from "../orders";

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

function ok(r: ReturnType<typeof computeAddonLines>) {
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
  return r;
}

describe("computeAddonLines", () => {
  it("returns no lines and zero for empty / zero-qty selections", () => {
    expect(computeAddonLines(products, [])).toEqual({
      ok: true,
      lines: [],
      goodsAmount: 0,
    });
    const r = ok(
      computeAddonLines(products, [
        { productId: "p-print", variantId: null, quantity: 0 },
      ]),
    );
    expect(r.lines).toHaveLength(0);
    expect(r.goodsAmount).toBe(0);
  });

  it("computes a variant-less product line", () => {
    const r = ok(
      computeAddonLines(products, [
        { productId: "p-print", variantId: null, quantity: 2 },
      ]),
    );
    expect(r.goodsAmount).toBe(30);
    expect(r.lines[0]).toMatchObject({
      productId: "p-print",
      variantId: null,
      variantSnapshot: null,
      quantity: 2,
      unitAmount: 15,
      totalAmount: 30,
    });
  });

  it("uses the variant price override and snapshots the name", () => {
    const r = ok(
      computeAddonLines(products, [
        { productId: "p-shirt", variantId: "v-l", quantity: 1 },
      ]),
    );
    expect(r.lines[0]).toMatchObject({
      variantId: "v-l",
      variantSnapshot: "L",
      unitAmount: 35,
      totalAmount: 35,
    });
  });

  it("falls back to the product price when the variant has no override", () => {
    const r = ok(
      computeAddonLines(products, [
        { productId: "p-shirt", variantId: "v-s", quantity: 2 },
      ]),
    );
    expect(r.lines[0]).toMatchObject({ unitAmount: 30, totalAmount: 60 });
  });

  it("sums multiple lines", () => {
    const r = ok(
      computeAddonLines(products, [
        { productId: "p-print", variantId: null, quantity: 1 },
        { productId: "p-shirt", variantId: "v-l", quantity: 1 },
      ]),
    );
    expect(r.goodsAmount).toBe(50);
  });

  it("requires a variant for a product that has options", () => {
    const r = computeAddonLines(products, [
      { productId: "p-shirt", variantId: null, quantity: 1 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects a variant on a product with no options", () => {
    const r = computeAddonLines(products, [
      { productId: "p-print", variantId: "v-s", quantity: 1 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects exceeding variant stock", () => {
    const r = computeAddonLines(products, [
      { productId: "p-shirt", variantId: "v-s", quantity: 3 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects exceeding product-level stock", () => {
    const r = computeAddonLines(products, [
      { productId: "p-print", variantId: null, quantity: 6 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects a hidden/inactive variant", () => {
    const r = computeAddonLines(products, [
      { productId: "p-shirt", variantId: "v-x", quantity: 1 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects unknown, non-addon, or non-active products", () => {
    expect(
      computeAddonLines(products, [
        { productId: "ghost", variantId: null, quantity: 1 },
      ]).ok,
    ).toBe(false);
    const hidden: AddonProduct = { ...print, id: "p-h", status: "hidden" };
    expect(
      computeAddonLines(
        [hidden],
        [{ productId: "p-h", variantId: null, quantity: 1 }],
      ).ok,
    ).toBe(false);
    const notAddon: AddonProduct = {
      ...print,
      id: "p-n",
      isCheckoutAddon: false,
    };
    expect(
      computeAddonLines(
        [notAddon],
        [{ productId: "p-n", variantId: null, quantity: 1 }],
      ).ok,
    ).toBe(false);
  });

  it("rejects quantities over the per-item max", () => {
    const r = computeAddonLines(products, [
      {
        productId: "p-print",
        variantId: null,
        quantity: MAX_ADDON_QUANTITY + 1,
      },
    ]);
    expect(r.ok).toBe(false);
  });
});
