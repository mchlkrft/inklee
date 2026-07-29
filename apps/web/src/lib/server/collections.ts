import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeCollectionName,
  validateCollectionName,
  canDeleteCollection,
  type ProductCollection,
  type CollectionMembership,
} from "@inklee/shared/collections";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsCollectionsAllowed } from "./entitlement-gates";

// The ONE write path for product collections (Plus build P5d), shared by the
// web action and the mobile routes, same discipline as every other core here:
// the entitlement is refused server-side rather than hidden in the UI.
//
// Everything below reads and writes MEMBERSHIP through `product_collection_items`.
// `products.collection_id` is never written by this module. A trigger mirrors
// legacy writes forward, one way, so an older client cannot desync the two
// models; the column is dropped in the contract migration.

export type CollectionWriteResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      code: "not_entitled" | "invalid" | "not_eligible" | "failed";
    };

async function requireEntitlement(
  artistId: string,
): Promise<CollectionWriteResult | null> {
  try {
    if (!goodsCollectionsAllowed(await getAccountOverrides(artistId))) {
      return {
        ok: false,
        code: "not_entitled",
        error: "Collections aren't included in your current plan.",
      };
    }
  } catch {
    return {
      ok: false,
      code: "failed",
      error: "Couldn't verify your plan. Please try again.",
    };
  }
  return null;
}

/** Next free slot at the end of the artist's live list. Read-then-write, so two
 *  simultaneous creates can land on the same number; that is a cosmetic tie in
 *  a hand-sorted list, not a correctness problem, and reordering fixes it. A
 *  unique constraint here would instead make the second create FAIL, which is
 *  the worse trade for something an artist is doing by hand. */
async function nextCollectionPosition(
  supabase: SupabaseClient,
  artistId: string,
): Promise<number> {
  const { data } = await supabase
    .from("product_collections")
    .select("position")
    .eq("artist_id", artistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const top = (data?.position as number | undefined) ?? -1;
  return top + 1;
}

export async function saveCollectionCore(
  supabase: SupabaseClient,
  artistId: string,
  input: { name?: unknown; isPublicVisible?: unknown },
  existingId?: string,
): Promise<CollectionWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  // SPARSE on update: only the keys actually present are written. The previous
  // version always sent both, so a caller toggling visibility silently reset
  // the name to whatever its form happened to hold, and a rename could flip
  // visibility back on. An absent key now means "leave it alone".
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const wantsName = input.name !== undefined;
  if (wantsName || !existingId) {
    const name = normalizeCollectionName(input.name);
    const nameError = validateCollectionName(name);
    if (nameError) return { ok: false, code: "invalid", error: nameError };
    row.name = name;
  }
  if (input.isPublicVisible !== undefined) {
    row.is_public_visible = input.isPublicVisible !== false;
  } else if (!existingId) {
    row.is_public_visible = true;
  }

  if (!existingId) {
    row.artist_id = artistId;
    row.position = await nextCollectionPosition(supabase, artistId);
  }

  const { data, error } = existingId
    ? await supabase
        .from("product_collections")
        .update(row)
        .eq("id", existingId)
        .eq("artist_id", artistId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("product_collections")
        .insert(row)
        .select("id")
        .single();

  if (error) return { ok: false, code: "failed", error: "Couldn't save." };
  if (!data) {
    return { ok: false, code: "failed", error: "That collection is gone." };
  }
  return { ok: true, id: data.id as string };
}

/** Reorder the artist's collections. Positions are rewritten to match the given
 *  order exactly, so a list that drifted (ties from concurrent creates, gaps
 *  from deletes) is normalised by any drag. Ids not owned by the artist are
 *  filtered by RLS, so a forged list cannot move someone else's section. */
export async function reorderCollectionsCore(
  supabase: SupabaseClient,
  artistId: string,
  orderedIds: string[],
): Promise<CollectionWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;
  if (orderedIds.length === 0) {
    return { ok: false, code: "invalid", error: "Nothing to reorder." };
  }

  for (let i = 0; i < orderedIds.length; i += 1) {
    const { error } = await supabase
      .from("product_collections")
      .update({ position: i, updated_at: new Date().toISOString() })
      .eq("id", orderedIds[i])
      .eq("artist_id", artistId);
    if (error) return { ok: false, code: "failed", error: "Couldn't reorder." };
  }
  return { ok: true, id: orderedIds[0] };
}

/**
 * Archive or restore a collection.
 *
 * Archiving keeps membership and per-collection ordering intact, so restoring
 * brings the section back exactly as it was. This is the safe retirement, and
 * it is why delete can afford to be strict below.
 */
