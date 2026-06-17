import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { renameFolder, deleteFolder } from "@/lib/server/flash-folders";

export const runtime = "nodejs";

// PATCH /api/mobile/flash/folders/:id — rename. Body: { name }.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const name =
    typeof (raw as { name?: unknown })?.name === "string"
      ? (raw as { name: string }).name
      : "";
  const result = await renameFolder(auth.supabase, auth.userId, id, name);
  if (!result.ok) return mobileError(400, result.error);
  return mobileOk({ ok: true });
}

// DELETE /api/mobile/flash/folders/:id — delete (designs survive, become Unfiled).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { id } = await params;
  const result = await deleteFolder(auth.supabase, auth.userId, id);
  if (!result.ok) return mobileError(500, result.error);
  return mobileOk({ ok: true });
}
