import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * LO-5 DPIA §7 mitigation R6: the 90-day intake retention purge.
 *
 * WHY THIS FILE FAKES A DATABASE INSTEAD OF CANNING REPLIES. The whole
 * question R6 asks is WHICH projects expire, and a canned `{ data, error }`
 * answers it by assumption. The store below evaluates the real filters
 * (`in`, `lt`, `is`, `range`) against real rows and real timestamps, so a
 * wrong status class or a wrong boundary reds a test instead of sailing
 * through a stub. The end-to-end counterpart, against real Postgres and real
 * storage objects, is `tests/db/intake-retention-purge.test.ts`.
 *
 * EVERY REFUSAL TEST HERE HAS A DISTINCTION PARTNER. A purge that deletes
 * nothing passes every "it must not delete X" test ever written, so each
 * exemption is paired with a case that MUST be purged, and the fail-loud
 * tests assert both that it throws and that the data survived.
 *
 * SYNTHETIC. Production has never had an intake submission, so every fixture
 * here is invented and nothing in this file is evidence about real data.
 */

const { mockCaptureException, mockCaptureMessage } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockCaptureMessage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
}));

// ---------------------------------------------------------------------------
// A small in-memory Postgres/PostgREST stand-in.

type Row = Record<string, unknown>;

const store: Record<string, Row[]> = { projects: [], project_media: [] };
/** Storage keys currently present in the bucket. */
let bucketObjects = new Set<string>();
/** Ordered log of every mutating call, so ordering can be asserted. */
let callLog: string[] = [];
/** Injectable failures. */
let storageRemoveError: string | null = null;
let tableErrors: Record<string, string> = {};

function compare(a: unknown, b: unknown): number {
  const da = Date.parse(String(a));
  const db = Date.parse(String(b));
  if (!Number.isNaN(da) && !Number.isNaN(db)) return da - db;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

class FakeQuery {
  private preds: ((r: Row) => boolean)[] = [];
  private from = 0;
  private to = Number.MAX_SAFE_INTEGER;
  private head = false;
  private wantsCount = false;

  constructor(
    private table: string,
    private op: "select" | "delete",
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) this.head = true;
    if (opts?.count) this.wantsCount = true;
    return this;
  }
  in(col: string, vals: readonly unknown[]) {
    this.preds.push((r) => vals.includes(r[col]));
    return this;
  }
  eq(col: string, v: unknown) {
    this.preds.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.preds.push((r) => r[col] !== v);
    return this;
  }
  is(col: string, v: unknown) {
    this.preds.push((r) => (v === null ? r[col] == null : r[col] === v));
    return this;
  }
  lt(col: string, v: unknown) {
    this.preds.push((r) => r[col] != null && compare(r[col], v) < 0);
    return this;
  }
  gte(col: string, v: unknown) {
    this.preds.push((r) => r[col] != null && compare(r[col], v) >= 0);
    return this;
  }
  not() {
    return this;
  }
  or() {
    return this;
  }
  range(from: number, to: number) {
    this.from = from;
    this.to = to;
    return this;
  }

  private matches(): Row[] {
    return (store[this.table] ?? []).filter((r) =>
      this.preds.every((p) => p(r)),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then(resolve: (v: any) => unknown) {
    const err = tableErrors[this.table];
    if (err) {
      return resolve({
        data: null,
        error: { message: err, code: "PGRSTX" },
        count: null,
        status: 400,
      });
    }
    const matched = this.matches();
    if (this.op === "delete") {
      callLog.push(`delete:${this.table}:${matched.length}`);
      store[this.table] = (store[this.table] ?? []).filter(
        (r) => !matched.includes(r),
      );
      return resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
    }
    if (this.head && this.wantsCount) {
      return resolve({ count: matched.length, error: null, status: 200 });
    }
    return resolve({
      data: matched.slice(this.from, this.to + 1),
      error: null,
    });
  }
}

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => ({
      select: (cols?: string, opts?: { count?: string; head?: boolean }) =>
        new FakeQuery(table, "select").select(cols, opts),
      delete: () => new FakeQuery(table, "delete"),
    }),
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          callLog.push(`storage:${bucket}:${paths.length}`);
          if (storageRemoveError) {
            return { data: null, error: { message: storageRemoveError } };
          }
          for (const p of paths) bucketObjects.delete(p);
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  },
}));

