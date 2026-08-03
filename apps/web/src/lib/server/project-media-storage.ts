/**
 * Where large-project intake photographs live, in ONE place.
 *
 * Two writers care about this and they must never disagree: `projects.ts`
 * puts objects there, and `intake-retention.ts` (LO-5 DPIA R6) deletes them.
 * A retention purge pointed at the wrong bucket or the wrong prefix reports a
 * clean zero forever while the images it was built to remove sit untouched,
 * which is the failure this module exists to make impossible.
 *
 * No DB, no service client, no `server-only`: pure strings, so the prefix
 * guard below can be unit-tested directly (same posture as
 * `retention-cutoffs.ts`).
 */

/** The existing PRIVATE bookings bucket. Migration 0115: "same kind of
 *  object, same lifecycle, so no second bucket, policy set or cleanup job is
 *  introduced to hold it." */
export const PROJECT_MEDIA_BUCKET = "bookings";

/** Trailing slash included so `startsWith` cannot match a sibling prefix
 *  (a future `projects-archive/...` must not look like project media). */
export const PROJECT_MEDIA_PREFIX = "projects/";

/** `projects/{artistId}/{projectId}/` -- the folder one project's media
 *  occupies. Exported so the purge can be reasoned about against the exact
 *  shape the uploader writes. */
export function projectMediaFolder(
  artistId: string,
  projectId: string,
): string {
  return `${PROJECT_MEDIA_PREFIX}${artistId}/${projectId}/`;
}

/**
 * Is this storage key inside the project-media area of the bookings bucket?
 *
 * THE POINT IS THE BOOKING IMAGES SHARING THIS BUCKET. `bookings` also holds
 * client reference images for ordinary booking requests, at
 * `{artistId}/{bookingId}/...`, on a completely different retention clock
 * (30 days after booking resolution). A `project_media.storage_path` that
 * somehow pointed outside `projects/` would let the intake purge delete
 * those. Rows are only ever written server-side by `projects.ts`, so this is
 * defence in depth, but the blast radius if it were ever wrong is another
 * feature's client photographs.
 *
 * The caller THROWS on false rather than skipping. A path that should be
 * impossible means something is wrong that a human must look at, and skipping
 * it would leave the row and the object behind while the run reported success.
 */
export function isProjectMediaPath(path: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith(PROJECT_MEDIA_PREFIX) &&
    path.length > PROJECT_MEDIA_PREFIX.length
  );
}
