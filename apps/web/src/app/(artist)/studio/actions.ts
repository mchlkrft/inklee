"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled } from "@/lib/map-features";
import {
  createStudioCore,
  setPublicationCore,
  setStudioCategoriesCore,
  updateStudioProfileCore,
  type CreateStudioInput,
  type CreateStudioResult,
  type StudioCategoryInput,
} from "@/lib/server/studios";
import type { StudioProfileInput } from "@inklee/shared/studio-profile";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function createStudioAction(
  input: CreateStudioInput,
  ignoreDuplicates = false,
): Promise<CreateStudioResult> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await createStudioCore(user.id, input, ignoreDuplicates);
  if ("studioId" in result) {
    revalidatePath("/studio");
  }
  return result;
}

export async function updateStudioProfileAction(
  studioId: string,
  input: StudioProfileInput,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await updateStudioProfileCore(user.id, studioId, input);
  if (!result.error) {
    revalidatePath("/studio");
    revalidatePath("/studio/edit");
  }
  return result;
}

export async function setStudioCategoriesAction(
  studioId: string,
  categories: StudioCategoryInput[],
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await setStudioCategoriesCore(user.id, studioId, categories);
  if (!result.error) {
    revalidatePath("/studio");
    revalidatePath("/studio/edit");
  }
  return result;
}

export async function setPublicationAction(
  studioId: string,
  publish: boolean,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await setPublicationCore(user.id, studioId, publish);
  if (!result.error) {
    revalidatePath("/studio");
  }
  return result;
}
