"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled } from "@/lib/map-features";
import {
  acceptProposalCore,
  cancelStayCore,
  submitGuestSpotRequestCore,
  withdrawRequestCore,
} from "@/lib/server/guest-spots";
import type { GuestSpotRequestInput } from "@inklee/shared/guest-spots";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function submitGuestSpotRequestAction(
  studioProfileId: string,
  input: GuestSpotRequestInput,
): Promise<{ error?: string; requestId?: string }> {
  if (!tattooMapEnabled())
    return { error: "Guest spot requests are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await submitGuestSpotRequestCore(
    user.id,
    studioProfileId,
    input,
  );
  if (!result.error) revalidatePath("/travel/requests");
  return result;
}

export async function withdrawRequestAction(
  requestId: string,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled())
    return { error: "Guest spot requests are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await withdrawRequestCore(user.id, requestId);
  if (!result.error) {
    revalidatePath("/travel/requests");
    revalidatePath(`/travel/requests/${requestId}`);
  }
  return result;
}

export async function acceptProposalAction(
  requestId: string,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled())
    return { error: "Guest spot requests are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await acceptProposalCore(user.id, requestId);
  if (!result.error) {
    revalidatePath("/travel/requests");
    revalidatePath(`/travel/requests/${requestId}`);
    revalidatePath("/travel");
  }
  return result;
}

export async function cancelStayAction(
  stayId: string,
): Promise<{ error?: string }> {
  if (!tattooMapEnabled())
    return { error: "Guest spot requests are not available." };
  const user = await requireUser();
  if (!user) return { error: "Not signed in." };
  const result = await cancelStayCore(user.id, stayId);
  if (!result.error) {
    revalidatePath("/travel/requests");
    revalidatePath("/travel");
    revalidatePath("/studio");
  }
  return result;
}
