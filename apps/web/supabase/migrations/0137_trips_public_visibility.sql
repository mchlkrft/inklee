-- 0137: trips.is_public_visible (Plus build C5, decision S3).
--
-- The Hub (and any future public surface) used to reuse `show_on_booking_form`
-- to decide whether a trip shows in its guest-spots block (hub-feature-data.ts,
-- pre-this-migration), with a comment admitting trips have no public-visibility
-- flag of their own. That coupling means the booking form and the Hub could
-- never disagree about a trip: hiding a guest spot from the booking form also
-- hid it from the Hub, whether the artist meant that or not. C5 gives the two
-- surfaces independent flags: `show_on_booking_form` keeps meaning "offer this
-- trip as a booking-form option", and this new column means "show this trip on
-- my Hub and future public surfaces".
--
-- BACKFILL, and why it copies show_on_booking_form rather than defaulting bare
-- true: until this migration ships, the Hub's own behaviour WAS governed by
-- show_on_booking_form (that was the only signal it had). A trip an artist had
-- hidden from the booking form was, as an observed side effect, also hidden
-- from the Hub. Defaulting every existing trip to `true` would flip that:
-- trips an artist had deliberately hidden would suddenly surface on the Hub,
-- which is a privacy regression, not a neutral default. Copying
-- show_on_booking_form's current value is therefore copying OBSERVED
-- behaviour forward, not inventing data for a column that never existed. This
-- is the opposite situation from 0116/0131 (fee_tier / fee_schedule_version),
-- which deliberately did NOT backfill because there was no prior observed
-- value to preserve — an invented tier would have been worse than an honest
-- null. Here there is a real prior value, and preserving it is the safe
-- default; the alternative is the one that would need justifying.
--
-- CONVERGENCE (AGENTS.md's non-convergent-migration footgun): the column add
-- and the one-time backfill are both inside the SAME
-- `if not exists (this column)` guard, so a re-run after the column already
-- exists skips both statements entirely. This is deliberate, not an oversight:
-- once the column exists, `is_public_visible` is an INDEPENDENT flag an artist
-- may have already changed (e.g. hidden a trip from the booking form after
-- this migration ran, while leaving it visible on the Hub). A re-run that
-- re-copied show_on_booking_form at that point would silently overwrite the
-- artist's own Hub-visibility choice with whatever the booking-form flag
-- happens to be today — an unrelated field clobbering a supposedly
-- independent one. Guarding the copy on "column did not exist yet" is what
-- makes it a true one-time migration rather than a standing sync.
--
-- GRANT: trips carries no column-level privilege restriction today (unlike
-- profiles, which 0074 locked down to a specific column list) — 0016 never
-- issued a REVOKE on trips, so the table-level authenticated UPDATE grant
-- already covers every column, including ones added later via ALTER TABLE.
-- This GRANT is therefore currently redundant with that blanket grant. It is
-- added anyway, defensively, so that IF a future migration ever narrows
-- trips the way 0074 narrowed profiles, this column is already enumerated and
-- cannot be silently dropped from write access (the rls-write-policy-gap
-- lesson: a column missing from a privilege list fails silently via
-- PostgREST, not with an obvious error).

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'trips'
      and column_name = 'is_public_visible'
  ) then
    alter table public.trips
      add column is_public_visible boolean not null default true;

    update public.trips
      set is_public_visible = show_on_booking_form;
  end if;
end $$;

grant update (is_public_visible) on public.trips to authenticated;
