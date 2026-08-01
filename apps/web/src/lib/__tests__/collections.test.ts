import { describe, it, expect } from "vitest";
import {
  normalizeCollectionName,
  validateCollectionName,
  groupProductsByCollection,
  canDeleteCollection,
  isCollectionPublic,
  liveCollections,
  archivedCollections,
  resolveFeaturedCollections,
  COLLECTION_NAME_MAX,
  type ProductCollection,
  type CollectionMembership,
} from "@inklee/shared/collections";

const col = (
  id: string,
  position: number,
  isPublicVisible = true,
  archivedAt: string | null = null,
): ProductCollection => ({
  id,
  name: `C${id}`,
  position,
  isPublicVisible,
  archivedAt,
});

const prod = (id: string) => ({ id });

/** `in("c", ["p1", "p2"])` reads as the artist's arrangement of that section. */
const inC = (
  collectionId: string,
  productIds: string[],
): CollectionMembership[] =>
  productIds.map((productId, position) => ({
    collectionId,
    productId,
    position,
  }));

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

describe("archive state", () => {
  it("treats visible-but-archived as not public", () => {
    expect(isCollectionPublic(col("a", 0, true, "2026-07-29T00:00:00Z"))).toBe(
      false,
    );
  });
  it("treats hidden-and-live as not public", () => {
    expect(isCollectionPublic(col("a", 0, false))).toBe(false);
  });
  it("splits live from archived, each in artist order", () => {
    const all = [
      col("b", 1),
      col("old", 2, true, "2026-07-01T00:00:00Z"),
      col("a", 0),
    ];
    expect(liveCollections(all).map((c) => c.id)).toEqual(["a", "b"]);
    expect(archivedCollections(all).map((c) => c.id)).toEqual(["old"]);
  });
});

describe("canDeleteCollection", () => {
  it("allows deleting an empty collection", () => {
    expect(canDeleteCollection(col("a", 0), 0)).toBe(true);
  });
  // Membership and per-collection ordering are arranging work, and nothing
  // restores them. Archive keeps them; delete waits.
  it("refuses a populated LIVE collection", () => {
    expect(canDeleteCollection(col("a", 0), 3)).toBe(false);
  });
  it("allows a populated ARCHIVED collection, as the deliberate second act", () => {
    expect(
      canDeleteCollection(col("a", 0, true, "2026-07-29T00:00:00Z"), 3),
    ).toBe(true);
  });
});

