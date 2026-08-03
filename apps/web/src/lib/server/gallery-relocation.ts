import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { parseBioPageSettings } from "@/lib/bio-page-settings";
import { DEFAULT_OVERRIDES, type AccountOverrides } from "@/lib/entitlements";
import { richContentBlocksAllowed } from "@/lib/server/entitlement-gates";
import { ownedHubImagePath } from "@/lib/server/hub-images";
import { GALLERY_LIVE_BUCKET } from "@/lib/server/gallery-signed-urls";

// Gallery downgrade relocation (counsel C1.5,
// docs/legal/counsel-accountant-handoff-2026-08.md Part 4, migration 0144).
//
// Counsel's conditional pass on hosting client photographs "public but
// unlisted" requires that a downgrade stop the OBJECTS being publicly
// reachable, not only stop the block RENDERING. This module is the one place
// that moves gallery bytes between the live bucket and the archive bucket;
// every caller (the billing reconcile hook, the comp-expiry sweep, the nightly
// retry sweep) shares it so there is exactly one relocate/restore
// implementation to get right.
//
// CHANGED BY 0151 (LO-5 DPIA R4). The live bucket is no longer the public
// `logos` bucket: gallery objects now live in the PRIVATE `gallery` bucket and
// are served only through short-lived signed URLs (gallery-signed-urls.ts).
// Two consequences worth being explicit about, because they change what this
// module IS:
//
//   1. The source bucket constant had to move with it. Relocating out of
//      `logos` after 0151 would find nothing there and report every artist
//      already archived, which is a silent no-op, not an error.
//   2. This is no longer the control that stops public reachability, because
//      nothing is publicly reachable any more. It is now defence in depth, and
//      a lifecycle distinction: `gallery` holds an entitled artist's objects,
//      `gallery-archive` holds a lapsed artist's. Both are private with zero
//      policies. The primary R4 control is that neither resolves unsigned; the
//      primary downgrade control is that the render gate stops minting
//      signatures. This module remains valuable as the thing that keeps a
//      lapsed artist's objects out of the bucket the signing path reads from.
//
// RELOCATE, NEVER DELETE: an unentitled artist may resubscribe, so this only
// ever moves bytes, never removes them. Deletion on gallery-item removal
// (hub-images.ts) and account closure (account-deletion.ts) are separate,
// already-built paths this does not touch.

// The LIVE gallery bucket is private since 0151. Re-exported from the signing
// module rather than redeclared, so the bucket has exactly one name in the
// codebase (the HUB-GAL-006 lesson: a second copy of a storage literal is free
// to drift from the first).
export { GALLERY_LIVE_BUCKET };
export const GALLERY_ARCHIVE_BUCKET = "gallery-archive";

export type GalleryRelocationOutcome = {
  /** True once every object for this artist is confirmed OUT of the public
   *  bucket (relocate) or back IN it (restore). False means at least one
   *  object's storage call failed and needs a retry. */
  ok: boolean;
  moved: number;
  failed: number;
  failedPaths: string[];
};

/** The relative hub-object paths (`{uid}/hub/{uuid}.webp`) for every gallery
 *  image currently saved in this artist's bio page, regardless of which
 *  bucket the bytes are physically sitting in right now — the stored block
 *  URL never changes when an object is relocated, only what is reachable at
 *  it, so this reads the SAME settings row either way. */
async function ownedGalleryPaths(artistId: string): Promise<string[]> {
  const { data: profile, error } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", artistId)
    .maybeSingle();
  // A discarded error here used to be indistinguishable from a genuine
  // zero-image artist: both resolve `profile` to a falsy value, so the caller
  // would see `moved: 0` / `ok: true` and permanently mark this artist
  // handled (relocate) or restored (restore) without ever having looked at
  // their actual gallery. Throw instead — moveAll has no images to iterate
  // either way, but the caller's try/catch (relocateArtistGallery /
  // restoreArtistGallery) turns this into `ok: false` and leaves the marker
  // untouched, which is what makes the artist retryable by the nightly sweep.
  // A genuinely absent/empty profile row (data: null, error: null) still
  // resolves to zero paths below, exactly as before.
  if (error) {
    throw new Error(
      `ownedGalleryPaths: could not read profile ${artistId}: ${error.message}`,
    );
  }
  const bio = parseBioPageSettings(
    ((profile?.settings ?? {}) as Record<string, unknown>).bio_page,
  );
  const paths = new Set<string>();
  for (const block of bio.blocks) {
    if (block.type !== "image_gallery") continue;
    for (const img of block.images) {
      const path = ownedHubImagePath(img.url, artistId);
      if (path) paths.add(path);
    }
  }
  return [...paths];
}

