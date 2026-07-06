-- Meta's deauthorize / data-deletion callbacks identify the user by the
-- app-scoped user id returned by the api.instagram.com token exchange, which
-- can differ from the professional-account IGID that /me returns (what
-- instagram_user_id stores). Capture both so the callback lookup cannot miss.
-- Nullable: rows connected before this column exist backfill on reconnect.
ALTER TABLE instagram_accounts
  ADD COLUMN IF NOT EXISTS app_scoped_user_id text;
