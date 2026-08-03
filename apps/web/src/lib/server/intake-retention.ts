import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { daysAgoCutoff } from "@/lib/server/retention-cutoffs";
import {
  asError,
  countMatchingRows,
  withFilters,
  type RetentionFilter,
  type RetentionMode,
  type RetentionStepResult,
} from "@/lib/server/retention-run";
import { PROJECT_STATUSES, type ProjectStatus } from "@inklee/shared/projects";
import {
  PROJECT_MEDIA_BUCKET,
  isProjectMediaPath,
} from "./project-media-storage";

/**
 * LO-5 DPIA §7 mitigation R6: the 90-day intake retention purge.
 *
 * R6 (DPIA §4): "Intake images have no retention rule. The purge is designed
 * but unbuilt. It cannot cause harm today because nothing has been submitted;
 * it becomes live the moment something is." The controller adopted it as a
 * precondition of BOTH activation gates, which is why it is the one R6 gates
 * goods as well as gallery: the intake form is already live.
 *
 * =========================================================================
 * WHAT IS PURGED, AND WHAT IS NOT
 *
 * The IMAGES: `project_media` rows AND the storage objects they point at.
 * Nothing else. The DPIA names "intake images" in §3's flow table and in R6
 * itself; the `projects` row is the artist's business record of an enquiry,
 * with its own lifecycle and its own deletion path (account deletion). Its
 * free text is a decision the controller has not taken and this module must
 * not take for them; see the note at the end of this comment.
 *
 * The images are the part §4 is about. `project_media.kind` is one of
 * `reference`, `body`, `existing_tattoo` (0115): body photographs and
 * photographs of existing tattoos, uploaded through a PUBLIC unauthenticated
 * form, of a person who in the majority case is not an Inklee account holder
 * (§1: "data subjects who are not users").
 *
 * =========================================================================
 * THE TRIGGER IS NOT "90 DAYS FROM CREATION", AND THAT IS THE WHOLE DESIGN
 *
 * The intake sells multi-session work in its own copy: `SESSION_COMMITMENTS`
 * offers "Many sessions over months" and "Open-ended, however long it takes";
 * `PROJECT_SCALES` offers sleeves, back pieces and bodysuits. A blanket
 * 90-day-from-creation purge deletes an artist's LIVE in-progress work,
 * mid-bodysuit, and the reference photographs are the working material.
 *
 * So each project falls in exactly one of three retention classes
 * (`PROJECT_RETENTION_CLASS` below, which is a `Record<ProjectStatus, ...>`
 * so that adding a status to the shared vocabulary is a COMPILE ERROR here
 * rather than a status that silently inherits no rule):
 *
 *   unconverted  `submitted`. The artist has never acted on it. Purge 90 days
 *                after `created_at`.
 *   closed       `completed` / `declined` / `archived`. Purge 90 days after
 *                `closed_at`.
 *   retained     `under_review` / `consultation` / `active`. NOT PURGED. This
 *                is live work.
 *
 * =========================================================================
 * BOTH CLOCKS RUN FROM AN EVENT (counsel deviation D4, migration 0149)
 *
 * D4: "Retention runs from the event, not from `updated_at`. A clock any
 * later touch can restart is not the specified rule and will drift silently."
 *
 *   `created_at` IS the submission event. Set by the column default; no
 *   writer in this codebase ever updates it (they all set `updated_at`
 *   instead). Event-anchored by construction, so the unconverted class needs
 *   no column of its own.
 *
 *   `closed_at` is added by migration 0152 and stamped by a trigger, not by
 *   the call sites, for the reason D4 gives. It is NOT `decided_at`, which
 *   already exists and looks like the anchor: `decided_at` is never stamped
 *   for `archived` (so archived images would be unpurgeable forever, silently)
 *   and never cleared on re-open (so `completed -> active -> completed` leaves
 *   an already-expired clock on live work). 0152's header documents all three
 *   defects against the call-site code.
 *
 * =========================================================================
 * THE EXEMPTION IS MADE VISIBLE, NOT LEFT SILENT
 *
 * `retained` is a deliberate, unbounded exemption: a project parked in
 * `under_review` holds its images indefinitely. That is the correct trade for
 * live work and the wrong one for an abandoned queue, and there is no event
 * that distinguishes them (D4 rules out `updated_at`, which is the only other
 * timestamp on the row). So the size of the exempt set is COUNTED every run
 * (`stale_open_projects_retaining_intake_media`) instead of being invisible.
 * A controller reviewing this control sees the number it is not purging.
 *
 * =========================================================================
 * PROSPECTIVE. Production holds zero projects and has never had an intake
 * submission (DPIA §2, verified). Every count this module reports today is a
 * true zero, and every assertion about its behaviour comes from synthetic
 * fixtures, not from observed production data.
 *
 * =========================================================================
 * NOT DECIDED HERE, and deliberately left for the controller: whether the
 * `projects` ROW (customer email, handle, and free-text description of the
 * client's body and intentions) also expires. R6 as written is about images.
 * Deleting the artist's record of an enquiry is a product decision as much as
 * a data-protection one, and this module purging it silently would be
 * engineering choosing an acceptable risk, which is the thing DPIA §7 exists
 * to stop.
 */

