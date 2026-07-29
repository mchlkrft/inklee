"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  saveCollectionCore,
  deleteCollectionCore,
  setCollectionArchivedCore,
  reorderCollectionsCore,
  setProductCollectionsCore,
  addProductToCollectionCore,
  removeProductFromCollectionCore,
  reorderCollectionProductsCore,
} from "@/lib/server/collections";

type State = { error: string } | { success: true } | null;

async function artist() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/** Every rule (entitlement refusal, delete eligibility, ownership, ordering)
 *  lives in the cores, so the mobile routes inherit all of it and cannot
 *  drift. These are thin wrappers plus cache invalidation. */
function revalidateShop() {
  revalidatePath("/goods/collections");
  revalidatePath("/goods");
}

export async function saveCollectionAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const id = (formData.get("id") as string) || undefined;
  // Sparse by construction: a key absent from the form is not sent, so the
  // core leaves that column alone. Editing the name of a hidden collection
  // must not quietly republish it.
  const input: { name?: unknown; isPublicVisible?: unknown } = {};
  if (formData.has("name")) input.name = formData.get("name");
  if (formData.has("is_public_visible")) {
    input.isPublicVisible = formData.get("is_public_visible") !== "off";
  }

  const result = await saveCollectionCore(supabase, userId, input, id);
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}

export async function deleteCollectionAction(id: string): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await deleteCollectionCore(supabase, userId, id);
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}

export async function setCollectionArchivedAction(
  id: string,
  archived: boolean,
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await setCollectionArchivedCore(
    supabase,
    userId,
    id,
    archived,
  );
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}

export async function reorderCollectionsAction(
  orderedIds: string[],
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await reorderCollectionsCore(supabase, userId, orderedIds);
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}

/** The product editor holds the whole answer, so it sends the whole answer. */
export async function setProductCollectionsAction(
  productId: string,
  collectionIds: string[],
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await setProductCollectionsCore(
    supabase,
    userId,
    productId,
    collectionIds,
  );
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}

export async function addProductToCollectionAction(
  productId: string,
  collectionId: string,
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await addProductToCollectionCore(
    supabase,
    userId,
    productId,
    collectionId,
  );
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}

export async function removeProductFromCollectionAction(
  productId: string,
  collectionId: string,
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await removeProductFromCollectionCore(
    supabase,
    userId,
    productId,
    collectionId,
  );
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}

export async function reorderCollectionProductsAction(
  collectionId: string,
  orderedProductIds: string[],
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await reorderCollectionProductsCore(
    supabase,
    userId,
    collectionId,
    orderedProductIds,
  );
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}