import {
  CLOSED_PROJECT_STATUSES,
  INTAKE_MEDIA_RETENTION_DAYS,
  PROJECT_RETENTION_CLASS,
  RETAINED_PROJECT_STATUSES,
  UNCONVERTED_PROJECT_STATUSES,
  countStaleOpenProjectIntakeMedia,
  countUnstampedClosedProjects,
  purgeClosedProjectIntakeMedia,
  purgeUnconvertedIntakeMedia,
  runIntakeRetentionPurges,
} from "../intake-retention";
import {
  PROJECT_MEDIA_BUCKET,
  PROJECT_MEDIA_PREFIX,
  isProjectMediaPath,
  projectMediaFolder,
} from "../project-media-storage";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_META,
  type ProjectStatus,
} from "@inklee/shared/projects";

// ---------------------------------------------------------------------------
// Fixtures

const NOW = new Date("2026-08-03T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) =>
  new Date(NOW.getTime() - days * DAY).toISOString();

let seq = 0;

/** A project plus one media row and one object in the bucket. */
function seedProject(opts: {
  status: ProjectStatus;
  createdDaysAgo?: number;
  closedDaysAgo?: number | null;
  media?: number;
  storagePath?: (i: number) => string;
}): { id: string; paths: string[] } {
  const id = `p-${++seq}`;
  store.projects.push({
    id,
    artist_id: "artist-1",
    status: opts.status,
    created_at: ago(opts.createdDaysAgo ?? 1),
    updated_at: ago(0),
    closed_at:
      opts.closedDaysAgo == null ? null : ago(opts.closedDaysAgo as number),
  });
  const paths: string[] = [];
  for (let i = 0; i < (opts.media ?? 1); i += 1) {
    const p = opts.storagePath
      ? opts.storagePath(i)
      : `${projectMediaFolder("artist-1", id)}img-${i}.webp`;
    paths.push(p);
    store.project_media.push({
      id: `${id}-m${i}`,
      project_id: id,
      artist_id: "artist-1",
      storage_path: p,
    });
    bucketObjects.add(p);
  }
  return { id, paths };
}

function mediaIdsFor(projectId: string): string[] {
  return store.project_media
    .filter((r) => r.project_id === projectId)
    .map((r) => r.id as string);
}

beforeEach(() => {
  store.projects = [];
  store.project_media = [];
  bucketObjects = new Set();
  callLog = [];
  storageRemoveError = null;
  tableErrors = {};
  seq = 0;
  mockCaptureException.mockClear();
  mockCaptureMessage.mockClear();
});

// ---------------------------------------------------------------------------

describe("R6: the retention class of every project status is decided", () => {
  it("classifies every status in the shared vocabulary", () => {
    for (const s of PROJECT_STATUSES) {
      expect(PROJECT_RETENTION_CLASS[s], `${s} has no retention class`).toBe(
        PROJECT_RETENTION_CLASS[s],
      );
      expect(["unconverted", "closed", "retained"]).toContain(
        PROJECT_RETENTION_CLASS[s],
      );
    }
    // The three classes partition the vocabulary: no status is in two, none
    // is in none.
    const all = [
      ...CLOSED_PROJECT_STATUSES,
      ...UNCONVERTED_PROJECT_STATUSES,
      ...RETAINED_PROJECT_STATUSES,
    ];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...PROJECT_STATUSES].sort());
  });

  it("agrees with PROJECT_STATUS_META about which statuses are terminal", () => {
    // Three copies of "which statuses are closed" exist: this map, the shared
    // vocabulary's `terminal` flag, and migration 0152's SQL. If they drift,
    // a project closes in one place and stays open in another.
    for (const s of PROJECT_STATUSES) {
      expect(
        PROJECT_RETENTION_CLASS[s] === "closed",
        `${s}: retention class and PROJECT_STATUS_META.terminal disagree`,
      ).toBe(PROJECT_STATUS_META[s].terminal);
    }
  });

  it("agrees with migration 0152's SQL status list", () => {
    const sql = readFileSync(
      path.join(
        __dirname,
        "../../../../supabase/migrations/0152_project_closed_at.sql",
      ),
      "utf8",
    );
    // Comment lines stripped first: the assertion is about the SQL that
    // EXECUTES, and 0152's header discusses these statuses in prose.
    const executable = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    const lists = [...executable.matchAll(/status in \(([^)]*)\)/g)].map((m) =>
      [...m[1].matchAll(/'([a-z_]+)'/g)].map((q) => q[1]).sort(),
    );
    // Two in the trigger (new.status / old.status) and one in the backfill.
    expect(lists.length, "0152 no longer has the status lists").toBe(3);
    const expected = [...CLOSED_PROJECT_STATUSES].sort();
    for (const list of lists) expect(list).toEqual(expected);
  });

  it("keeps the retention period at the 90 days §7 adopted", () => {
    expect(INTAKE_MEDIA_RETENTION_DAYS).toBe(90);
  });
});

