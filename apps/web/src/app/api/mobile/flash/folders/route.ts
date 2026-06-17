import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { listFolders, createFolder } from "@/lib/server/flash-folders";
import type { MobileFlashFoldersResponse } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/flash/folders — the artist's design-library folders.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const result = await listFolders(auth.supabase, auth.userId);
  if ("error" in result) return mobileError(500, result.error);
  const body: MobileFlashFoldersResponse = { folders: result.folders };
  return mobileOk(body);
}

// POST /api/mobile/flash/folders — create a folder. Body: { name }.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
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
  const result = await createFolder(auth.supabase, auth.userId, name);
  if (!result.ok) return mobileError(400, result.error);
  return mobileOk({ id: result.id });
}