/** DPIA §7 / §9: "the 90-day intake retention purge". */
export const INTAKE_MEDIA_RETENTION_DAYS = 90;

/**
 * How old an OPEN project must be before its retained media is counted as
 * worth a look. Not a rule and not a purge: a review signal for the exempt
 * set, so "we keep these indefinitely" comes with a number attached. A year
 * is past even an open-ended bodysuit's normal cadence.
 */
export const INTAKE_MEDIA_EXEMPT_REVIEW_DAYS = 365;

export type ProjectRetentionClass = "unconverted" | "closed" | "retained";

/**
 * EXHAUSTIVE BY TYPE. `Record<ProjectStatus, ...>` means a new status in
 * `PROJECT_STATUSES` fails the typecheck here until someone decides which
 * retention rule it gets. The alternative (deriving the closed set from
 * `PROJECT_STATUS_META[...].terminal`) would silently drop any new
 * non-terminal status into the exempt class, which is over-retention that
 * nobody chose.
 *
 * `intake-retention.test.ts` additionally asserts this map agrees with
 * `PROJECT_STATUS_META[...].terminal` and with migration 0152's SQL list, so
 * the three copies of "which statuses are closed" cannot drift apart.
 */
export const PROJECT_RETENTION_CLASS: Record<
  ProjectStatus,
  ProjectRetentionClass
> = {
  submitted: "unconverted",
  under_review: "retained",
  consultation: "retained",
  active: "retained",
  completed: "closed",
  declined: "closed",
  archived: "closed",
};

function statusesInClass(cls: ProjectRetentionClass): ProjectStatus[] {
  return PROJECT_STATUSES.filter((s) => PROJECT_RETENTION_CLASS[s] === cls);
}

export const CLOSED_PROJECT_STATUSES = statusesInClass("closed");
export const UNCONVERTED_PROJECT_STATUSES = statusesInClass("unconverted");
export const RETAINED_PROJECT_STATUSES = statusesInClass("retained");

export type PurgeResult = { count: number };

/**
 * `.in()` goes into the request URL, so an unbounded id list becomes an
 * unsendable request. 100 keeps the URL comfortably short.
 */
const PROJECT_ID_CHUNK = 100;
/** Supabase storage `remove()` batch size, matching `storage-purge.ts`. */
const STORAGE_BATCH = 100;
/** Page size for the paginated reads below. */
const PAGE = 500;

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * Every project id matching `filter`, PAGINATED.
 *
 * Not a plain `.select()`: PostgREST silently caps a large result at
 * `db-max-rows`, and a truncated candidate list here would purge fewer
 * projects than the rule requires while reporting a clean, smaller number.
 * That is the same silent-under-report hazard `deleteOrListMatchingRows`
 * documents, solved by paging rather than by throwing, so a genuinely large
 * backlog drains instead of erroring forever.
 */
async function listProjectIds(filter: RetentionFilter): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await withFilters(
      serviceClient.from("projects").select("id"),
      filter,
    ).range(offset, offset + PAGE - 1);
    if (error) throw asError(error);
    const page = (data ?? []) as { id: string }[];
    for (const row of page) ids.push(row.id);
    if (page.length < PAGE) break;
  }
  return ids;
}

