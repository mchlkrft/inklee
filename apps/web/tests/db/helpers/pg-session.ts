import postgres from "postgres";
import { assertSafeTarget } from "../../e2e/helpers/env";

/**
 * A dedicated, single-connection Postgres session for tests that need TWO
 * clients holding state at the same time.
 *
 * WHY THIS EXISTS. Everything else in `tests/db/` talks to PostgREST, and
 * PostgREST cannot express the shape we need: it runs every request in its own
 * transaction and returns when that transaction ends, so there is no way to
 * open a transaction, write, and *hold it uncommitted* while a second client
 * does something else. A race whose whole mechanism is "what one session sees
 * while another session's write is still uncommitted" is unreachable through
 * that API. Migration 0124's TOCTOU is exactly that shape.
 *
 * The supabase-js client cannot substitute either, for the same reason.
 *
 * SCOPE. Use PostgREST for anything you can. This helper bypasses PostgREST,
 * so a session opened here does NOT automatically get the anon/authenticated
 * role, the JWT claims, or the role's `statement_timeout`. `becomeArtist()`
 * reproduces the first two explicitly; nothing reproduces the third. The
 * intended split, and the one the race test uses, is: hold the concurrent
 * write here, and make the call under test through the real PostgREST client
 * so the path being tested stays the production path.
 *
 * SAFETY. Same posture as `db-env.ts`, and for the same reason: this connects
 * with superuser credentials and writes real rows. It refuses any non-local
 * target and FAILS rather than skipping when unconfigured.
 */

const SETUP_HINT =
  "Multi-connection database tests need DATABASE_URL pointing at the LOCAL " +
  "Supabase Postgres (default postgresql://postgres:postgres@127.0.0.1:54322/postgres). " +
  "Start a local stack (`supabase start` in apps/web) and set it in " +
  "apps/web/.env.e2e. Never reuse .env.local: it points at PRODUCTION. " +
  "See docs/testing.md.";

export function localDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(`${SETUP_HINT}\nMissing: DATABASE_URL`);
  }

  // Known-bad list first, shared with the e2e suite so the production ref and
  // host list are not maintained in a second place.
  assertSafeTarget("DATABASE_URL", url);

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL: ${url}\n${SETUP_HINT}`);
  }
  // Verified rather than assumed: WHATWG `URL` does parse a `postgresql://`
  // authority and returns `127.0.0.1` here. Executed before relying on it,
  // because a silently-empty hostname would turn this guard into a no-op.
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(
      `Multi-connection database tests refuse to run against ${hostname}. ` +
        `They open superuser connections and hold write transactions open. ` +
        `Only a LOCAL Supabase stack is allowed.\n${SETUP_HINT}`,
    );
  }
  return url;
}

type Sql = ReturnType<typeof postgres>;

/**
 * One backend, one connection, explicit transaction control.
 *
 * `max: 1` is load-bearing, not tuning. Two awaits landing on two different
 * pooled backends would silently turn "hold a transaction open and then commit
 * it" into two unrelated autocommitted statements, and the race test would
 * pass while testing nothing. Executed: with `max: 1`, `pg_backend_pid()` is
 * stable across sequential awaits on one session and different between two
 * sessions. `backendPid()` exists so a test can ASSERT that separation instead
 * of trusting this comment.
 */
export class PgSession {
  readonly label: string;
  private readonly sql: Sql;
  private inTransaction = false;

  private constructor(label: string, sql: Sql) {
    this.label = label;
    this.sql = sql;
  }

  static open(label: string): PgSession {
    const sql = postgres(localDatabaseUrl(), {
      max: 1,
      idle_timeout: 0,
      // Plain single statements only; keeping prepared statements out of the
      // way removes one source of "why did this behave differently the second
      // time" in a suite whose whole subject is ordering.
      prepare: false,
      onnotice: () => {},
    });
    return new PgSession(label, sql);
  }

  async query<T = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const rows = await this.sql.unsafe(text, params as never[]);
    return rows as unknown as T[];
  }

  async backendPid(): Promise<number> {
    const rows = await this.query<{ pid: number }>(
      "select pg_backend_pid() as pid",
    );
    return rows[0].pid;
  }

  async begin(): Promise<void> {
    if (this.inTransaction) {
      throw new Error(`PgSession(${this.label}) is already in a transaction`);
    }
    await this.query("begin");
    this.inTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error(`PgSession(${this.label}) has no transaction to commit`);
    }
    await this.query("commit");
    this.inTransaction = false;
  }

  /** Safe to call unconditionally, including in a `finally`. */
  async rollbackIfOpen(): Promise<void> {
    if (!this.inTransaction) return;
    await this.query("rollback");
    this.inTransaction = false;
  }

  /**
   * Run the rest of THIS transaction as the given artist, under RLS.
   *
   * `set local` and `set_config(..., true)` are both transaction-scoped, so
   * commit or rollback returns the session to `postgres` with no claims.
   * Executed, not assumed: the race test asserts `current_user` is
   * `authenticated` DURING the held transaction and `postgres` again after the
   * commit, on the same session.
   *
   * Transaction-only on purpose: a session-scoped `set role authenticated`
   * would leak into later queries on the same connection, and the failure
   * (a cleanup statement suddenly hitting RLS) looks nothing like its cause.
   */
  async becomeArtist(artistId: string): Promise<void> {
    if (!this.inTransaction) {
      throw new Error(
        `PgSession(${this.label}).becomeArtist() must be called inside a ` +
          `transaction, or the role and claims would leak into later queries`,
      );
    }
    await this.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: artistId, role: "authenticated" }),
    ]);
    await this.query("set local role authenticated");
  }

  async currentUser(): Promise<string> {
    const rows = await this.query<{ cu: string }>("select current_user as cu");
    return rows[0].cu;
  }

  /**
   * How many backends are currently WAITING on a lock held by `pid`.
   *
   * This is the behavioural proof that two sessions actually contended. Timing
   * alone cannot distinguish "the delete blocked on the writer's row lock"
   * from "the delete happened to be slow", and a race test that cannot tell
   * those apart can pass for the wrong reason.
   */
  async countBlockedBy(pid: number): Promise<number> {
    const rows = await this.query<{ n: string }>(
      `select count(*)::text as n
         from pg_stat_activity
        where pid <> $1
          and cardinality(pg_blocking_pids(pid)) > 0
          and $1 = any(pg_blocking_pids(pid))`,
      [pid],
    );
    return Number(rows[0].n);
  }

  async close(): Promise<void> {
    await this.rollbackIfOpen().catch(() => {});
    await this.sql.end({ timeout: 5 });
  }
}
