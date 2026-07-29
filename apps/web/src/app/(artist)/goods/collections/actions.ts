"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  saveCollectionCore,
  deleteCollectionCore,
  setProductCollectionCore,
} from "@/lib/server/collections";

type State = { error: string } | { success: true } | null;

async function artist() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/** Thin wrappers: the cap, the entitlement refusal and the ownership checks
 *  all live in the cores, so any future mobile route inherits them. */
export async function saveCollectionAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const id = (formData.get("id") as string) || undefined;
  const result = await saveCollectionCore(
    supabase,
    userId,
    {
      name: formData.get("name"),
      isPublicVisible: formData.get("is_public_visible") !== "off",
    },
    id,
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/goods/collections");
  revalidatePath("/goods");
  return { success: true };
}

export async function deleteCollectionAction(id: string): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await deleteCollectionCore(supabase, userId, id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/goods/collections");
  revalidatePath("/goods");
  return { success: true };
}

export async function setProductCollectionAction(
  productId: string,
  collectionId: string | null,
): Promise<State> {
  const { supabase, userId } = await artist();
  if (!userId) return { error: "Not signed in." };

  const result = await setProductCollectionCore(
    supabase,
    userId,
    productId,
    collectionId,
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/goods");
  revalidatePath("/goods/collections");
  return { success: true };
}