describe("groupProductsByCollection", () => {
  it("returns one unnamed group when there are no collections", () => {
    const groups = groupProductsByCollection([prod("p1"), prod("p2")], [], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].collection).toBeNull();
    expect(groups[0].products).toHaveLength(2);
  });

  // The flat-shop fallback. An unentitled artist and a killed capability both
  // resolve to empty arrays, and the shop must look exactly as it does with no
  // collections at all: every product present, no headings.
  it("is the flat shop when collections are withheld", () => {
    const products = [prod("p1"), prod("p2"), prod("p3")];
    const groups = groupProductsByCollection(products, [], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].collection).toBeNull();
    expect(groups[0].products.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("keeps the ARTIST's order, not alphabetical", () => {
    const groups = groupProductsByCollection(
      [prod("p1"), prod("p2")],
      [col("a", 5), col("b", 1)],
      [...inC("b", ["p1"]), ...inC("a", ["p2"])],
    );
    expect(groups.map((g) => g.collection?.id)).toEqual(["b", "a"]);
  });

  // The reason the join table exists.
  it("puts ONE product in TWO collections, in each section's own order", () => {
    const groups = groupProductsByCollection(
      [prod("p1"), prod("p2")],
      [col("a", 0), col("b", 1)],
      [...inC("a", ["p1", "p2"]), ...inC("b", ["p2", "p1"])],
    );
    expect(groups[0].products.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(groups[1].products.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("orders within a collection by that membership's position, not shop order", () => {
    const groups = groupProductsByCollection(
      [prod("p1"), prod("p2"), prod("p3")],
      [col("a", 0)],
      inC("a", ["p3", "p1", "p2"]),
    );
    expect(groups[0].products.map((p) => p.id)).toEqual(["p3", "p1", "p2"]);
  });

  it("puts the ungrouped remainder last, with no heading", () => {
    const groups = groupProductsByCollection(
      [prod("p1"), prod("p2")],
      [col("a", 0)],
      inC("a", ["p2"]),
    );
    expect(groups.map((g) => g.collection?.id ?? null)).toEqual(["a", null]);
  });

  // Hiding a section is a layout decision, not a decision to unpublish stock.
  // Silently removing a purchasable product from a shop is the kind of thing
  // an artist discovers from a lost sale.
  it("moves a hidden collection's products into the remainder, never drops them", () => {
    const groups = groupProductsByCollection(
      [prod("p1"), prod("p2")],
      [col("shown", 0), col("hidden", 1, false)],
      [...inC("hidden", ["p1"]), ...inC("shown", ["p2"])],
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].collection?.id).toBe("shown");
    expect(groups[1].collection).toBeNull();
    expect(groups[1].products.map((p) => p.id)).toEqual(["p1"]);
  });

  it("does the same for an ARCHIVED collection", () => {
    const groups = groupProductsByCollection(
      [prod("p1")],
      [col("old", 0, true, "2026-07-29T00:00:00Z")],
      inC("old", ["p1"]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].collection).toBeNull();
    expect(groups[0].products.map((p) => p.id)).toEqual(["p1"]);
  });

  // A product in BOTH a visible and a hidden section is already rendered, so
  // it must not also appear in the remainder.
  it("does not duplicate a product that is in one visible and one hidden section", () => {
    const groups = groupProductsByCollection(
      [prod("p1")],
      [col("shown", 0), col("hidden", 1, false)],
      [...inC("shown", ["p1"]), ...inC("hidden", ["p1"])],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].collection?.id).toBe("shown");
    expect(groups[0].products.map((p) => p.id)).toEqual(["p1"]);
  });

  // Staging a section for a future drop must not leave a bare heading on the
  // public page.
  it("drops an empty collection", () => {
    const groups = groupProductsByCollection(
      [prod("p1")],
      [col("a", 0), col("empty", 1)],
      inC("a", ["p1"]),
    );
    expect(groups.map((g) => g.collection?.id)).toEqual(["a"]);
  });

  // A membership can name a product that is draft, hidden or out of the
  // queried set. Rendering a hole would be worse than the section being short.
  it("skips a membership whose product is not in the visible set", () => {
    const groups = groupProductsByCollection(
      [prod("p1")],
      [col("a", 0)],
      inC("a", ["p1", "not-here"]),
    );
    expect(groups[0].products.map((p) => p.id)).toEqual(["p1"]);
  });

  it("treats a membership naming a deleted collection as ungrouped", () => {
    const groups = groupProductsByCollection(
      [prod("p1")],
      [col("a", 0)],
      inC("gone", ["p1"]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].collection).toBeNull();
  });

  it("returns nothing at all for an empty shop", () => {
    expect(groupProductsByCollection([], [col("a", 0)], [])).toEqual([]);
  });

  it("never loses a product", () => {
    const products = [
      prod("p1"),
      prod("p2"),
      prod("p3"),
      prod("p4"),
      prod("p5"),
    ];
    const groups = groupProductsByCollection(
      products,
      [col("a", 0), col("b", 1), col("hidden", 2, false)],
      [
        ...inC("a", ["p1"]),
        ...inC("b", ["p2"]),
        ...inC("hidden", ["p4"]),
        ...inC("gone", ["p5"]),
      ],
    );
    const seen = groups.flatMap((g) => g.products.map((p) => p.id)).sort();
    expect(seen).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });
});

describe("resolveFeaturedCollections (FD10 surface content)", () => {
  const visible = new Set(["p1", "p2", "p3"]);

  it("resolves in the artist's FEATURED order, not the collection's shop position", () => {
    const collections = [col("a", 0), col("b", 1)];
    const memberships = [...inC("a", ["p1"]), ...inC("b", ["p2"])];
    // "b" is featured before "a", the reverse of shop position.
    const featured = resolveFeaturedCollections(
      ["b", "a"],
      collections,
      memberships,
      visible,
    );
    expect(featured.map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("drops a dangling reference (id not found at all)", () => {
    const featured = resolveFeaturedCollections(
      ["gone"],
      [col("a", 0)],
      inC("a", ["p1"]),
      visible,
    );
    expect(featured).toEqual([]);
  });

  it("drops an archived collection", () => {
    const featured = resolveFeaturedCollections(
      ["a"],
      [col("a", 0, true, "2026-01-01T00:00:00Z")],
      inC("a", ["p1"]),
      visible,
    );
    expect(featured).toEqual([]);
  });

  it("drops a hidden (not public) collection", () => {
    const featured = resolveFeaturedCollections(
      ["a"],
      [col("a", 0, false)],
      inC("a", ["p1"]),
      visible,
    );
    expect(featured).toEqual([]);
  });

  it("drops a collection whose only members are outside the visible product set (sold through / hidden)", () => {
    const featured = resolveFeaturedCollections(
      ["a"],
      [col("a", 0)],
      inC("a", ["p9"]), // not in `visible`
      visible,
    );
    expect(featured).toEqual([]);
  });

  it("counts only visible products, not every membership row", () => {
    const featured = resolveFeaturedCollections(
      ["a"],
      [col("a", 0)],
      inC("a", ["p1", "p2", "p9"]), // p9 is not visible
      visible,
    );
    expect(featured).toEqual([{ id: "a", name: "Ca", productCount: 2 }]);
  });

  it("an empty featuredCollectionIds list resolves to nothing", () => {
    expect(
      resolveFeaturedCollections([], [col("a", 0)], inC("a", ["p1"]), visible),
    ).toEqual([]);
  });
});