export async function setCollectionArchivedCore(
  supabase: SupabaseClient,
  artistId: string,
  id: string,
  archived: boolean,
): Promise<CollectionWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  const { data, error } = await supabase
    .from("product_collections")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("artist_id", artistId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: "failed", error: "Couldn't save." };
  if (!data) {
    return { ok: false, code: "failed", error: "That collection is gone." };
  }
  return { ok: true, id: data.id as string };
}

/**
 * Delete a collection, when it is eligible.
 *
 * Its products always survive: the join table cascades away the MEMBERSHIP, not
 * the goods. But membership and per-collection ordering are themselves work an
 * artist did by hand, and nothing restores them. So a populated LIVE collection
 * must be archived first, which turns delete into a deliberate second act on
 * something already set aside rather than one click that discards arranging.
 *
 * Empty collections delete freely: there is nothing to lose, and forcing a
 * mis-created section through archive would be ceremony.
 */
export async function deleteCollectionCore(
  supabase: SupabaseClient,
  artistId: string,
  id: string,
): Promise<CollectionWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  const { data: existing, error: readError } = await supabase
    .from("product_collections")
    .select("id, name, position, is_public_visible, archived_at")
    .eq("id", id)
    .eq("artist_id", artistId)
    .maybeSingle();
  if (readError) {
    return { ok: false, code: "failed", error: "Couldn't delete." };
  }
  if (!existing) {
    return { ok: false, code: "failed", error: "That collection is gone." };
  }

  const { count } = await supabase
    .from("product_collection_items")
    .select("id", { count: "exact", head: true })
    .eq("collection_id", id);

  const collection: ProductCollection = {
    id: existing.id as string,
    name: existing.name as string,
    position: existing.position as number,
    isPublicVisible: existing.is_public_visible as boolean,
    archivedAt: (existing.archived_at as string | null) ?? null,
  };
  if (!canDeleteCollection(collection, count ?? 0)) {
    return {
      ok: false,
      code: "not_eligible",
      error:
        "This collection still has products in it. Archive it first, then you can delete it.",
    };
  }

  const { data, error } = await supabase
    .from("product_collections")
    .delete()
    .eq("id", id)
    .eq("artist_id", artistId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: "failed", error: "Couldn't delete." };
  if (!data) {
    return { ok: false, code: "failed", error: "That collection is gone." };
  }
  return { ok: true, id: data.id as string };
}

/** Add a product to a collection, at the end of that collection's order.
 *  Idempotent: adding something already there is a no-op rather than an error,
 *  because a double-tap is not a mistake worth a message. */
export async function addProductToCollectionCore(
  supabase: SupabaseClient,
  artistId: string,
  productId: string,
  collectionId: string,
): Promise<CollectionWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  const { data: existing } = await supabase
    .from("product_collection_items")
    .select("id")
    .eq("collection_id", collectionId)
    .eq("product_id", productId)
    .maybeSingle();
  if (existing) return { ok: true, id: existing.id as string };

  const { data: last } = await supabase
    .from("product_collection_items")
    .select("position")
    .eq("collection_id", collectionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last?.position as number | undefined) ?? -1) + 1;

  // artist_id is supplied, and both composite FKs plus the RLS WITH CHECK
  // verify it against BOTH parents. A guessed collection or product id
  // belonging to someone else cannot produce a row here.
  const { data, error } = await supabase
    .from("product_collection_items")
    .insert({
      collection_id: collectionId,
      product_id: productId,
      artist_id: artistId,
      position,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      code: "invalid",
      error: "Couldn't add that to the collection.",
    };
  }
  return { ok: true, id: data.id as string };
}

/** Remove a product from ONE collection. The product itself is untouched, and
 *  its place in any other collection is untouched. */
export async function removeProductFromCollectionCore(
  supabase: SupabaseClient,
  artistId: string,
  productId: string,
  collectionId: string,
): Promise<CollectionWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  const { error } = await supabase
    .from("product_collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("product_id", productId)
    .eq("artist_id", artistId);
  if (error) return { ok: false, code: "failed", error: "Couldn't remove." };
  // Absent is the desired end state, so a no-op delete is success.
  return { ok: true, id: productId };
}

/** Reorder products WITHIN one collection. Only this collection's positions
 *  move; the same products keep their own order everywhere else. */
export async function reorderCollectionProductsCore(
  supabase: SupabaseClient,
  artistId: string,
  collectionId: string,
  orderedProductIds: string[],
): Promise<CollectionWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;
  if (orderedProductIds.length === 0) {
    return { ok: false, code: "invalid", error: "Nothing to reorder." };
  }

  for (let i = 0; i < orderedProductIds.length; i += 1) {
    const { error } = await supabase
      .from("product_collection_items")
      .update({ position: i })
      .eq("collection_id", collectionId)
      .eq("product_id", orderedProductIds[i])
      .eq("artist_id", artistId);
    if (error) return { ok: false, code: "failed", error: "Couldn't reorder." };
  }
  return { ok: true, id: collectionId };
}

