-- Atomic check-and-delete for product_collections (Plus build P5d, task #19).
--
-- deleteCollectionCore counted product_collection_items rows, then deleted
-- the collection in a SEPARATE round trip: no transaction, no lock, no
-- re-check at delete time. A membership inserted into that collection
-- between the count and the delete (two tabs, two devices, a retried
-- request landing after a delete is already in flight) was destroyed by the
-- composite FK's `on delete cascade`, while the `not_eligible` refusal never
-- saw it. That silently defeats the one guarantee `canDeleteCollection`
-- exists to provide: arranging work on a populated collection cannot be
-- lost without a deliberate archive-first step, because that work has no
-- undo.
--
-- PostgREST cannot express a `NOT EXISTS` filter on a single `delete` call,
-- so this wraps the eligibility check and the delete in one statement, one
-- round trip, one transaction.
--
-- WHY THIS IS TWO STATEMENTS AND NOT ONE. This is the whole point of the file;
-- the one-statement version was written first, shipped as "atomic", and lost
-- data.
--
-- A single `delete ... where not exists (...)` is NOT safe here. Under READ
-- COMMITTED a statement evaluates its subqueries against ONE snapshot, taken
-- when the statement begins. A concurrent insert into the child takes FOR KEY
-- SHARE on the parent row (the composite FK), so the DELETE *waits* on that
-- lock, but waiting does not make it re-evaluate the `not exists`. When the
-- writer commits, the DELETE proceeds on its stale snapshot and the FK's
-- `on delete cascade` destroys the just-committed membership, while the caller
-- is told 'deleted'.
--
-- Recorded because it was believed twice and disproved by execution both times
-- (2026-07-29, retracted in place per house style). Representative run against
-- the one-statement version: deleter called at 07:30:41.175, writer COMMITted
-- at 07:30:45.593, RPC returned 'deleted' at 07:30:45.594, 1.1ms later.
-- Collection gone, membership gone, product orphaned. Every SEQUENTIAL probe
-- passed, which is exactly why it survived review: the defect only exists in
-- the interleaving.
--
-- The lock-then-recheck below is the fix. Regression test:
-- apps/web/tests/db/collection-delete-race.test.ts, which must be shown RED
-- against the one-statement body before it is trusted.
--
-- Mirrors `canDeleteCollection` exactly: memberCount === 0 || archivedAt,
-- i.e. archived bypasses the population check, empty collections are always
-- eligible.
--
-- SECURITY INVOKER (the default, stated explicitly): this needs no elevated
-- privilege. It runs as the calling artist, so the existing DELETE and
-- SELECT policies on product_collections apply on top of the explicit
-- artist_id filters below, the same defense-in-depth `0122`'s composite FKs
-- already use alongside RLS.
create or replace function delete_collection_if_eligible(
  p_collection_id uuid,
  p_artist_id uuid
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted_id uuid;
begin
  -- STEP 1, its own statement on purpose. Take a lock on the parent that
  -- CONFLICTS with the FOR KEY SHARE a child insert acquires, so this blocks
  -- until any in-flight membership write has committed or rolled back.
  --
  -- Being a separate statement is what makes it work: under READ COMMITTED
  -- each statement takes a FRESH snapshot, so the delete below re-evaluates
  -- `not exists` against a snapshot that INCLUDES whatever committed while we
  -- were waiting here. The one-statement version waited on the very same lock
  -- and still lost, because it resumed on its original snapshot.
  --
  -- No row matched (wrong id, another artist's row, already deleted) simply
  -- locks nothing and falls through to the same 'gone' answer as before.
  perform 1
  from product_collections
  where id = p_collection_id
    and artist_id = p_artist_id
  for update;

  -- STEP 2. Fresh snapshot. The eligibility rule is unchanged and still
  -- mirrors canDeleteCollection exactly: archived bypasses the population
  -- check, otherwise the collection must be empty.
  delete from product_collections
  where id = p_collection_id
    and artist_id = p_artist_id
    and (
      archived_at is not null
      or not exists (
        select 1 from product_collection_items
        where collection_id = p_collection_id
      )
    )
  returning id into v_deleted_id;

  if v_deleted_id is not null then
    return 'deleted';
  end if;

  -- The delete matched nothing. Distinguish why with a read scoped to the
  -- artist_id filter (not just RLS) so a caller can never learn whether some
  -- OTHER artist's collection exists by id: still-populated-and-live rows
  -- for THIS artist read as `not_eligible`; anything else (wrong id, another
  -- artist's row, already deleted) reads as `gone`.
  if exists (
    select 1 from product_collections
    where id = p_collection_id and artist_id = p_artist_id
  ) then
    return 'not_eligible';
  end if;

  return 'gone';
end;
$$;

revoke execute on function delete_collection_if_eligible(uuid, uuid) from public, anon;
grant execute on function delete_collection_if_eligible(uuid, uuid) to authenticated;
