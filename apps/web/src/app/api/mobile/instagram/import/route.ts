import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { importInstagramPosts } from "@/lib/server/instagram-sync";
import type { MobileInstagramImportResult } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/instagram/import { postIds } — create draft flash designs
// from the selected posts (dedupes already-linked). Same shared logic + copy
// as the web import.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: { postIds?: unknown } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const postIds = body.postIds;
  if (
    !Array.isArray(postIds) ||
    postIds.length === 0 ||
    postIds.some((p) => typeof p !== "string")
  ) {
    return mobileError(400, "No posts selected.", "no_posts");
  }

  const result = await importInstagramPosts(
    supabase,
    userId,
    postIds as string[],
  );
  if ("error" in result) return mobileError(400, result.error, "import_failed");

  const out: MobileInstagramImportResult = { created: result.created };
  return mobileOk(out);
}
