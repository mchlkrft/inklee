import { describe, it, expect } from "vitest";
import { normalizeProductInput, normalizeVariantsInput } from "../mobile-goods";

const base = { title: "Risograph print", price: 25 };

describe("normalizeProductInput", () => {
  it("accepts a valid payload and normalizes optional fields + defaults", () => {
    const r = normalizeProductInput({
      ...base,
      description: "  A5 two-colour  ",
      category: "print",
      status: "active",
      currency: "USD",
      pickupNote: "  pick up at the studio ",
      quantity: 10,
      isPublicVisible: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.price).toBe(25);
      expect(r.value.currency).toBe("usd"); // lowercased
      expect(r.value.category).toBe("print");
      expect(r.value.description).toBe("A5 two-colour");
      expect(r.value.quantity).toBe(10);
      expect(r.value.isPublicVisible).toBe(true);
    }
  });

  it("rounds price to cents and defaults currency/category/status", () => {
    const r = normalizeProductInput({ ...base, price: 19.999 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.price).toBe(20);
      expect(r.value.currency).toBe("eur");
      expect(r.value.category).toBe("other");
      expect(r.value.status).toBe("active");
      expect(r.value.isPublicVisible).toBe(false); // fail-closed when absent
    }
  });

  it("coerces an unknown category/status/currency to safe defaults", () => {
    const r = normalizeProductInput({
      ...base,
      category: "nft",
      status: "draft",
      currency: "doge",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.category).toBe("other");
      expect(r.value.status).toBe("active");
      expect(r.value.currency).toBe("eur");
    }
  });

  it("rejects a missing title, a non-positive/over-cap price, and a bad quantity", () => {
    expect(normalizeProductInput({ title: " ", price: 10 }).ok).toBe(false);
    expect(normalizeProductInput({ title: "X", price: -1 }).ok).toBe(false);
    expect(normalizeProductInput({ title: "X", price: "10" }).ok).toBe(false);
    expect(normalizeProductInput({ title: "X", price: 200000 }).ok).toBe(false);
    expect(
      normalizeProductInput({ title: "X", price: 10, quantity: -2 }).ok,
    ).toBe(false);
    expect(
      normalizeProductInput({ title: "X", price: 10, quantity: 1.5 }).ok,
    ).toBe(false);
  });
});

describe("normalizeVariantsInput", () => {
  it("accepts a whole-list payload, dropping nameless rows", () => {
    const r = normalizeVariantsInput({
      variants: [
        { id: null, name: " M ", priceOverride: null, stock: 5 },
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "L",
          priceOverride: 27.5,
          stock: null,
        },
        { id: null, name: "   ", priceOverride: 1, stock: 1 },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual([
        { id: null, name: "M", priceOverride: null, stock: 5 },
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "L",
          priceOverride: 27.5,
          stock: null,
        },
      ]);
    }
  });

  it("rejects bad price overrides and stock values with the variant named", () => {
    expect(
      normalizeVariantsInput({
        variants: [{ id: null, name: "M", priceOverride: -1, stock: null }],
      }),
    ).toEqual({
      ok: false,
      error: 'Variant "M": price must be a positive number.',
    });
    expect(
      normalizeVariantsInput({
        variants: [{ id: null, name: "M", priceOverride: null, stock: 1.5 }],
      }),
    ).toEqual({ ok: false, error: 'Variant "M": stock must be 0 or more.' });
  });

  it("rejects a non-array payload and caps the list at MAX_VARIANTS", () => {
    expect(normalizeVariantsInput({ variants: "nope" })).toEqual({
      ok: false,
      error: "variants must be an array.",
    });
    const r = normalizeVariantsInput({
      variants: Array.from({ length: 30 }, (_, i) => ({
        id: null,
        name: `v${i}`,
        priceOverride: null,
        stock: null,
      })),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toHaveLength(20);
  });
});
