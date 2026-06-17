import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import {
  listDayRoster,
  attachItemsToDay,
  attachFolderToDay,
  detachItemFromDay,
} from "@/lib/server/flash-day-membership";
import type { MobileFlashDayItemsResponse } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/flash/days/:id/items — the day's roster (junction-backed).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { id } = await params;
  const result = await listDayRoster(auth.supabase, id, auth.userId);
  if ("error" in result) return mobileError(500, result.error);
  const body: MobileFlashDayItemsResponse = {
    items: result.items.map((i) => ({
      id: i.id,
      title: i.title,
      slug: i.slug,
      status: i.status,
      previewImageUrl: i.preview_image_url,
      position: i.position,
    })),
  };
  return mobileOk(body);
}

// POST /api/mobile/flash/days/:id/items — attach designs. Body either
// { folderId } (attach every published/draft design in that folder) or
// { itemIds: string[] }.
export async function POST(
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
  const b = (raw ?? {}) as { itemIds?: unknown; folderId?: unknown };

  if (typeof b.folderId === "string" && b.folderId) {
    const result = await attachFolderToDay(
      auth.supabase,
      id,
      b.folderId,
      auth.userId,
    );
    if (!result.ok) return mobileError(400, result.error);
    return mobileOk({ attached: result.attached });
  }

  const itemIds = Array.isArray(b.itemIds)
    ? b.itemIds.filter((x): x is string => typeof x === "string")
    : [];
  if (itemIds.length === 0) {
    return mobileError(400, "Provide itemIds or a folderId.");
  }
  const result = await attachItemsToDay(
    auth.supabase,
    id,
    itemIds,
    auth.userId,
  );
  if (!result.ok) return mobileError(400, result.error);
  return mobileOk({ attached: result.attached });
}

// DELETE /api/mobile/flash/days/:id/items?itemId=… — detach one design.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { id } = await params;
  const itemId = new URL(req.url).searchParams.get("itemId");
  if (!itemId) return mobileError(400, "Missing itemId.");
  const result = await detachItemFromDay(
    auth.supabase,
    id,
    itemId,
    auth.userId,
  );
  if (!result.ok) return mobileError(400, result.error);
  return mobileOk({ ok: true });
}
