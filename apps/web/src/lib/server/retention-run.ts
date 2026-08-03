import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";

/**
 * Shared machinery for the retention purge run (counsel Q14,
 * docs/legal/counsel-handoff-2026-08-02.md Part 5).
 *
 * Counsel's answer to "a control that has never fired" asks for three things:
 *   (1) a staging run against real-schema synthetic expiring data covering
 *       every block, recorded;
 *   (2) a production DRY-RUN / report mode each cycle logging matched-row
 *       counts per block, so that zero is an evidenced result rather than
 *       silence;
 *   (3) blocks that continue on error, with every block failure alerting.
 *
 * (3) was already true of the route before this file existed. This module is
 * (2): a `mode` every purge step honours, a durable per-run evidence row, and
 * one aggregated alert naming the blocks that failed.
 *
 * THE POINT OF `withFilters`. A dry-run whose predicate has drifted from the
 * purge's predicate is worse than no dry-run: it produces a number that looks
 * like evidence and is not. So a step declares its WHERE clause exactly once,
 * as a function, and both the counting query and the mutating query are built
 * by applying that same function. There is no second copy to diverge.
 */

export type RetentionMode = "purge" | "dry-run";

export type RetentionStepResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * The slice of the supabase-js filter API the retention steps actually use.
 * `.delete()`, `.update()` and `.select()` all return a
 * `PostgrestFilterBuilder`, so all three accept these methods — but their
 * generic parameters differ, and supabase-js does not export a shape that
 * unifies them without naming the row type of every table. This structural
 * type plus the single cast in `withFilters` is the price of writing each
 * predicate once; the alternative (a copy of the predicate per mode) is the
 * failure this whole module exists to avoid.
 */
type FilterableQuery = {
  is(column: string, value: null): FilterableQuery;
  eq(column: string, value: unknown): FilterableQuery;
  neq(column: string, value: unknown): FilterableQuery;
  in(column: string, values: readonly unknown[]): FilterableQuery;
  lt(column: string, value: unknown): FilterableQuery;
  gte(column: string, value: unknown): FilterableQuery;
  not(column: string, operator: string, value: unknown): FilterableQuery;
  /** PostgREST `or=(...)`. Needed by the archive purge, whose predicate has a
   *  genuine disjunction (no retained Connect pointer, OR a teardown that
   *  completed) that must mirror a DB trigger clause for clause. */
  or(filters: string): FilterableQuery;
};

export type RetentionFilter = (query: FilterableQuery) => FilterableQuery;

export function withFilters<T>(query: T, apply: RetentionFilter): T {
  return apply(query as FilterableQuery) as T;
}

/**
 * A PostgrestError is a PLAIN OBJECT, not an Error. Throwing it raw means
 * every `err instanceof Error ? err.message : String(err)` in the callers
 * (the cron route, both retention runners) renders it as the literal string
 * "[object Object]" — so the block failure alerts, the response body and the
 * `retention_purge_runs` evidence row all record that a block failed and none
 * of them record WHY. Caught by the route test asserting the message text,
 * after the first version of this module replaced the route's original
 * `throw new Error(error.message)` with a bare `throw error`.
 *
 * Exported because `intake-retention.ts` (LO-5 DPIA R6) issues its own reads
 * outside the `deleteMatchingRows` helpers and must render a PostgrestError
 * the same way. A second local copy would be a second thing to get wrong.
 */
export function asError(error: { message?: string; code?: string }): Error {
  const message = error?.message ?? String(error);
  return new Error(error?.code ? `${message} (${error.code})` : message);
}

/**
 * How many rows the predicate matches, without touching any of them.
 *
 * `count === null` IS AN ERROR HERE, and finding that out is the reason this
 * check exists. Executed against the local stack: a head-count against a
 * table that does not exist returns
 * `{ status: 204, error: null, count: null }` — no error at all — because a
 * `head: true` request carries no body for PostgREST to put its 404 payload
 * in. A DELETE against the same missing table fails loudly with PGRST205.
 * So `return count ?? 0` made a block with a wrong table or a
 * schema-cache-stale name report a confident ZERO in dry-run while a real
 * purge on the same block would error.
 *
 * That is precisely the failure Q14 exists to prevent: the dry-run is
 * supposed to be the evidence that these blocks work, and it would have been
 * evidence of the opposite, indistinguishable from "nothing was expiring".
 * Found by mutating the block's table name and watching the DB dry-run test
 * stay green (tests/db/retention-purge-dry-run.test.ts).
 *
 * A successful exact count always returns a number, including 0, so treating
 * null as a failure costs nothing legitimate.
 */
export async function countMatchingRows(
  table: string,
  column: string,
  apply: RetentionFilter,
): Promise<number> {
  const { count, error, status } = await withFilters(
    serviceClient.from(table).select(column, { count: "exact", head: true }),
    apply,
  );
  if (error) throw asError(error);
  if (count === null || count === undefined) {
    throw new Error(
      `${table}: exact count returned no value (status ${status}); the table or filter is not valid against the deployed schema, so this block's dry-run count cannot be trusted`,
    );
  }
  return count;
}

/**
 * Delete every matching row (`purge`), or count them without deleting
 * (`dry-run`). Both branches are built from the SAME `apply`.
 */
export async function deleteMatchingRows(
  mode: RetentionMode,
  table: string,
  column: string,
  apply: RetentionFilter,
): Promise<number> {
  if (mode === "dry-run") return countMatchingRows(table, column, apply);
  const { data, error } = await withFilters(
    serviceClient.from(table).delete(),
    apply,
  ).select(column);
  if (error) throw asError(error);
  return data?.length ?? 0;
}

