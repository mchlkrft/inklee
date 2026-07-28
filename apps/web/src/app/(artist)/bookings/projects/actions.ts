"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  setProjectStatusCore,
  saveProjectNoteCore,
  linkBookingToProjectCore,
} from "@/lib/server/projects";

type State = { error: string } | { success: true } | null;

async function currentArtist() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Thin wrappers: every rule, including which transitions are legal and the
 *  deliberate absence of an entitlement check on existing projects, lives in
 *  the cores so the mobile routes cannot drift. */
export async function setProjectStatusAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const artistId = await currentArtist();
  if (!artistId) return { error: "Not signed in." };

  const projectId = formData.get("projectId") as string;
  const result = await setProjectStatusCore(
    artistId,
    projectId,
    formData.get("status"),
  );
  if (!result.ok) return { error: result.error };

  revalidatePath(`/bookings/projects/${projectId}`);
  revalidatePath("/bookings/projects");
  return { success: true };
}

export async function saveProjectNoteAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const artistId = await currentArtist();
  if (!artistId) return { error: "Not signed in." };

  const projectId = formData.get("projectId") as string;
  const result = await saveProjectNoteCore(
    artistId,
    projectId,
    formData.get("note"),
  );
  if (!result.ok) return { error: result.error };

  revalidatePath(`/bookings/projects/${projectId}`);
  return { success: true };
}

export async function linkBookingAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const artistId = await currentArtist();
  if (!artistId) return { error: "Not signed in." };

  const projectId = formData.get("projectId") as string;
  const bookingId = formData.get("bookingId") as string;
  const unlink = formData.get("unlink") === "1";

  const result = await linkBookingToProjectCore(
    artistId,
    bookingId,
    unlink ? null : projectId,
  );
  if (!result.ok) return { error: result.error };

  revalidatePath(`/bookings/projects/${projectId}`);
  return { success: true };
}
