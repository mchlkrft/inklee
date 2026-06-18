import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PUT /api/mobile/flash/items/:id/folder — move a design into a folder (or
// Unfiled). A lightweight, single-field counterpart to the full item PUT, for
// the library's long-press "Add to folder" + drag-into-folder interactions
// (FX, ME test 2026-06-18). Body: { folderId: string | null }.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const body = (raw ?? {}) as Record<string, unknown>;
  const rawFolder = body.folderId;
  let folderId: string | null = null;
  if (rawFolder != null && rawFolder !== "") {
    if (typeof rawFolder !== "string" || !UUID_RE.test(rawFolder)) {
      return mobileError(400, "Invalid folder.", "bad_folder");
    }
    folderId = rawFolder;
  }

  // Ownership of the design.
  const { data: existing, error: readErr } = await supabase
    .from("flash_items")
    .select("id")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (readErr) return mobileError(500, readErr.message);
  if (!existing)
    return mobileError(404, "Flash design not found.", "not_found");

  // Ownership of the target folder (when not Unfiled).
  if (folderId) {
    const { data: folder, error: folderErr } = await supabase
      .from("flash_folders")
      .select("id")
      .eq("id", folderId)
      .eq("artist_id", userId)
      .maybeSingle();
    if (folderErr) return mobileError(500, folderErr.message);
    if (!folder)
      return mobileError(400, "That folder doesn't exist.", "bad_folder");
  }

  const { error } = await supabase
    .from("flash_items")
    .update({ folder_id: folderId })
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
