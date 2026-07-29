import { assertSafeTarget } from "../../e2e/helpers/env";

/**
 * Target resolution for the database regression suite.
 *
 * Two independent guards, because they answer different questions:
 *
 *  - the local allowlist answers "is this the kind of target I MEANT to hit?"
 *    These tests create and delete real auth users and write real rows. Only a
 *    local stack is acceptable, even though a dedicated dev project would be
 *    safe for the e2e suite.
 *  - `assertSafeTarget` (shared with the e2e suite) answers "is this a target
 *    I already know is catastrophic?" It carries the production project ref
 *    and host list. Re-deriving that list here would mean maintaining the same
 *    knowledge in two places, and the copy would rot.
 *
 * The allowlist alone would in fact be sufficient today. It is kept as the
 * narrower of the two, with the shared guard behind it, so that a future
 * loosening of the allowlist cannot quietly re-admit production.
 *
 * FAILS rather than skips. The previous version of this suite skipped silently
 * when unconfigured, which is how `test:db` came to exit 0 without executing a
 * single statement. An unrunnable gate must be loud.
 */

export interface DbEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
}

const SETUP_HINT =
  "Database RLS tests are not configured. Start a local stack " +
  "(`supabase start` in apps/web) and copy its values into apps/web/.env.e2e " +
  "(see .env.e2e.example). Never reuse .env.local: it points at PRODUCTION. " +
  "See docs/testing.md.";

export function dbEnv(): DbEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`${SETUP_HINT}\nMissing: ${missing}`);
  }

  // Known-bad list first: the clearest possible message for the worst mistake.
  assertSafeTarget("NEXT_PUBLIC_SUPABASE_URL", url);

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}\n${SETUP_HINT}`,
    );
  }
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(
      `Database RLS tests refuse to run against ${hostname}. They create and ` +
        `delete real auth users, so only a LOCAL Supabase stack is allowed. ` +
        `\n${SETUP_HINT}`,
    );
  }

  return { url, anonKey, serviceKey };
}