/**
 * Like `deleteMatchingRows`, but also hands back the ids removed (purge) or
 * that WOULD be removed (dry-run). Needed only by the dependency-ordered
 * billing purge, where a later step must exclude rows an earlier step has
 * already taken out — in dry-run nothing is actually gone, so the later step
 * has to be told which ids to treat as gone or it will over-protect and
 * report a count lower than a real run would delete.
 *
 * ONLY for small, bounded result sets. It materialises every id, so the
 * dry-run branch cross-checks the fetched length against an exact head-count
 * and throws if they disagree: PostgREST silently caps a large select at
 * `db-max-rows`, and a truncated list here would understate the dry-run and
 * over-protect the dependent step, both while looking like a clean result.
 * Blocks with unbounded row counts (the analytics tables) use
 * `deleteMatchingRows`, whose dry-run is a head-count and has no such cap.
 */
export async function deleteOrListMatchingRows(
  mode: RetentionMode,
  table: string,
  column: string,
  apply: RetentionFilter,
): Promise<{ count: number; ids: string[] }> {
  if (mode === "dry-run") {
    const { data, error } = await withFilters(
      serviceClient.from(table).select(column),
      apply,
    );
    if (error) throw asError(error);
    const ids = pluckIds(data, column);
    const exact = await countMatchingRows(table, column, apply);
    if (exact !== ids.length) {
      throw new Error(
        `${table}: dry-run listed ${ids.length} rows but the exact count is ${exact} (result truncated; the dry-run cannot be trusted)`,
      );
    }
    return { count: ids.length, ids };
  }
  const { data, error } = await withFilters(
    serviceClient.from(table).delete(),
    apply,
  ).select(column);
  if (error) throw asError(error);
  const ids = pluckIds(data, column);
  return { count: ids.length, ids };
}

/**
 * `data` is typed `unknown` on purpose. supabase-js types a `.select(col)`
 * row as a union that includes `GenericStringError`, so asserting the row
 * straight to `Record<string, unknown>` is a TS2352 "neither type
 * sufficiently overlaps" error and the usual workaround is a double
 * `as unknown as`. Taking the payload as `unknown` at the boundary and
 * narrowing once here does the same job with one honest assertion instead of
 * two, and puts it in exactly one place.
 */
function pluckIds(data: unknown, column: string): string[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => (row as Record<string, unknown>)[column] as string);
}

/**
 * Pseudonymisation half of the same idea: apply `patch` to every matching row
 * (`purge`), or count them without writing (`dry-run`).
 */
export async function updateMatchingRows(
  mode: RetentionMode,
  table: string,
  column: string,
  patch: Record<string, unknown>,
  apply: RetentionFilter,
): Promise<number> {
  if (mode === "dry-run") return countMatchingRows(table, column, apply);
  const { data, error } = await withFilters(
    serviceClient.from(table).update(patch),
    apply,
  ).select(column);
  if (error) throw asError(error);
  return data?.length ?? 0;
}

/**
 * ONE aggregated alert naming every block that failed, on top of the
 * per-block `captureException` each step already emits. The per-block
 * exceptions are what a responder debugs; this one is what tells them the
 * scope in a single line, and it is what makes "a failed block is visible"
 * true even when several fail at once and the individual exceptions get
 * grouped together by Sentry's fingerprinting.
 */
export function alertOnRetentionStepFailures(
  mode: RetentionMode,
  errors: { step: string; error: string }[],
): void {
  if (errors.length === 0) return;
  Sentry.captureMessage(
    `Retention ${mode}: ${errors.length} block(s) failed (${errors
      .map((e) => e.step)
      .join(", ")})`,
    {
      level: "error",
      tags: { action: "retention_purge", mode },
      extra: { failed_steps: errors },
    },
  );
}

/**
 * The durable evidence row (migration 0149, `retention_purge_runs`). Counsel:
 * "zero is then an evidenced result, not silence." An HTTP 200 does not
 * survive log retention; this row does.
 *
 * BEST EFFORT BY DESIGN. In `purge` mode the deletions have already happened
 * by the time this is called, and they are not transactional with the log
 * write. Throwing here would turn a bookkeeping failure into a 500 on a run
 * that actually succeeded, inviting a re-run — so the failure is captured,
 * reported back in the response body as `run_log_error`, and never raised.
 * It is reported rather than swallowed because a purge nobody can evidence is
 * precisely the Q14 problem.
 */
export async function recordRetentionRun(input: {
  mode: RetentionMode;
  ok: boolean;
  stepCounts: Record<string, number>;
  stepErrors: { step: string; error: string }[];
  durationMs: number;
  now?: Date;
}): Promise<string | null> {
  try {
    const { error } = await serviceClient.from("retention_purge_runs").insert({
      ran_at: (input.now ?? new Date()).toISOString(),
      mode: input.mode,
      ok: input.ok,
      step_counts: input.stepCounts,
      step_errors: input.stepErrors,
      duration_ms: input.durationMs,
    });
    if (error) throw new Error(error.message);
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, {
      tags: { action: "retention_purge", step: "retention_run_log" },
    });
    return message;
  }
}

/**
 * Parses `?mode=` off the cron request. Anything other than an explicit
 * `dry-run` is a real purge, INCLUDING a malformed value: Vercel's scheduled
 * invocation sends no query string at all, and a typo must never silently
 * downgrade the scheduled purge into a no-op that still reports success.
 */
export function retentionModeFromRequest(request: Request): RetentionMode {
  try {
    const mode = new URL(request.url).searchParams.get("mode");
    return mode === "dry-run" ? "dry-run" : "purge";
  } catch {
    return "purge";
  }
}
