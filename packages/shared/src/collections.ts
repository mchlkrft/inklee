// Product collections (Plus build P5d).
//
// Grouping for the public shop. MANY-TO-MANY: a product can sit in "Prints"
// and in "Winter drop" at the same time, and each section owns its own order.
//
// An earlier version of this file was one-to-one, modelled on flash folders,
// with a comment arguing that "which section is this in?" has one answer. It
// does not. A print that is also part of a seasonal drop belongs in both, and
// the one-to-one model forced the artist to choose. Membership and ordering
// now live in `product_collection_items` (migration 0122); the legacy
// `products.collection_id` still exists and is mirrored into the join table by
// a trigger until the contract migration drops it.

export const COLLECTION_NAME_MAX = 60;

// There is deliberately NO cap on the number of collections. The previous
// `MAX_COLLECTIONS = 20` was an invented product rule, and it was enforced
// where it did the most damage: on create, so an artist organising a large
// catalogue hit a wall mid-task with no way around it. If shop navigation
// needs limits, that is a design problem to solve in the layout, not a write
// the server refuses.

export type ProductCollection = {
  id: string;
  name: string;
  position: number;
  isPublicVisible: boolean;
  /** ISO timestamp, or null when live. Archived collections keep their
   *  membership and ordering so a restore brings the section back whole. */
  archivedAt?: string | null;
};

/** One product's place in one collection. The same product id can appear in
 *  several of these with different positions, which is the point. */
export type CollectionMembership = {
  collectionId: string;
  productId: string;
  position: number;
};

export function normalizeCollectionName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, COLLECTION_NAME_MAX);
}

export function validateCollectionName(name: string): string | null {
  if (name.length < 2) return "Give the collection a name.";
  if (name.length > COLLECTION_NAME_MAX) {
    return `Use at most ${COLLECTION_NAME_MAX} characters.`;
  }
  return null;
}

/** A collection is shown publicly only when it is both visible and not
 *  archived. Two different decisions, and either one alone hides the section. */
export function isCollectionPublic(c: ProductCollection): boolean {
  return c.isPublicVisible && !c.archivedAt;
}

/** The artist's working list: everything not archived, in their order. */
export function liveCollections(
  collections: ProductCollection[],
): ProductCollection[] {
  return collections
    .filter((c) => !c.archivedAt)
    .sort((a, b) => a.position - b.position);
}

export function archivedCollections(
  collections: ProductCollection[],
): ProductCollection[] {
  return collections
    .filter((c) => !!c.archivedAt)
    .sort((a, b) => a.position - b.position);
}

/**
 * Whether a collection may be hard-deleted.
 *
 * Deleting a non-empty collection destroys its membership AND its per-collection
 * ordering, which is arranging work the artist did by hand and which no undo
 * restores. Archiving keeps all of it. So a populated, live collection must be
 * archived first: that turns "delete" from a click that silently discards work
 * into a deliberate second act on something already set aside.
 *
 * Empty collections are freely deletable. There is nothing to lose, and making
 * someone archive a section they just mis-created would be pure ceremony.
 */
export function canDeleteCollection(
  c: ProductCollection,
  memberCount: number,
): boolean {
  return memberCount === 0 || !!c.archivedAt;
}

export type CollectionGroup<T> = {
  /** Null for the ungrouped remainder. */
  collection: ProductCollection | null;
  products: T[];
};

/**
 * Group products for the public shop.
 *
 * Rules that matter to the visitor rather than the artist:
 *
 *  - Collections keep the ARTIST's order, not alphabetical. They arranged it.
 *  - Within a collection, products keep THAT collection's order. The same
 *    product can lead one section and close another.
 *  - A product in two visible collections appears in both. That is the feature,
 *    not duplication to be cleaned up.
 *  - A hidden or archived collection's products fall into the ungrouped
 *    remainder rather than disappearing. Hiding a section is a layout decision,
 *    not a decision to unpublish stock, and silently removing a purchasable
 *    product from a shop is the kind of thing an artist discovers from a lost
 *    sale.
 *  - An EMPTY collection is dropped, so staging a section for a future drop
 *    does not leave a bare heading on the public page.
 *  - The ungrouped remainder comes last and carries no heading, so a shop that
 *    uses no collections at all looks exactly as it does today. Passing an
 *    empty `collections` array is therefore the flat-shop fallback, which is
 *    what an unentitled artist and a killed capability both resolve to.
 */
export function groupProductsByCollection<T extends { id: string }>(
  products: T[],
  collections: ProductCollection[],
  memberships: CollectionMembership[],
): CollectionGroup<T>[] {
  const visible = collections
    .filter(isCollectionPublic)
    .sort((a, b) => a.position - b.position);

  const byId = new Map(products.map((p) => [p.id, p]));
  const grouped = new Set<string>();

  const groups: CollectionGroup<T>[] = [];
  for (const c of visible) {
    const items = memberships
      .filter((m) => m.collectionId === c.id)
      .sort((a, b) => a.position - b.position)
      // A membership can name a product that is not in `products` at all: it
      // is out of stock, hidden, or draft. Dropping it here is what keeps the
      // section honest rather than rendering a hole.
      .map((m) => byId.get(m.productId))
      .filter((p): p is T => p !== undefined);

    if (items.length > 0) {
      groups.push({ collection: c, products: items });
      for (const p of items) grouped.add(p.id);
    }
  }

  // Anything that RENDERED in no visible section. Deliberately keyed on what
  // was actually emitted above rather than on "has no membership": a product
  // whose only collection is hidden, and one whose collection is visible but
  // which was dropped for being empty, both have memberships and both still
  // need to reach the remainder. Keeps the incoming product order, which is the
  // artist's shop-wide `sort_order`.
  const ungrouped = products.filter((p) => !grouped.has(p.id));
  if (ungrouped.length > 0) {
    groups.push({ collection: null, products: ungrouped });
  }
  return groups;
}
