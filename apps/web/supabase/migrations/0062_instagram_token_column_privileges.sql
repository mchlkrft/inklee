-- The privacy policy states the Instagram access token is never exposed to the
-- browser or the mobile app. Enforce that at the database layer: the RLS policy
-- from 0019 ("artist manages own instagram account", FOR ALL USING artist_id =
-- auth.uid()) let the artist's OWN JWT select access_token through PostgREST,
-- even though no app code path ever reads it outside the service role.
-- Drop table-level SELECT for the user-facing roles and re-grant only the
-- non-secret columns. access_token and app_scoped_user_id stay service-role
-- only. RLS still scopes the granted columns to the owner's row.
--
-- Footgun for future migrations: column-level grants do NOT auto-extend. Any
-- new column added to instagram_accounts that user-context code must read
-- needs an explicit GRANT SELECT (new_column) TO authenticated here-after.
REVOKE SELECT ON instagram_accounts FROM anon, authenticated;
GRANT SELECT (
  id,
  artist_id,
  instagram_user_id,
  username,
  token_expires_at,
  last_sync_at,
  connected,
  created_at,
  updated_at
) ON instagram_accounts TO authenticated;