/** Move one object from `fromBucket` to `toBucket` at the SAME relative path.
 *  Uses the storage API's own cross-bucket `move` (a single call; the source
 *  is the bucket a Supabase client is scoped `.from()`, the destination named
 *  via `destinationBucket`) rather than a client-side download+upload+delete,
 *  so there is one storage round trip to fail, not three.
 *
 *  Order of reasoning if it reports an error: the object might genuinely
 *  still be at `fromBucket` (nothing happened, safe to retry), or a PRIOR
 *  attempt already moved it and this call is being retried after a
 *  false-negative / the caller not yet having recorded success (the object is
 *  no longer publicly reachable either way, which is the property that
 *  matters — treat as done rather than retry a move that has nothing left to
 *  move). This checks ONLY presence at the source: "still present at
 *  `fromBucket`" is the one retry-worthy failure signal implemented below,
 *  not "absent from `fromBucket` AND confirmed present at `toBucket`" — a
 *  second round trip against the destination is deliberately not made, to
 *  keep the single-round-trip design above true for the retry path too. If
 *  the `list` call itself errors, source presence is unconfirmed and this
 *  reports "failed" rather than guessing "already_done": an unconfirmed move
 *  must stay in the retry set, not silently count as handled. */
async function moveOneObject(
  path: string,
  fromBucket: string,
  toBucket: string,
): Promise<"moved" | "already_done" | "failed"> {
  const { error } = await serviceClient.storage
    .from(fromBucket)
    .move(path, path, { destinationBucket: toBucket });
  if (!error) return "moved";

  const dir = path.split("/").slice(0, -1).join("/");
  const base = path.split("/").pop() ?? path;
  const { data: stillAtSource, error: listError } = await serviceClient.storage
    .from(fromBucket)
    .list(dir, { search: base });
  if (listError) {
    // Could not determine source presence at all; do not let an unrelated
    // storage read failure masquerade as "already moved".
    return "failed";
  }
  const presentAtSource = (stillAtSource ?? []).some((f) => f.name === base);
  if (!presentAtSource) {
    // Gone from the source one way or another; it is not publicly reachable
    // there any more, which is what relocate cares about, and if this was a
    // restore, `logos` is the source being checked, so an object gone from
    // ARCHIVE with nothing to show for it needs the caller's context to
    // classify — see relocateArtistGallery / restoreArtistGallery below.
    return "already_done";
  }
  return "failed";
}

async function moveAll(
  artistId: string,
  fromBucket: string,
  toBucket: string,
): Promise<GalleryRelocationOutcome> {
  const paths = await ownedGalleryPaths(artistId);
  let moved = 0;
  const failedPaths: string[] = [];
  for (const path of paths) {
    const outcome = await moveOneObject(path, fromBucket, toBucket);
    if (outcome === "failed") failedPaths.push(path);
    else moved++;
  }
  return {
    ok: failedPaths.length === 0,
    moved,
    failed: failedPaths.length,
    failedPaths,
  };
}

/** Move every gallery object this artist has saved out of the public `logos`
 *  bucket and into the private `gallery-archive` bucket. Call on a downgrade
 *  (billing lapse, comp expiry, or the nightly sweep catching anything else).
 *  Idempotent: an artist with no gallery images, or one already fully
 *  archived, resolves immediately with `moved: 0`. Marks
 *  `account_overrides.gallery_relocated_at` ONLY on full success — a partial
 *  failure leaves it NULL so the nightly sweep keeps retrying this artist
 *  rather than reading "some objects moved" as "handled". Never throws: a
 *  storage hiccup here must not fail the caller's own operation (a Stripe
 *  webhook reconcile, a notification sweep); it is reported to Sentry and
 *  left for the retry sweep. */
export async function relocateArtistGallery(
  artistId: string,
): Promise<GalleryRelocationOutcome> {
  try {
    const result = await moveAll(
      artistId,
      GALLERY_LIVE_BUCKET,
      GALLERY_ARCHIVE_BUCKET,
    );
    if (result.ok) {
      await serviceClient
        .from("account_overrides")
        .update({ gallery_relocated_at: new Date().toISOString() })
        .eq("artist_id", artistId);
    } else {
      Sentry.captureMessage("Gallery downgrade relocation incomplete", {
        level: "error",
        tags: { action: "gallery_downgrade_relocation" },
        extra: { artistId, ...result },
      });
    }
    return result;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "gallery_downgrade_relocation" },
      extra: { artistId },
    });
    return { ok: false, moved: 0, failed: 0, failedPaths: [] };
  }
}

/** The inverse: move every gallery object back into the public `logos`
 *  bucket. Call on re-entitlement (resubscribe, comp re-grant, admin
 *  override). No-ops when the artist was never archived
 *  (`gallery_relocated_at` NULL) — a downgrade inside the same day the sweep
 *  has not yet run leaves objects untouched in `logos`, so there is nothing
 *  to restore and calling this must not be a precondition for treating the
 *  artist as fully re-entitled. Clears the marker only on full success, same
 *  discipline as relocate. Never throws. */
