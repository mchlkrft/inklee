"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled } from "@/lib/map-features";
import {
  createStudioCore,
  deleteStudioPhotoCore,
  setPublicationCore,
  setStudioCategoriesCore,
  submitClaimCore,
  updateStudioProfileCore,
  uploadStudioLogoCore,
  uploadStudioPhotoCore,
  type ClaimInput,
  type CreateStudioInput,
  type CreateStudioResult,
  type StudioCategoryInput,
} from "@/lib/server/studios";
import {
  acceptRequestCore,
  addPrivateNoteCore,
  cancelStayCore,
  passRequestCore,
  proposeDatesCore,
} from "@/lib/server/guest-spots";
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

export async function submitClaimAction(
  mapLocationId: string,
  input: ClaimInput,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await submitClaimCore(user.id, mapLocationId, input);
  if (!result.error) {
    revalidatePath("/studio");
    revalidatePath(`/map/${mapLocationId}`);
  }
  return result;
}

export async function uploadStudioLogoAction(
  studioId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Pick an image first." };
  const result = await uploadStudioLogoCore(user.id, studioId, file);
  if (!result.error) {
    revalidatePath("/studio");
    revalidatePath("/studio/edit");
  }
  return result;
}

export async function uploadStudioPhotoAction(
  studioId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Pick an image first." };
  const result = await uploadStudioPhotoCore(user.id, studioId, file);
  if (!result.error) {
    revalidatePath("/studio");
    revalidatePath("/studio/edit");
  }
  return result;
}

export async function deleteStudioPhotoAction(
  studioId: string,
  photoId: string,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await deleteStudioPhotoCore(user.id, studioId, photoId);
  if (!result.error) {
    revalidatePath("/studio");
    revalidatePath("/studio/edit");
  }
  return result;
}

export async function acceptGuestSpotAction(
  requestId: string,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await acceptRequestCore(user.id, requestId);
  if (!result.error) {
    revalidatePath("/studio");
    revalidatePath("/studio/requests");
    revalidatePath(`/studio/requests/${requestId}`);
  }
  return result;
}

export async function passGuestSpotAction(
  requestId: string,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await passRequestCore(user.id, requestId);
  if (!result.error) {
    revalidatePath("/studio/requests");
    revalidatePath(`/studio/requests/${requestId}`);
  }
  return result;
}

export async function proposeDatesAction(
  requestId: string,
  startDate: string,
  endDate: string,
  message: string | null,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await proposeDatesCore(
    user.id,
    requestId,
    startDate,
    endDate,
    message,
  );
  if (!result.error) {
    revalidatePath("/studio/requests");
    revalidatePath(`/studio/requests/${requestId}`);
  }
  return result;
}

export async function addPrivateNoteAction(
  requestId: string,
  body: string,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await addPrivateNoteCore(user.id, requestId, body);
  if (!result.error) revalidatePath(`/studio/requests/${requestId}`);
  return result;
}

export async function studioCancelStayAction(
  stayId: string,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled()) return { error: "Studios are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await cancelStayCore(user.id, stayId);
  if (!result.error) {
    revalidatePath("/studio");
    revalidatePath("/studio/requests");
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
