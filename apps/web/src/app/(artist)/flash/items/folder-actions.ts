"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  createFolder,
  renameFolder,
  deleteFolder,
  setItemFolder,
} from "@/lib/server/flash-folders";
import { attachFolderToDay } from "@/lib/server/flash-day-membership";

// Web folder server actions — thin wrappers over the shared flash-folders /
// flash-day-membership modules (ME-10: same core as the mobile routes).

type Result = { ok: true } | { error: string };

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createFolderAction(
  name: string,
): Promise<{ ok: true; id: string } | { error: string }> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not authenticated." };
  const r = await createFolder(supabase, user.id, name);
  if (!r.ok) return { error: r.error };
  revalidatePath("/flash/items");
  return { ok: true, id: r.id };
}

export async function renameFolderAction(
  id: string,
  name: string,
): Promise<Result> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not authenticated." };
  const r = await renameFolder(supabase, user.id, id, name);
  if (!r.ok) return { error: r.error };
  revalidatePath("/flash/items");
  return { ok: true };
}

export async function deleteFolderAction(id: string): Promise<Result> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not authenticated." };
  const r = await deleteFolder(supabase, user.id, id);
  if (!r.ok) return { error: r.error };
  revalidatePath("/flash/items");
  return { ok: true };
}

export async function setItemFolderAction(
  itemId: string,
  folderId: string | null,
): Promise<Result> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not authenticated." };
  const r = await setItemFolder(supabase, user.id, itemId, folderId);
  if (!r.ok) return { error: r.error };
  revalidatePath("/flash/items");
  return { ok: true };
}

export async function attachFolderToDayAction(
  dayId: string,
  folderId: string,
): Promise<{ ok: true; attached: number } | { error: string }> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not authenticated." };
  const r = await attachFolderToDay(supabase, dayId, folderId, user.id);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/flash/days/${dayId}`);
  revalidatePath("/flash/items");
  return { ok: true, attached: r.attached };
}