/**
 * Set the FULL set of collections a product belongs to.
 *
 * The editor's shape: it holds the whole answer, so it sends the whole answer.
 * Additions land at the end of each collection's order; removals drop only that
 * membership. Collections not mentioned are left alone, including their
 * ordering, so re-saving a product never disturbs sections it was already in.
 */
export async function setProductCollectionsCore(
  supabase: SupabaseClient,
  artistId: string,
  productId: string,
  collectionIds: string[],
): Promise<CollectionWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  const wanted = new Set(collectionIds);
  const { data: current, error: readError } = await supabase
    .from("product_collection_items")
    .select("collection_id")
    .eq("product_id", productId)
    .eq("artist_id", artistId);
  if (readError) return { ok: false, code: "failed", error: "Couldn't save." };

  const held = new Set((current ?? []).map((r) => r.collection_id as string));

  for (const id of wanted) {
    if (held.has(id)) continue;
    const added = await addProductToCollectionCore(
      supabase,
      artistId,
      productId,
      id,
    );
    if (!added.ok) return added;
  }
  for (const id of held) {
    if (wanted.has(id)) continue;
    const removed = await removeProductFromCollectionCore(
      supabase,
      artistId,
      productId,
      id,
    );
    if (!removed.ok) return removed;
  }
  return { ok: true, id: productId };
}

// ---------------------------------------------------------------------------
// Reads.

export type CollectionWithCount = ProductCollection & { productCount: number };

/** The artist's manager view: every collection, live and archived, each with
 *  how many products it holds. */
export async function listCollectionsForArtist(
  supabase: SupabaseClient,
  artistId: string,
): Promise<CollectionWithCount[]> {
  const { data } = await supabase
    .from("product_collections")
    .select("id, name, position, is_public_visible, archived_at")
    .eq("artist_id", artistId)
    .order("position", { ascending: true });
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: items } = await supabase
    .from("product_collection_items")
    .select("collection_id")
    .eq("artist_id", artistId);

  const counts = new Map<string, number>();
  for (const it of items ?? []) {
    const key = it.collection_id as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return rows.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    position: c.position as number,
    isPublicVisible: c.is_public_visible as boolean,
    archivedAt: (c.archived_at as string | null) ?? null,
    productCount: counts.get(c.id as string) ?? 0,
  }));
}

/**
 * The PUBLIC shop's grouping, entitlement- and kill-switch-aware.
 *
 * Returns empty arrays when the artist is not entitled or the capability is
 * killed, which `groupProductsByCollection` renders as a single unheaded
 * remainder. That IS the flat-shop fallback, and it is the reason it lives
 * here rather than in the page: a downgrade to Free must never remove a
 * purchasable product from a shop, only the grouping around it.
 *
 * Takes the client to read with, so the public page keeps using its service
 * client (visitors are anonymous and have no JWT to scope by).
 */
export async function publicCollectionsForArtist(
  supabase: SupabaseClient,
  artistId: string,
): Promise<{
  collections: ProductCollection[];
  memberships: CollectionMembership[];
}> {
  const empty = { collections: [], memberships: [] };
  try {
    if (!goodsCollectionsAllowed(await getAccountOverrides(artistId))) {
      return empty;
    }
  } catch {
    // Fail FLAT, not broken. An entitlement read that throws must not take the
    // public shop down: every product still renders, ungrouped.
    return empty;
  }

  const { data: rawCollections } = await supabase
    .from("product_collections")
    .select("id, name, position, is_public_visible, archived_at")
    .eq("artist_id", artistId)
    .eq("is_public_visible", true)
    .is("archived_at", null)
    .order("position", { ascending: true });

  const collections: ProductCollection[] = (rawCollections ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    position: c.position as number,
    isPublicVisible: true,
    archivedAt: null,
  }));
  if (collections.length === 0) return empty;

  const { data: rawItems } = await supabase
    .from("product_collection_items")
    .select("collection_id, product_id, position")
    .eq("artist_id", artistId)
    .in(
      "collection_id",
      collections.map((c) => c.id),
    )
    .order("position", { ascending: true });

  const memberships: CollectionMembership[] = (rawItems ?? []).map((m) => ({
    collectionId: m.collection_id as string,
    productId: m.product_id as string,
    position: m.position as number,
  }));

  return { collections, memberships };
}
