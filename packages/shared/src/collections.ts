// Product collections (Plus build P5d).
//
// Grouping for the public shop. Modelled on flash folders, which already solve
// this exact shape here: a name, a position, and a nullable pointer on the
// item. Deliberately NOT a many-to-many. A product belongs to at most one
// collection, because the artist-facing question "which section is this in?"
// has one answer, and multi-membership would need an ordering story per
// collection and a UI to manage it, for a case nobody has asked for.

export const COLLECTION_NAME_MAX = 60;
/** A shop with more sections than this is a navigation problem, not a
 *  catalogue. The cap exists so the public grouping stays scannable. */
export const MAX_COLLECTIONS = 20;

export type ProductCollection = {
  id: string;
  name: string;
  position: number;
  isPublicVisible: boolean;
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
 *  - A hidden collection's products fall into the ungrouped remainder rather
 *    than disappearing. Hiding a section is a layout decision, not a decision
 *    to unpublish stock, and silently removing a purchasable product from a
 *    shop is the kind of thing an artist discovers from a lost sale.
 *  - An EMPTY collection is dropped, so staging a section for a future drop
 *    does not leave a bare heading on the public page.
 *  - The ungrouped remainder comes last and carries no heading, so a shop
 *    that uses no collections at all looks exactly as it does today.
 */
export function groupProductsByCollection<
  T extends { collectionId?: string | null },
>(products: T[], collections: ProductCollection[]): CollectionGroup<T>[] {
  const visible = collections
    .filter((c) => c.isPublicVisible)
    .sort((a, b) => a.position - b.position);
  const visibleIds = new Set(visible.map((c) => c.id));

  const groups: CollectionGroup<T>[] = [];
  for (const c of visible) {
    const items = products.filter((p) => p.collectionId === c.id);
    if (items.length > 0) groups.push({ collection: c, products: items });
  }

  const ungrouped = products.filter(
    (p) => !p.collectionId || !visibleIds.has(p.collectionId),
  );
  if (ungrouped.length > 0) {
    groups.push({ collection: null, products: ungrouped });
  }
  return groups;
}
