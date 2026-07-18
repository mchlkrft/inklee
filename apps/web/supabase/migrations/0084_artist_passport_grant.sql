-- 0084: Inklee 2.0 Phase 4 - artist passport write site
--
-- profiles.passport_public shipped in 0076 deliberately UNGRANTED (the 0074
-- enumeration rule: a column grant arrives with its authenticated write
-- site). The write site is here: the passport toggle on /settings/map.
-- The passport itself is a read model over completed guest spot stays
-- (server-shaped, private by default); no new tables.
--
-- ⚠️ Mirrored in apps/web/supabase/seed.sql (the blanket local GRANT ALL
-- would otherwise diverge from prod).

grant update (passport_public) on public.profiles to authenticated;