type MediaRow = { id: string; storage_path: string };

/** Every media row matching `filter`, paginated for the same reason. */
async function listMediaRows(filter: RetentionFilter): Promise<MediaRow[]> {
  const rows: MediaRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await withFilters(
      serviceClient.from("project_media").select("id, storage_path"),
      filter,
    ).range(offset, offset + PAGE - 1);
    if (error) throw asError(error);
    const page = (data ?? []) as MediaRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/**
 * Delete the storage objects. THROWS on any storage error, and does not catch.
 *
 * Deliberately NOT `purgeStoragePrefix` (storage-purge.ts), which swallows
 * every storage failure because its callers (account deletion, Instagram
 * disconnect) must not abort on one. Here a swallowed failure is the whole
 * defect: the rows would be deleted, the run would report a count, and the
 * photographs would remain in the bucket with nothing left pointing at them.
 * A retention control that fails open is not a retention control (the defect
 * class removed across nine findings on 2026-08-02).
 *
 * Throwing leaves the rows in place, so the next weekly run retries the same
 * set and the step's failure is reported per-block and alerted.
 */
async function removeStorageObjects(paths: string[]): Promise<void> {
  for (const batch of chunked(paths, STORAGE_BATCH)) {
    const { error } = await serviceClient.storage
      .from(PROJECT_MEDIA_BUCKET)
      .remove(batch);
    if (error) {
      throw new Error(
        `storage remove failed for ${batch.length} object(s) in ${PROJECT_MEDIA_BUCKET}: ${error.message}`,
      );
    }
  }
}

/**
 * Purge (or count) the media belonging to `projectIds`.
 *
 * ORDER: OBJECTS FIRST, ROWS SECOND, and it is not interchangeable.
 * `storage_path` is the ONLY thing that can ever find an object again;
 * Postgres cascade does not reach into storage. Deleting rows first and
 * failing on storage would strand the photographs in a private bucket with no
 * index of what they are, which is retained personal data that no later run
 * can find. Failing the other way round leaves rows pointing at objects that
 * are already gone, which the next run finishes cleanly.
 *
 * Both modes are built from ONE predicate per chunk (`inChunk`), so the
 * dry-run count cannot drift from what a real run would touch.
 */
async function purgeMediaForProjects(
  mode: RetentionMode,
  projectIds: string[],
): Promise<number> {
  let total = 0;
  for (const chunk of chunked(projectIds, PROJECT_ID_CHUNK)) {
    const inChunk: RetentionFilter = (q) => q.in("project_id", chunk);

    if (mode === "dry-run") {
      total += await countMatchingRows("project_media", "id", inChunk);
      continue;
    }

    const rows = await listMediaRows(inChunk);
    if (rows.length === 0) continue;

    // Prefix guard BEFORE anything is deleted, over the whole chunk, so one
    // impossible path cannot cause a half-purge. See
    // `isProjectMediaPath` for why the blast radius justifies it.
    for (const row of rows) {
      if (!isProjectMediaPath(row.storage_path)) {
        throw new Error(
          `project_media ${row.id} has a storage_path outside the project-media prefix; refusing to delete anything in this batch`,
        );
      }
    }

    await removeStorageObjects(rows.map((r) => r.storage_path));

    const { data, error } = await serviceClient
      .from("project_media")
      .delete()
      .in(
        "id",
        rows.map((r) => r.id),
      )
      .select("id");
    if (error) throw asError(error);
    total += data?.length ?? 0;
  }
  return total;
}

/**
 * Never converted: still in the initial `submitted` state 90 days after the
 * submission event. The artist has not reviewed it, not declined it and not
 * archived it; nothing about it is live work.
 */
export async function purgeUnconvertedIntakeMedia(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<PurgeResult> {
  const cutoff = daysAgoCutoff(now, INTAKE_MEDIA_RETENTION_DAYS).toISOString();
  const ids = await listProjectIds((q) =>
    q.in("status", UNCONVERTED_PROJECT_STATUSES).lt("created_at", cutoff),
  );
  return { count: await purgeMediaForProjects(mode, ids) };
}

/**
 * Closed: 90 days after the project entered `completed`, `declined` or
 * `archived`. `closed_at` is cleared by 0152's trigger if the project is
 * re-opened, so a re-opened project is back in the `retained` class with no
 * clock at all, and a later re-close starts a fresh 90 days.
 */
export async function purgeClosedProjectIntakeMedia(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<PurgeResult> {
  const cutoff = daysAgoCutoff(now, INTAKE_MEDIA_RETENTION_DAYS).toISOString();
  const ids = await listProjectIds((q) =>
    q.in("status", CLOSED_PROJECT_STATUSES).lt("closed_at", cutoff),
  );
  return { count: await purgeMediaForProjects(mode, ids) };
}

/**
 * The failure mode the closed-project clock introduces, made visible instead
 * of silent. Exactly the shape of `countUnstampedCancelledStandaloneOrders`
 * (shop-retention.ts), for exactly the same reason.
 *
 * A closed project with a NULL `closed_at` never matches `< cutoff`, so its
 * images are never purged, forever, without erroring: over-retention that
 * looks identical to "there was nothing to purge". 0152's trigger and
 * backfill should keep this set permanently empty; counting it every run
 * means a future writer that bypasses the trigger (a raw SQL migration, a
 * restore from a pre-0152 dump) shows up as a number and an alert rather than
 * as compliant-looking silence.
 *
 * Never writes, in either mode.
 */
export async function countUnstampedClosedProjects(): Promise<PurgeResult> {
  const count = await countMatchingRows("projects", "id", (q) =>
    q.in("status", CLOSED_PROJECT_STATUSES).is("closed_at", null),
  );
  if (count > 0) {
    Sentry.captureMessage(
      `Retention: ${count} closed project(s) have no closed_at, so their intake images can never be purged`,
      {
        level: "error",
        tags: { action: "intake_retention_purge", step: "unstamped_closed" },
      },
    );
  }
  return { count };
}

/**
 * How many intake images the exemption is currently holding, for projects old
 * enough that the exemption deserves a look.
 *
 * NOT an alert and NOT a purge. `under_review` / `consultation` / `active`
 * are exempt on purpose and there is no event that separates "a bodysuit in
 * progress" from "a queue nobody triaged" (D4 rules out `updated_at`, the
 * only other timestamp on the row). So the exempt set is reported as a number
 * in the same run log as the purges, which is where anyone assessing this
 * control looks. Silence would let an unbounded exemption look like a
 * bounded one.
 */
export async function countStaleOpenProjectIntakeMedia(
  now: Date = new Date(),
): Promise<PurgeResult> {
  const cutoff = daysAgoCutoff(
    now,
    INTAKE_MEDIA_EXEMPT_REVIEW_DAYS,
  ).toISOString();
  const ids = await listProjectIds((q) =>
    q.in("status", RETAINED_PROJECT_STATUSES).lt("created_at", cutoff),
  );
  let count = 0;
  for (const chunk of chunked(ids, PROJECT_ID_CHUNK)) {
    count += await countMatchingRows("project_media", "id", (q) =>
      q.in("project_id", chunk),
    );
  }
  return { count };
}

/**
 * All four steps, each isolated: one step's failure must never stop the
 * others (the sequential-return defect this cron already fixed once). Every
 * failure is captured to Sentry AND handed back so the route can decide the
 * HTTP status and raise its aggregated alert.
 */
export async function runIntakeRetentionPurges(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<Record<string, RetentionStepResult>> {
  const steps: [string, () => Promise<PurgeResult>][] = [
    [
      "purged_unconverted_intake_media",
      () => purgeUnconvertedIntakeMedia(now, mode),
    ],
    [
      "purged_closed_project_intake_media",
      () => purgeClosedProjectIntakeMedia(now, mode),
    ],
    // Health checks, not purges. Both run in BOTH modes because neither writes.
    ["unstamped_closed_projects", () => countUnstampedClosedProjects()],
    [
      "stale_open_projects_retaining_intake_media",
      () => countStaleOpenProjectIntakeMedia(now),
    ],
  ];

  const results: Record<string, RetentionStepResult> = {};
  for (const [name, fn] of steps) {
    try {
      const { count } = await fn();
      results[name] = { ok: true, count };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[name] = { ok: false, error: message };
      Sentry.captureException(err, {
        tags: { action: "intake_retention_purge", step: name },
      });
    }
  }
  return results;
}
