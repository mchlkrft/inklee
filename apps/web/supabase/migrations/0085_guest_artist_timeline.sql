-- 0085: Inklee 2.0 Phase 4 - guest artist timeline visibility
--
-- The studio-controlled switch for the guest artist timeline on the studio's
-- map page (build plan Phase 4 extension; Q16 resolved 2026-07-18). Off by
-- default: the studio opts in. Artist privacy always caps it: only artists
-- with passport_public render named entries; everyone else appears
-- anonymized ("A guest artist" + dates), per the founder's Q16 decision.
-- No new tables: the timeline is a read model over guest_spot_stays.

alter table studio_profiles
  add column if not exists show_guest_timeline boolean not null default false;
