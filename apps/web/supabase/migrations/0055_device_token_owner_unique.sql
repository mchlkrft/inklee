-- MOBILE-01 (Codex audit 2026-06-24): a globally-UNIQUE device_tokens.token +
-- upsert onConflict(token) let one artist re-register another artist's Expo push
-- token and TRANSFER ownership (a leaked token would let B steal A's push
-- channel). Scope uniqueness to (artist_id, token) instead: re-registering by the
-- SAME artist updates last_seen; a different artist gets a separate row (no
-- transfer). Sign-out deletes only the current artist's row, and the push sender
-- prunes Expo "DeviceNotRegistered" tokens.

ALTER TABLE device_tokens DROP CONSTRAINT IF EXISTS device_tokens_token_key;

ALTER TABLE device_tokens
  ADD CONSTRAINT device_tokens_artist_token_key UNIQUE (artist_id, token);
