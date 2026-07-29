import { describe, it, expect } from "vitest";
import {
  normalizeCollectionName,
  validateCollectionName,
  groupProductsByCollection,
  COLLECTION_NAME_MAX,
  type ProductCollection,
} from "@inklee/shared/collections";

const col = (
  id: string,
  position: number,
  isPublicVisible = true,
): ProductCollection => ({ id, name: `C${id}`, position, isPublicVisible });

const prod = (id: string, collectionId: string | null) => ({
  id,
  collectionId,
});

describe("normalizeCollectionName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeCollectionName("  Winter   drop ")).toBe("Winter drop");
  });
  it("truncates rather than rejecting", () => {
    expect(normalizeCollectionName("x".repeat(200))).toHaveLength(
      COLLECTION_NAME_MAX,
    );
  });
  it("returns empty for non-strings", () => {
    expect(normalizeCollectionName(null)).toBe("");
  });
});

describe("validateCollectionName", () => {
  it("accepts a real name", () => {
    expect(validateCollectionName("Prints")).toBeNull();
  });
  it("rejects an empty or one-character name", () => {
    expect(validateCollectionName("")).toBeTruthy();
    expect(validateCollectionName("P")).toBeTruthy();
  });
});

describe("groupProductsByCollection", () => {
  it("returns one unnamed group when there are no collections", () => {
    const groups = groupProductsByCollection(
      [prod("p1", null), prod("p2", null)],
      [],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].collection).toBeNull();
    expect(groups[0].products).toHaveLength(2);
  });

  it("keeps the ARTIST's order, not alphabetical", () => {
    const groups = groupProductsByCollection(
      [prod("p1", "b"), prod("p2", "a")],
      [col("a", 5), col("b", 1)],
    );
    expect(groups.map((g) => g.collection?.id)).toEqual(["b", "a"]);
  });

  it("puts the ungrouped remainder last, with no heading", () => {
    const groups = groupProductsByCollection(
      [prod("p1", null), prod("p2", "a")],
      [col("a", 0)],
    );
    expect(groups.map((g) => g.collection?.id ?? null)).toEqual(["a", null]);
  });

  // Hiding a section is a layout decision, not a decision to unpublish stock.
  // Silently removing a purchasable product from a shop is the kind of thing
  // an artist discovers from a lost sale.
  it("moves a hidden collection's products into the remainder, never drops them", () => {
    const groups = groupProductsByCollection(
      [prod("p1", "hidden"), prod("p2", "shown")],
      [col("shown", 0), col("hidden", 1, false)],
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].collection?.id).toBe("shown");
    expect(groups[1].collection).toBeNull();
    expect(groups[1].products.map((p) => p.id)).toEqual(["p1"]);
  });

  // Staging a section for a future drop must not leave a bare heading on the
  // public page.
  it("drops an empty collection", () => {
    const groups = groupProductsByCollection(
      [prod("p1", "a")],
      [col("a", 0), col("empty", 1)],
    );
    expect(groups.map((g) => g.collection?.id)).toEqual(["a"]);
  });

  it("treats a product pointing at a deleted collection as ungrouped", () => {
    const groups = groupProductsByCollection(
      [prod("p1", "gone")],
      [col("a", 0)],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].collection).toBeNull();
  });

  it("returns nothing at all for an empty shop", () => {
    expect(groupProductsByCollection([], [col("a", 0)])).toEqual([]);
  });

  it("never loses or duplicates a product", () => {
    const products = [
      prod("p1", "a"),
      prod("p2", "b"),
      prod("p3", null),
      prod("p4", "hidden"),
      prod("p5", "gone"),
    ];
    const groups = groupProductsByCollection(products, [
      col("a", 0),
      col("b", 1),
      col("hidden", 2, false),
    ]);
    const seen = groups.flatMap((g) => g.products.map((p) => p.id)).sort();
    expect(seen).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });
});
