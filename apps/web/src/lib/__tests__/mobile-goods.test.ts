import { describe, it, expect } from "vitest";
import { normalizeProductInput } from "../mobile-goods";

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
