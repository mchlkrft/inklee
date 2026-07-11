/**
 * Written to gsc_connections.last_error when Google rejects the refresh token
 * (invalid_grant): the one sync failure that needs the admin to reconnect
 * Search Console rather than wait for the next run. Shared so the writer
 * (lib/gsc/sync.ts) and the reader (getGscConnectionState) never drift.
 */
export const GSC_AUTH_EXPIRED_ERROR =
  "Google authorization expired. Reconnect Search Console.";
