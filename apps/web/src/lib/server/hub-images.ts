import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  HOSTED_GALLERY_PRIVATE_MARKER,
  type BioBlock,
} from "@inklee/shared/bio-page";
import { GALLERY_LIVE_BUCKET } from "@/lib/server/gallery-signed-urls";

// Hosted gallery-image lifecycle (Track B slice B2).
//
// Gallery uploads live at `gallery/{uid}/hub/{uuid}.webp` with unique paths, so
// unlike the cover (fixed path + upsert = replacement overwrites) an image
// REMOVED from a block would orphan its storage object forever: nothing sweeps
// the bucket. The save path closes that: after a settings write WINS,
// it diffs the prior gallery URLs against the saved ones and removes the
// dropped objects — row-first, object-second (a failed removal leaves a
// sweepable orphan, never a ghost reference; the losing writer in a race never
// deletes objects the winning row still references, the FU-18 rule).
//
// SECURITY: a block's `url` is re-validated through `ownedHubImagePath`
// regardless, which only ever yields paths inside THIS artist's own hub
// namespace — another artist's object, a sibling feature's object
// (`{uid}/flash/...`), or a crafted traversal all return null and are simply
// not storage candidates. The boundary is the PATH PREFIX, not the host: the
// marker is matched by substring, so a URL on any host that embeds the marker
// followed by this caller's own `{uid}/hub/{segment}` DOES resolve (GAL-PATH-001)
// — but only ever inside the passed userId's own prefix, never a foreign
// tenant's, so it grants no reach the caller does not already have over their
// own objects. As of FD4 (2026-08-01, SUPERSEDES GB2) an off-host URL can no
// longer even survive the parser into a gallery block in the first place (the
// permanent free-text URL field is removed); this function stays deliberately
// host-agnostic so a row written before that change is still handled by its
// path. Mirrors `ownedGoodsStoragePath` (mobile-goods-server.ts) in spirit.

// 0151 (LO-5 DPIA R4): gallery objects moved from the PUBLIC `logos` bucket to
// the PRIVATE `gallery` bucket, so both the marker this derives paths from and
// the bucket the removal below targets changed together. They must change
// together: deriving a path with one marker and removing it from the other
// bucket would silently no-op every cleanup. `HOSTED_LOGOS_PUBLIC_MARKER` still
// exists and is still correct for GOODS images (mobile-goods-server.ts), which
// are public by design and out of the DPIA's scope.
function hubImagePathFromUrl(url: string): string | null {
  const idx = url.indexOf(HOSTED_GALLERY_PRIVATE_MARKER);
  if (idx < 0) return null;
  const tail = url.slice(idx + HOSTED_GALLERY_PRIVATE_MARKER.length);
  return tail.split("?")[0] || null;
}

/**
 * The storage path for a HOSTED hub-gallery URL owned by `userId`, or null.
 * Returns non-null only when the URL embeds the private-gallery marker followed
 * by exactly one segment under THIS `{userId}/hub/`. It does NOT validate the
 * host (the marker is matched by substring), so a URL on a foreign host that
 * embeds the marker plus this caller's own prefix resolves too (GAL-PATH-001) —
 * the boundary is the path prefix, which is always the passed userId's, never
 * another tenant's. Other artists, other features (`{uid}/flash/...`) and `..`
 * traversals all return null.
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
      .from(GALLERY_LIVE_BUCKET)
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