export async function restoreArtistGallery(
  artistId: string,
): Promise<GalleryRelocationOutcome> {
  try {
    const { data: row } = await serviceClient
      .from("account_overrides")
      .select("gallery_relocated_at")
      .eq("artist_id", artistId)
      .maybeSingle();
    if (!row?.gallery_relocated_at) {
      return { ok: true, moved: 0, failed: 0, failedPaths: [] };
    }

    const result = await moveAll(
      artistId,
      GALLERY_ARCHIVE_BUCKET,
      GALLERY_LIVE_BUCKET,
    );
    if (result.ok) {
      await serviceClient
        .from("account_overrides")
        .update({ gallery_relocated_at: null })
        .eq("artist_id", artistId);
    } else {
      Sentry.captureMessage("Gallery restore-on-resubscribe incomplete", {
        level: "error",
        tags: { action: "gallery_downgrade_restore" },
        extra: { artistId, ...result },
      });
    }
    return result;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "gallery_downgrade_restore" },
      extra: { artistId },
    });
    return { ok: false, moved: 0, failed: 0, failedPaths: [] };
  }
}

/** True when `overrides` currently grants the gallery entitlement. Thin
 *  wrapper so every caller (reconcile.ts, comp-expiry-sweep.ts, the sweep
 *  below) reads the SAME oracle `richContentBlocksAllowed` uses for the
 *  render gate, rather than re-deriving "is this artist entitled" from
 *  plan_tier alone and missing a per-account entitlement override. */
export function galleryCurrentlyEntitled(
  partial: Partial<AccountOverrides>,
): boolean {
  return richContentBlocksAllowed({ ...DEFAULT_OVERRIDES, ...partial });
}

export type GalleryRelocationSweepResult = {
  relocated: number;
  relocationsStillFailing: number;
  restored: number;
  restoresStillFailing: number;
};

/** Nightly backstop (wired into /api/cron/cleanup): retries any artist whose
 *  physical storage location does not yet match their CURRENT entitlement.
 *  This is state-driven, not event-driven, so it self-heals regardless of
 *  which path changed the artist's entitlement — the billing webhook, the
 *  comp-expiry sweep, or a direct admin override none of the other hooks
 *  cover — and it is what makes a half-failed relocation or restore actually
 *  retryable rather than stuck until the next unrelated entitlement change. */
export async function runGalleryRelocationSweep(): Promise<GalleryRelocationSweepResult> {
  const result: GalleryRelocationSweepResult = {
    relocated: 0,
    relocationsStillFailing: 0,
    restored: 0,
    restoresStillFailing: 0,
  };

  const nowIso = new Date().toISOString();

  // Relocation candidates: not yet archived, and on a plan that COULD be
  // unentitled (free, or a plus comp/subscription past its expiry). Narrows
  // an otherwise fleet-wide scan; the final decision is still
  // galleryCurrentlyEntitled, which also covers a per-account override.
  const { data: relocateCandidates, error: relocateErr } = await serviceClient
    .from("account_overrides")
    .select("artist_id, plan_tier, plan_expires_at, entitlement_overrides")
    .is("gallery_relocated_at", null)
    .or(
      `plan_tier.eq.free,and(plan_tier.eq.plus,plan_expires_at.lt.${nowIso})`,
    );

  if (relocateErr) {
    Sentry.captureException(relocateErr, {
      tags: { action: "gallery_relocation_sweep", step: "relocate_fetch" },
    });
  }

  for (const row of relocateCandidates ?? []) {
    const entitled = galleryCurrentlyEntitled({
      planTier: row.plan_tier as AccountOverrides["planTier"],
      planExpiresAt: row.plan_expires_at as string | null,
      entitlementOverrides:
        (row.entitlement_overrides as AccountOverrides["entitlementOverrides"]) ??
        {},
    });
    if (entitled) continue;
    const outcome = await relocateArtistGallery(row.artist_id as string);
    if (outcome.ok) result.relocated++;
    else result.relocationsStillFailing++;
  }

  // Restore candidates: currently archived. Small, bounded set (only artists
  // ever relocated), so no plan-tier prefilter is needed — every row is
  // re-checked against the live entitlement oracle.
  const { data: restoreCandidates, error: restoreErr } = await serviceClient
    .from("account_overrides")
    .select("artist_id, plan_tier, plan_expires_at, entitlement_overrides")
    .not("gallery_relocated_at", "is", null);

  if (restoreErr) {
    Sentry.captureException(restoreErr, {
      tags: { action: "gallery_relocation_sweep", step: "restore_fetch" },
    });
  }

  for (const row of restoreCandidates ?? []) {
    const entitled = galleryCurrentlyEntitled({
      planTier: row.plan_tier as AccountOverrides["planTier"],
      planExpiresAt: row.plan_expires_at as string | null,
      entitlementOverrides:
        (row.entitlement_overrides as AccountOverrides["entitlementOverrides"]) ??
        {},
    });
    if (!entitled) continue;
    const outcome = await restoreArtistGallery(row.artist_id as string);
    if (outcome.ok) result.restored++;
    else result.restoresStillFailing++;
  }

  return result;
}