describe("R6: the never-converted clock", () => {
  it("purges the images of a submitted intake 91 days old", async () => {
    const { id, paths } = seedProject({
      status: "submitted",
      createdDaysAgo: 91,
      media: 2,
    });

    const { count } = await purgeUnconvertedIntakeMedia(NOW);

    expect(count).toBe(2);
    expect(mediaIdsFor(id)).toEqual([]);
    for (const p of paths) expect(bucketObjects.has(p)).toBe(false);
  });

  it("DISTINCTION: leaves a submitted intake 89 days old alone", async () => {
    const { id, paths } = seedProject({
      status: "submitted",
      createdDaysAgo: 89,
    });

    const { count } = await purgeUnconvertedIntakeMedia(NOW);

    expect(count).toBe(0);
    expect(mediaIdsFor(id)).toHaveLength(1);
    expect(bucketObjects.has(paths[0])).toBe(true);
  });
});

describe("R6: live work is exempt, which is the point of the design", () => {
  it.each(RETAINED_PROJECT_STATUSES)(
    "DISTINCTION: keeps the images of a %s project that is 400 days old",
    async (status) => {
      // The intake's own copy sells "many sessions over months", sleeves,
      // back pieces and bodysuits. A 90-day-from-creation rule would delete
      // an artist's working references mid-project.
      const { id, paths } = seedProject({ status, createdDaysAgo: 400 });

      const unconverted = await purgeUnconvertedIntakeMedia(NOW);
      const closed = await purgeClosedProjectIntakeMedia(NOW);

      expect(unconverted.count + closed.count).toBe(0);
      expect(mediaIdsFor(id)).toHaveLength(1);
      expect(bucketObjects.has(paths[0])).toBe(true);
    },
  );

  it("DISTINCTION: a re-opened project has no clock at all", async () => {
    // 0152's trigger clears `closed_at` on the way out of the closed set, so
    // a project that was completed a year ago and re-opened is live work with
    // no expiry, not an instantly-expired one.
    const { id, paths } = seedProject({
      status: "active",
      createdDaysAgo: 400,
      closedDaysAgo: null,
    });

    expect((await purgeClosedProjectIntakeMedia(NOW)).count).toBe(0);
    expect(mediaIdsFor(id)).toHaveLength(1);
    expect(bucketObjects.has(paths[0])).toBe(true);
  });
});

describe("R6: the closed clock", () => {
  it.each(CLOSED_PROJECT_STATUSES)(
    "purges the images of a %s project closed 91 days ago",
    async (status) => {
      const { id, paths } = seedProject({
        status,
        createdDaysAgo: 400,
        closedDaysAgo: 91,
      });

      const { count } = await purgeClosedProjectIntakeMedia(NOW);

      expect(count).toBe(1);
      expect(mediaIdsFor(id)).toEqual([]);
      expect(bucketObjects.has(paths[0])).toBe(false);
    },
  );

  it("DISTINCTION: leaves a project closed 89 days ago alone", async () => {
    const { id, paths } = seedProject({
      status: "completed",
      createdDaysAgo: 400,
      closedDaysAgo: 89,
    });

    expect((await purgeClosedProjectIntakeMedia(NOW)).count).toBe(0);
    expect(mediaIdsFor(id)).toHaveLength(1);
    expect(bucketObjects.has(paths[0])).toBe(true);
  });

  it("does not use the never-converted clock on a closed project", async () => {
    // Closed yesterday, submitted a year ago. The submission is ancient; the
    // closure is not. Anchoring the closed class on `created_at` would purge
    // work that finished 24 hours ago.
    const { id } = seedProject({
      status: "completed",
      createdDaysAgo: 400,
      closedDaysAgo: 1,
    });

    expect((await purgeUnconvertedIntakeMedia(NOW)).count).toBe(0);
    expect((await purgeClosedProjectIntakeMedia(NOW)).count).toBe(0);
    expect(mediaIdsFor(id)).toHaveLength(1);
  });
});

