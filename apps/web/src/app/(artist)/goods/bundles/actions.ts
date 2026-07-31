"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  saveBundleCore,
  deleteBundleCore,
  setBundleArchivedCore,
  reorderBundlesCore,
  setBundleItemsCore,
} from "@/lib/server/bundles";

type State = { error: string } | { success: true } | null;

async function artist() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

// Thin wrappers plus cache invalidation: every rule (entitlement, archive-first
// delete, ownership, the item cap) lives in the cores, so the mobile routes
// inherit all of it and cannot drift.
function revalidateShop() {
  revalidatePath("/goods/bundles");
  revalidatePath("/goods");
}

export async function saveBundleAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const id = (formData.get("id") as string) || undefined;
  // Sparse: a key absent from the form is not sent, so the core leaves that
  // column alone (editing the name of a hidden bundle must not republish it).
  const input: {
    name?: unknown;
    priceAmount?: unknown;
    isPublicVisible?: unknown;
  } = {};
  if (formData.has("name")) input.name = formData.get("name");
  if (formData.has("price_amount"))
    input.priceAmount = formData.get("price_amount");
  if (formData.has("is_public_visible")) {
    input.isPublicVisible = formData.get("is_public_visible") !== "off";
  }

  const result = await saveBundleCore(supabase, userId, input, id);
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}

export async function deleteBundleAction(id: string): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await deleteBundleCore(supabase, userId, id);
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}

export async function setBundleArchivedAction(
  id: string,
  archived: boolean,
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await setBundleArchivedCore(supabase, userId, id, archived);
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}

export async function reorderBundlesAction(
  orderedIds: string[],
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await reorderBundlesCore(supabase, userId, orderedIds);
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}

/** The bundle's product editor holds the whole answer, so it sends the whole
 *  answer: the full set of products (with quantities) the bundle contains. */
export async function setBundleItemsAction(
  bundleId: string,
  items: { productId: string; quantity: number }[],
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await setBundleItemsCore(supabase, userId, bundleId, items);
  if (!result.ok) return { error: result.error };

  revalidateShop();
  return { success: true };
}
