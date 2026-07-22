-- 0103: possibly-closed map locations (map redesign Slice 4; trust surface).
--
-- Artist "closed" / "outdated details" corrections previously landed as
-- map_reports with NO effect on the pin. An admin actioning such a report can
-- now flag the location possibly_closed, so the detail warns that the studio
-- may have shut. It is a soft, reversible signal, deliberately NOT a
-- moderation_status value (that gates rendering): a possibly-closed studio
-- still shows, just with a warning. A genuinely gone studio is still taken down
-- through moderation_status = hidden / removed. Cleared automatically when an
-- owner confirms the place is open (claim approval or a profile edit).
--
-- map_locations is service-role only (zero client policies), so no grant is
-- needed; the admin action and the owner cores both write through the service
-- client. Additive and reversible (drop the column).

alter table public.map_locations
  add column if not exists possibly_closed boolean not null default false;