describe("R6: storage objects, not just rows", () => {
  it("deletes the object BEFORE the row", async () => {
    // `storage_path` is the only thing that can find the object again, and
    // Postgres cascade does not reach storage. Rows-first plus a storage
    // failure strands the photographs with no index of what they are.
    seedProject({ status: "submitted", createdDaysAgo: 91 });

    await purgeUnconvertedIntakeMedia(NOW);

    const storageAt = callLog.findIndex((c) => c.startsWith("storage:"));
    const deleteAt = callLog.findIndex((c) =>
      c.startsWith("delete:project_media"),
    );
    expect(storageAt).toBeGreaterThanOrEqual(0);
    expect(deleteAt).toBeGreaterThanOrEqual(0);
    expect(storageAt).toBeLessThan(deleteAt);
  });

  it("FAILS LOUD on a storage error and keeps the rows", async () => {
    const { id, paths } = seedProject({
      status: "submitted",
      createdDaysAgo: 91,
    });
    storageRemoveError = "bucket unreachable";

    await expect(purgeUnconvertedIntakeMedia(NOW)).rejects.toThrow(
      /storage remove failed/i,
    );
    // Not a permissive default: the row survives so the next run retries it.
    expect(mediaIdsFor(id)).toHaveLength(1);
    expect(bucketObjects.has(paths[0])).toBe(true);
    expect(callLog.some((c) => c.startsWith("delete:"))).toBe(false);
  });

  it("FAILS LOUD on a path outside the project-media prefix", async () => {
    // `bookings` also holds ordinary booking reference images at
    // `{artistId}/{bookingId}/...` on a different clock. A stray path must
    // never let this purge reach them.
    const { id } = seedProject({
      status: "submitted",
      createdDaysAgo: 91,
      storagePath: () => "artist-1/booking-9/reference.webp",
    });

    await expect(purgeUnconvertedIntakeMedia(NOW)).rejects.toThrow(
      /outside the project-media prefix/i,
    );
    expect(mediaIdsFor(id)).toHaveLength(1);
    expect(callLog.some((c) => c.startsWith("storage:"))).toBe(false);
    expect(callLog.some((c) => c.startsWith("delete:"))).toBe(false);
  });

  it("refuses the whole batch, not just the bad row", async () => {
    const good = seedProject({ status: "submitted", createdDaysAgo: 91 });
    const bad = seedProject({
      status: "submitted",
      createdDaysAgo: 91,
      storagePath: () => "logos/elsewhere.webp",
    });

    await expect(purgeUnconvertedIntakeMedia(NOW)).rejects.toThrow();
    expect(mediaIdsFor(good.id)).toHaveLength(1);
    expect(mediaIdsFor(bad.id)).toHaveLength(1);
    expect(bucketObjects.has(good.paths[0])).toBe(true);
  });

  it("pins the bucket and the prefix, which are a contract with objects already written", () => {
    // Found by mutation: changing PROJECT_MEDIA_PREFIX reds nothing, because
    // every other assertion derives the expected path from the constant
    // itself and stays self-consistent. It is not self-consistent in
    // production. Objects uploaded before such a change stay at
    // `bookings/projects/...` for good, so moving either value orphans them
    // twice over: the purge stops matching them, and `isProjectMediaPath`
    // starts REFUSING the rows that still point at them, which throws this
    // block on every run forever. Migration 0115 records the same two values
    // as where this table's media lives.
    expect(PROJECT_MEDIA_BUCKET).toBe("bookings");
    expect(PROJECT_MEDIA_PREFIX).toBe("projects/");

    const sql = readFileSync(
      path.join(
        __dirname,
        "../../../../supabase/migrations/0115_large_projects.sql",
      ),
      "utf8",
    );
    // 0115 states it across two wrapped comment lines; unwrap and flatten
    // whitespace (and CRLF) before matching the sentence.
    const unwrapped = sql.replace(/[\r\n]+--\s*/g, " ").replace(/\s+/g, " ");
    expect(unwrapped).toContain("`bookings` bucket under a `projects/` prefix");
  });

  it("DISTINCTION: the path the uploader actually writes is accepted", () => {
    const written = `${projectMediaFolder("a1", "p1")}${"x".repeat(8)}.webp`;
    expect(written.startsWith(PROJECT_MEDIA_PREFIX)).toBe(true);
    expect(isProjectMediaPath(written)).toBe(true);
    expect(isProjectMediaPath("a1/booking-1/ref.webp")).toBe(false);
    expect(isProjectMediaPath(PROJECT_MEDIA_PREFIX)).toBe(false);
  });

  it("FAILS LOUD on a row-delete error after the objects are gone", async () => {
    seedProject({ status: "submitted", createdDaysAgo: 91 });
    tableErrors = { project_media: "delete refused" };

    await expect(purgeUnconvertedIntakeMedia(NOW)).rejects.toThrow(
      /delete refused/,
    );
  });
});

