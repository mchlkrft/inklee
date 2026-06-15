// Shared server helpers for the mobile goods endpoints (/api/mobile/goods/*).
// These mirror the web Server Actions in apps/web/src/app/(artist)/goods/actions.ts
// so a mobile write has the same public-page-cache + storage-cleanup behaviour as
// a web write. Kept here (not in the route files) so create/update/delete/status
// all share one implementation and can't drift.

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase/service";

/**
 * Revalidate the artist's public Bio Page after a goods write so a mobile edit
 * refreshes the cached page immediately (web actions all do this). Uses the
 * caller's RLS-scoped client to read the artist's own slug; nothing is exposed
 * cross-artist because the profile read is scoped to `userId`.
 */
export async function revalidatePublicPage(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.slug) revalidatePath(`/${profile.slug}`);
}

// Derive the storage path from a public URL so we can delete the file when a
// product is removed. Public URL shape:
//   https://<ref>.supabase.co/storage/v1/object/public/logos/<path>
function goodsImagePathFromUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/logos/";
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const tail = url.slice(idx + marker.length);
  return tail.split("?")[0] || null;
}

// SECURITY: derive a storage path AND verify it lives under this artist's +
// product's namespace. Anything else (another artist's path, a sibling
// product's path, a directory escape) returns null. Mirrors the web action's
// ownedGoodsStoragePath verbatim so a crafted image_urls payload cannot reach
// across artists/products on delete.
export function ownedGoodsStoragePath(
  url: string,
  userId: string,
  productId: string,
): string | null {
  const path = goodsImagePathFromUrl(url);
  if (!path) return null;
  if (path.includes("..")) return null;
  const dirPrefix = `${userId}/goods/${productId}/`;
  const legacyPath = `${userId}/goods/${productId}.webp`;
  if (path === legacyPath) return path;
  // Per-image layout (mig 0038): exactly one segment under the product dir.
  if (path.startsWith(dirPrefix)) {
    const rest = path.slice(dirPrefix.length);
    if (rest.length > 0 && !rest.includes("/")) return path;
  }
  return null;
}

/**
 * Remove a product's storage images (multi-image per-file paths + the legacy
 * single-image path), re-validating every URL through ownedGoodsStoragePath so
 * the sweep can only touch this artist's + product's namespace. Mirrors the web
 * deleteProductAction cleanup. Best-effort: failures are swallowed (the row is
 * already gone; orphaned files are a tolerable follow-up, never an error path).
 */
export async function sweepGoodsStorage(
  userId: string,
  productId: string,
  imageUrls: string[],
): Promise<void> {
  const pathsToRemove = Array.from(
    new Set([
      ...imageUrls
        .map((u) => ownedGoodsStoragePath(u, userId, productId))
        .filter((p): p is string => !!p),
      `${userId}/goods/${productId}.webp`,
    ]),
  );
  if (pathsToRemove.length === 0) return;
  await serviceClient.storage
    .from("logos")
    .remove(pathsToRemove)
    .catch(() => undefined);
}
