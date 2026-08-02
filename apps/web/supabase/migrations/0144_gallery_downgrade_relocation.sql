-- 0144: gallery downgrade relocation (Plus build, counsel C1.5,
-- docs/legal/counsel-accountant-handoff-2026-08.md Part 4).
--
-- Counsel's conditional pass on "public but unlisted" gallery storage carries
-- one behaviour change: on downgrade, the underlying storage OBJECTS must
-- stop being publicly reachable, not merely stop being RENDERED. Today an
-- unentitled artist's gallery block is hidden (bio-page.ts gateMediaBlocksForSave
-- / [slug]/hub/page.tsx richBlocksAllowed) but the files stay world-fetchable
-- at their existing `logos` bucket URL forever — "unguessable URLs are not
-- access control for images of identifiable people's skin." Relocate, never
-- delete: the artist may resubscribe, and deletion on gallery-item removal /
-- account closure is already built (hub-images.ts / account-deletion.ts) and
-- unaffected by this migration.
--
-- 1. A dedicated PRIVATE bucket for archived gallery objects. Reusing the
--    `bookings` bucket (also private, migration 0022) would mix an unrelated
--    retention/access regime — booking reference photos, owner-readable via
--    `bookings_owner_select` — with archived gallery portfolio images, which
--    need NO read policy at all: the entire point of the archive is that
--    nobody resolves these by URL while the artist is unentitled, not even
--    the artist themselves (they see the gallery is paused in the editor,
--    read through the DB row, never through a bucket URL). No policies are
--    created here, mirroring `studio-media` / `welcome-pack-files`
--    (0078/0086): RLS enabled + zero policies = service-role-only by default,
--    same posture, one line shorter because there is no owner-select case to
--    add on top of it.
insert into storage.buckets (id, name, public)
values ('gallery-archive', 'gallery-archive', false)
on conflict (id) do update set public = excluded.public;

-- 2. The observability + retry marker
--    (apps/web/src/lib/server/gallery-relocation.ts). NULL = this artist's
--    gallery objects are wherever they normally live (the public `logos`
--    bucket, or the artist has none saved). NOT NULL = every one of them was
--    CONFIRMED moved into `gallery-archive` as of this timestamp.
--
--    A relocation that only partly succeeds (one storage call fails) leaves
--    this column NULL on purpose: the nightly retry sweep
--    (runGalleryRelocationSweep, wired into /api/cron/cleanup) treats "not
--    fully archived" as the thing to keep retrying, rather than a half-done
--    relocation quietly reading as "handled" because n-1 of n objects moved.
--    Symmetric on restore: a resubscribe clears this back to NULL only once
--    every object is confirmed back in `logos`, for the same reason.
alter table account_overrides
  add column if not exists gallery_relocated_at timestamptz;