describe("R6: dry-run counts and never writes", () => {
  it("reports the same number a real purge would delete, and touches nothing", async () => {
    const { id, paths } = seedProject({
      status: "submitted",
      createdDaysAgo: 91,
      media: 3,
    });
    seedProject({ status: "active", createdDaysAgo: 400, media: 5 });

    const dry = await purgeUnconvertedIntakeMedia(NOW, "dry-run");

    expect(dry.count).toBe(3);
    expect(mediaIdsFor(id)).toHaveLength(3);
    for (const p of paths) expect(bucketObjects.has(p)).toBe(true);
    expect(callLog.some((c) => c.startsWith("storage:"))).toBe(false);
    expect(callLog.some((c) => c.startsWith("delete:"))).toBe(false);

    // And the real run then deletes exactly that many.
    expect((await purgeUnconvertedIntakeMedia(NOW)).count).toBe(3);
  });
});

describe("R6: the health checks make the silent failures visible", () => {
  it("counts and ALERTS on a closed project with no closed_at", async () => {
    // Never matches `< cutoff`, so its images would be unpurgeable forever
    // while the run reported a clean zero.
    seedProject({
      status: "declined",
      createdDaysAgo: 400,
      closedDaysAgo: null,
    });

    const { count } = await countUnstampedClosedProjects();

    expect(count).toBe(1);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(String(mockCaptureMessage.mock.calls[0][0])).toMatch(
      /can never be purged/,
    );
  });

  it("DISTINCTION: stays quiet when every closed project is stamped", async () => {
    seedProject({ status: "declined", closedDaysAgo: 5 });
    seedProject({ status: "active", createdDaysAgo: 400 });

    const { count } = await countUnstampedClosedProjects();

    expect(count).toBe(0);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("reports how many images the exemption is holding", async () => {
    seedProject({ status: "active", createdDaysAgo: 400, media: 4 });
    // Too young to be worth reviewing, and a closed one is not exempt at all.
    seedProject({ status: "consultation", createdDaysAgo: 10, media: 2 });
    seedProject({ status: "completed", createdDaysAgo: 400, closedDaysAgo: 1 });

    expect((await countStaleOpenProjectIntakeMedia(NOW)).count).toBe(4);
  });
});

describe("R6: the batch loops purge everything they matched", () => {
  it("purges past the 100-project chunk boundary", async () => {
    for (let i = 0; i < 250; i += 1) {
      seedProject({ status: "submitted", createdDaysAgo: 91 });
    }

    const { count } = await purgeUnconvertedIntakeMedia(NOW);

    expect(count).toBe(250);
    expect(store.project_media).toHaveLength(0);
    expect(bucketObjects.size).toBe(0);
  });

  it("pages past the 500-row candidate read", async () => {
    for (let i = 0; i < 600; i += 1) {
      seedProject({ status: "submitted", createdDaysAgo: 91 });
    }

    expect((await purgeUnconvertedIntakeMedia(NOW)).count).toBe(600);
    expect(store.project_media).toHaveLength(0);
  });
});

describe("R6: the run isolates its steps", () => {
  it("reports every block, and one failure does not stop the others", async () => {
    seedProject({ status: "submitted", createdDaysAgo: 91 });
    tableErrors = { project_media: "boom" };

    const steps = await runIntakeRetentionPurges(NOW, "purge");

    expect(steps.purged_unconverted_intake_media.ok).toBe(false);
    // The other three still ran and still reported.
    expect(steps.purged_closed_project_intake_media.ok).toBe(true);
    expect(steps.unstamped_closed_projects.ok).toBe(true);
    expect(steps.stale_open_projects_retaining_intake_media.ok).toBe(true);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it("reports all four blocks by name on a clean run", async () => {
    const steps = await runIntakeRetentionPurges(NOW, "dry-run");
    expect(Object.keys(steps).sort()).toEqual([
      "purged_closed_project_intake_media",
      "purged_unconverted_intake_media",
      "stale_open_projects_retaining_intake_media",
      "unstamped_closed_projects",
    ]);
    for (const [name, r] of Object.entries(steps)) {
      expect(r.ok, `${name} failed`).toBe(true);
    }
  });
});
