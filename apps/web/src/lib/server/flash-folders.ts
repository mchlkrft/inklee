// Flash design-library folders core — the single implementation behind BOTH the
// web server actions and the mobile /api/mobile/flash/folders routes (ME-10,
// same injected-client pattern as lib/server/flash-day-membership.ts). Folders
// are flat, per-artist, optional; a design lives in at most one folder
// (flash_items.folder_id, migration 0050). Web-server-only: the RN app reaches
// this only through /api/mobile.

import type { SupabaseClient } from "@supabase/supabase-js";

const NAME_MAX = 60;

export type FlashFolder = {
  id: string;
  name: string;
  position: number;
};

type Ok<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

function cleanName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export async function listFolders(
  supabase: SupabaseClient,
  artistId: string,
): Promise<{ folders: FlashFolder[] } | { error: string }> {
  const { data, error } = await supabase
    .from("flash_folders")
    .select("id, name, position")
    .eq("artist_id", artistId)
    .order("position", { ascending: true });
  if (error) return { error: error.message };
  return { folders: (data ?? []) as FlashFolder[] };
}

export async function createFolder(
  supabase: SupabaseClient,
  artistId: string,
  name: string,
): Promise<Ok<{ id: string }>> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: "Folder name is required." };
  if (clean.length > NAME_MAX) {
    return { ok: false, error: `Folder name is too long (max ${NAME_MAX}).` };
  }

  const { data: maxRow } = await supabase
    .from("flash_folders")
    .select("position")
    .eq("artist_id", artistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position =
    ((maxRow as { position: number } | null)?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("flash_folders")
    .insert({ artist_id: artistId, name: clean, position })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function renameFolder(
  supabase: SupabaseClient,
  artistId: string,
  folderId: string,
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: "Folder name is required." };
  if (clean.length > NAME_MAX) {
    return { ok: false, error: `Folder name is too long (max ${NAME_MAX}).` };
  }
  const { error } = await supabase
    .from("flash_folders")
    .update({ name: clean })
    .eq("id", folderId)
    .eq("artist_id", artistId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Delete a folder. The flash_items.folder_id FK is ON DELETE SET NULL, so the
 *  designs survive and become Unfiled. */
export async function deleteFolder(
  supabase: SupabaseClient,
  artistId: string,
  folderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("flash_folders")
    .delete()
    .eq("id", folderId)
    .eq("artist_id", artistId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function reorderFolders(
  supabase: SupabaseClient,
  artistId: string,
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("flash_folders")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("artist_id", artistId);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Move a design into a folder (or out, with folderId = null). Verifies the
 *  target folder belongs to the artist before assigning. */
export async function setItemFolder(
  supabase: SupabaseClient,
  artistId: string,
  itemId: string,
  folderId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (folderId !== null) {
    const { data: folder, error: folderErr } = await supabase
      .from("flash_folders")
      .select("id")
      .eq("id", folderId)
      .eq("artist_id", artistId)
      .maybeSingle();
    if (folderErr) return { ok: false, error: folderErr.message };
    if (!folder) return { ok: false, error: "Folder not found." };
  }
  const { error } = await supabase
    .from("flash_items")
    .update({ folder_id: folderId })
    .eq("id", itemId)
    .eq("artist_id", artistId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
