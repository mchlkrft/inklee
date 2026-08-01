import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import type { BioBlock } from "@inklee/shared/bio-page";

// Hosted gallery-image lifecycle (Track B slice B2).
//
// Gallery uploads live at `logos/{uid}/hub/{uuid}.webp` with unique paths, so
// unlike the cover (fixed path + upsert = replacement overwrites) an image
// REMOVED from a block would orphan its storage object forever: nothing sweeps
// the `logos` bucket. The save path closes that: after a settings write WINS,
// it diffs the prior gallery URLs against the saved ones and removes the
// dropped objects — row-first, object-second (a failed removal leaves a
// sweepable orphan, never a ghost reference; the losing writer in a race never
// deletes objects the winning row still references, the FU-18 rule).
//
// SECURITY: a block's `url` is ARTIST-SUPPLIED and may legitimately be an
// external URL (the editor keeps the URL field, GB2). Every candidate is
// re-validated through `ownedHubImagePath`, which only ever yields paths inside
// THIS artist's own hub namespace — an external URL, another artist's object, a
// sibling feature's object (`{uid}/flash/...`), or a crafted traversal all
// return null and are simply not storage candidates. Mirrors
// `ownedGoodsStoragePath` (mobile-goods-server.ts) verbatim in spirit.

const PUBLIC_MARKER = "/storage/v1/object/public/logos/";

function hubImagePathFromUrl(url: string): string | null {
  const idx = url.indexOf(PUBLIC_MARKER);
  if (idx < 0) return null;
  const tail = url.slice(idx + PUBLIC_MARKER.length);
  return tail.split("?")[0] || null;
}

/**
 * The storage path for a HOSTED hub-gallery URL owned by `userId`, or null for
 * anything else (external URLs, other artists, other features, traversals).
 * Exactly one segment under `{uid}/hub/`.
 */
export function ownedHubImagePath(url: string, userId: string): string | null {
  const path = hubImagePathFromUrl(url);
  if (!path) return null;
  if (path.includes("..")) return null;
  const dirPrefix = `${userId}/hub/`;
  if (!path.startsWith(dirPrefix)) return null;
  const rest = path.slice(dirPrefix.length);
  if (rest.length === 0 || rest.includes("/")) return null;
  return path;
}

function galleryUrls(blocks: readonly BioBlock[]): Set<string> {
  const urls = new Set<string>();
  for (const b of blocks) {
    if (b.type === "image_gallery") {
      for (const img of b.images) urls.add(img.url);
    }
  }
  return urls;
}

/**
 * Remove the hosted objects of gallery images that were DROPPED by a save
 * (present in `priorBlocks`, absent from `savedBlocks`). Call ONLY after the
 * settings write succeeded. Best-effort: a failed removal is a sweepable
 * orphan, captured to Sentry, never an error the artist sees.
 *
 * Returns the number of objects removed (0 on any failure), for callers that
 * want to report it.
 */
export async function removeDroppedHubImages(
  userId: string,
  priorBlocks: readonly BioBlock[],
  savedBlocks: readonly BioBlock[],
): Promise<number> {
  const saved = galleryUrls(savedBlocks);
  const droppedPaths: string[] = [];
  for (const url of galleryUrls(priorBlocks)) {
    if (saved.has(url)) continue;
    const path = ownedHubImagePath(url, userId);
    if (path) droppedPaths.push(path);
  }
  if (droppedPaths.length === 0) return 0;

  try {
    const { error } = await serviceClient.storage
      .from("logos")
      .remove(droppedPaths);
    if (error) {
      Sentry.captureException(error, {
        tags: { action: "hub_gallery_orphan_cleanup" },
        extra: { userId, count: droppedPaths.length },
      });
      return 0;
    }
    return droppedPaths.length;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "hub_gallery_orphan_cleanup" },
      extra: { userId, count: droppedPaths.length },
    });
    return 0;
  }
}
