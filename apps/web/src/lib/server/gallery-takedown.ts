import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { ownedHubImagePath } from "@/lib/server/hub-images";
import {
  GALLERY_LIVE_BUCKET,
  GALLERY_ARCHIVE_BUCKET,
} from "@/lib/server/gallery-relocation";
import { recordGalleryModerationStatement } from "@/lib/server/moderation-statements";

// #79 / counsel Q16 element 2, action half: the operator takedown for a hosted
// gallery image reported under the notice-and-action route. It does the thing a
// map "hide" cannot: it deletes the underlying STORAGE OBJECT, not just the
// on-page render.
//
// Order is row-first, object-second (the FU-18 rule hub-images.ts already
// follows): strip the dangling reference from the artist's bio page, THEN
// delete the bytes. Deleting the object is the load-bearing leg on its own,
// because gallery objects are private (0151) and served only through signed
// URLs, so a deleted object can no longer be signed and the render path
// (renderableGalleryImages) drops it; the block strip is cleanliness so no
// dangling reference lingers.
//
// The object is removed from BOTH private buckets: `gallery` holds an entitled
// artist's live objects and `gallery-archive` holds a downgraded artist's
// (gallery-relocation.ts). We do not know which the bytes are in, and a remove
// against the wrong bucket silently no-ops, so both are targeted.

export type GalleryTakedownInput = {
  /** The content_reports row being actioned. */
  reportId: string;
  /** The hosting artist (the recipient of the Art. 17 statement). */
  artistId: string;
  /** The specific hosted gallery-image URL to remove. */
  imageUrl: string;
  /** Optional operator note folded into the statement's grounds. */
  grounds?: string;
};

export type GalleryTakedownResult =
  | {
      ok: true;
      path: string;
      removedFromBuckets: string[];
      strippedFromBlocks: boolean;
      statementId: string | null;
    }
  | { ok: false; error: string };

/** Remove the reported image from the artist's saved bio-page blocks. Operates
 *  on the RAW settings JSON (not the parsed/typed blocks) so everything else in
 *  bio_page is preserved byte-for-byte and only the matching image is dropped
 *  from image_gallery blocks. Returns whether anything changed. */
async function stripImageFromBlocks(
  artistId: string,
  imageUrl: string,
): Promise<boolean> {
  const { data: profile, error } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", artistId)
    .maybeSingle();
  if (error || !profile) return false;

  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  const bioPage = (settings.bio_page ?? {}) as Record<string, unknown>;
  const blocks = Array.isArray(bioPage.blocks) ? bioPage.blocks : [];

  let changed = false;
  const newBlocks = blocks.map((b) => {
    const block = b as { type?: unknown; images?: unknown };
    if (block.type === "image_gallery" && Array.isArray(block.images)) {
      const filtered = block.images.filter(
        (img) => (img as { url?: unknown }).url !== imageUrl,
      );
      if (filtered.length !== block.images.length) {
        changed = true;
        return { ...(b as object), images: filtered };
      }
    }
    return b;
  });
  if (!changed) return false;

  const newSettings = {
    ...settings,
    bio_page: { ...bioPage, blocks: newBlocks },
  };
  const { error: upErr } = await serviceClient
    .from("profiles")
    .update({ settings: newSettings })
    .eq("id", artistId);
  if (upErr) {
    Sentry.captureException(upErr, {
      tags: { area: "dsa", op: "gallery_takedown_strip_block" },
      extra: { artistId },
    });
    return false;
  }
  return true;
}

/**
 * Action a gallery-image notice: strip the block reference, delete the object
 * from both private buckets, record the artist's Art. 17 statement, and resolve
 * the content_reports row. Object removal is best-effort per bucket (a lost
 * removal is a sweepable orphan, logged), and the statement is best-effort
 * (logged as a miss), but neither aborts the takedown, which is a safety action.
 */
export async function takedownGalleryImage(
  input: GalleryTakedownInput,
): Promise<GalleryTakedownResult> {
  const path = ownedHubImagePath(input.imageUrl, input.artistId);
  if (!path) {
    return {
      ok: false,
      error:
        "URL is not a hosted gallery image owned by this artist; nothing removed.",
    };
  }

  const strippedFromBlocks = await stripImageFromBlocks(
    input.artistId,
    input.imageUrl,
  );

  const removedFromBuckets: string[] = [];
  for (const bucket of [GALLERY_LIVE_BUCKET, GALLERY_ARCHIVE_BUCKET]) {
    // Best-effort per bucket AND resilient to a thrown client fault (network,
    // aborted request): a lost removal is a sweepable orphan, but it must not
    // abort the statement + report-resolution legs that follow, which are the
    // artist's Art. 17 notice and the audit trail.
    try {
      const { error } = await serviceClient.storage.from(bucket).remove([path]);
      if (!error) {
        removedFromBuckets.push(bucket);
      } else {
        Sentry.captureException(error, {
          tags: { area: "dsa", op: "gallery_takedown_remove" },
          extra: { bucket, path },
        });
      }
    } catch (thrown) {
      Sentry.captureException(thrown, {
        tags: { area: "dsa", op: "gallery_takedown_remove" },
        extra: { bucket, path },
      });
    }
  }

  const statementId = await recordGalleryModerationStatement({
    artistId: input.artistId,
    grounds: input.grounds,
  });

  const { error: updErr } = await serviceClient
    .from("content_reports")
    .update({
      status: "actioned",
      target_artist_id: input.artistId,
      statement_of_reasons_id: statementId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.reportId);
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { area: "dsa", op: "gallery_takedown_resolve_report" },
      extra: { reportId: input.reportId },
    });
  }

  return {
    ok: true,
    path,
    removedFromBuckets,
    strippedFromBlocks,
    statementId,
  };
}
