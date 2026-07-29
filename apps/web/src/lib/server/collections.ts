import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeCollectionName,
  validateCollectionName,
  MAX_COLLECTIONS,
} from "@inklee/shared/collections";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsCollectionsAllowed } from "./entitlement-gates";

// The ONE write path for product collections (Plus build P5d), shared by the
// web action and any future mobile route, same discipline as every other core
// here: the entitlement is refused server-side rather than hidden in the UI.

export type CollectionWriteResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      code: "not_entitled" | "invalid" | "at_cap" | "failed";
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

export async function saveCollectionCore(
  supabase: SupabaseClient,
  artistId: string,
  input: { name: unknown; isPublicVisible?: unknown },
  existingId?: string,
): Promise<CollectionWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  const name = normalizeCollectionName(input.name);
  const nameError = validateCollectionName(name);
  if (nameError) return { ok: false, code: "invalid", error: nameError };

  if (!existingId) {
    // Counted only on CREATE. An artist already over the cap (which can only
    // happen if the cap is lowered later) can still rename and reorder what
    // they have; they simply cannot add more.
    const { count } = await supabase
      .from("product_collections")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artistId);
    if ((count ?? 0) >= MAX_COLLECTIONS) {
      return {
        ok: false,
        code: "at_cap",
        error: `You can have up to ${MAX_COLLECTIONS} collections.`,
      };
    }
  }

  const row = {
    artist_id: artistId,
    name,
    is_public_visible: input.isPublicVisible !== false,
    updated_at: new Date().toISOString(),
  };

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

/**
 * Delete a collection.
 *
 * The FK is ON DELETE SET NULL, so its products survive and become ungrouped.
 * That is the whole reason this can be a plain delete rather than an archive:
 * nothing of value is destroyed, and an artist tidying their shop is not
 * asking to unpublish stock.
 */
export async function deleteCollectionCore(
  supabase: SupabaseClient,
  artistId: string,
  id: string,
): Promise<CollectionWriteResult> {
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

/** Assign a product to a collection, or clear it with null. Both sides are
 *  ownership-checked so a guessed id cannot move someone else's product. */
export async function setProductCollectionCore(
  supabase: SupabaseClient,
  artistId: string,
  productId: string,
  collectionId: string | null,
): Promise<CollectionWriteResult> {
  const gate = await requireEntitlement(artistId);
  if (gate) return gate;

  if (collectionId) {
    const { data: owned } = await supabase
      .from("product_collections")
      .select("id")
      .eq("id", collectionId)
      .eq("artist_id", artistId)
      .maybeSingle();
    if (!owned) {
      return { ok: false, code: "invalid", error: "Unknown collection." };
    }
  }

  const { data, error } = await supabase
    .from("products")
    .update({ collection_id: collectionId })
    .eq("id", productId)
    .eq("artist_id", artistId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: "failed", error: "Couldn't save." };
  if (!data) {
    return { ok: false, code: "failed", error: "That product is gone." };
  }
  return { ok: true, id: data.id as string };
}
