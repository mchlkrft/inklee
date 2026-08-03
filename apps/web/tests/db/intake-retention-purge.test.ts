import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";

vi.mock("server-only", () => ({}));

import {
  purgeClosedProjectIntakeMedia,
  purgeUnconvertedIntakeMedia,
  countUnstampedClosedProjects,
} from "@/lib/server/intake-retention";
import {
  PROJECT_MEDIA_BUCKET,
  projectMediaFolder,
} from "@/lib/server/project-media-storage";

/**
 * LO-5 DPIA §7 mitigation R6, against a real Postgres and a REAL STORAGE
 * BUCKET.
 *
 * The unit tests fake both, which is enough to pin the retention classes and
 * the boundaries but cannot prove the two things R6 is actually about:
 *
 *   1. migration 0152's trigger stamps and CLEARS `closed_at` the way the
 *      purge assumes. A trigger is not a pure function; the only way to know
 *      what it does is to make Postgres do it.
 *   2. the storage OBJECT is gone, not just the row. "Postgres cascade does
 *      not delete storage objects" is the entire reason this block exists,
 *      and a mocked bucket would report success either way. Here the object
 *      is uploaded for real and its absence is checked by downloading it.
 *
 * SYNTHETIC. Production has never had an intake submission (DPIA §2), so
 * every fixture is invented. Nothing here is evidence about real data; it is
 * evidence about the control.
 */

const LABEL = "r6-intake";
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

let admin: SupabaseClient;
let artist: Actor;
const createdProjects: string[] = [];
const uploadedPaths: string[] = [];

async function makeProject(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from("projects")
    .insert({
      artist_id: artist.id,
      customer_email: `${LABEL}-${Math.random().toString(16).slice(2)}@example.com`,
      title: "R6 fixture",
      description: "A synthetic intake used only by the retention test.",
      scale: "back_piece",
      ...fields,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const id = data!.id as string;
  createdProjects.push(id);
  return id;
}

/** Upload a real object and the `project_media` row that points at it. */
async function attachMedia(projectId: string): Promise<string> {
  const path = `${projectMediaFolder(artist.id, projectId)}${Math.random().toString(16).slice(2)}.webp`;
  const { error: upErr } = await admin.storage
    .from(PROJECT_MEDIA_BUCKET)
    .upload(path, new Uint8Array([1, 2, 3, 4]), {
      contentType: "image/webp",
    });
  expect(upErr, upErr?.message).toBeNull();
  uploadedPaths.push(path);

  const { error } = await admin.from("project_media").insert({
    project_id: projectId,
    artist_id: artist.id,
    storage_path: path,
  });
  expect(error, error?.message).toBeNull();
  return path;
}

async function objectExists(path: string): Promise<boolean> {
  const { data, error } = await admin.storage
    .from(PROJECT_MEDIA_BUCKET)
    .download(path);
  return !error && data != null;
}

async function mediaCount(projectId: string): Promise<number> {
  const { count, error } = await admin
    .from("project_media")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  expect(error, error?.message).toBeNull();
  return count ?? 0;
}

async function closedAt(projectId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("projects")
    .select("closed_at")
    .eq("id", projectId)
    .single();
  expect(error, error?.message).toBeNull();
  return (data!.closed_at as string | null) ?? null;
}

beforeAll(async () => {
  admin = adminClient();
  artist = await makeActor(admin, LABEL);
}, 60_000);

afterAll(async () => {
  if (uploadedPaths.length > 0) {
    await admin.storage.from(PROJECT_MEDIA_BUCKET).remove(uploadedPaths);
  }
  if (createdProjects.length > 0) {
    await admin.from("projects").delete().in("id", createdProjects);
  }
  await admin.from("profiles").delete().eq("id", artist.id);
  await admin.auth.admin.deleteUser(artist.id);
}, 60_000);

describe("0152: the closed_at trigger, against real Postgres", () => {
  it("stamps on the way into a closed status", async () => {
    const id = await makeProject({ status: "submitted" });
    expect(await closedAt(id)).toBeNull();

    await admin.from("projects").update({ status: "declined" }).eq("id", id);
    expect(await closedAt(id)).not.toBeNull();
  });

  it("stamps a row INSERTED already closed", async () => {
    // Without case 1 this row would be unpurgeable forever.
    const id = await makeProject({ status: "archived" });
    expect(await closedAt(id)).not.toBeNull();
  });

  it("does NOT restart the clock on a later touch (counsel D4)", async () => {
    const id = await makeProject({ status: "completed" });
    const first = await closedAt(id);
    expect(first).not.toBeNull();

    await new Promise((r) => setTimeout(r, 50));
    await admin
      .from("projects")
      .update({ artist_note: "an unrelated edit" })
      .eq("id", id);
    expect(await closedAt(id)).toBe(first);

    // Nor on a move to another closed status: filing is not a new closure.
    await admin.from("projects").update({ status: "archived" }).eq("id", id);
    expect(await closedAt(id)).toBe(first);
  });

  it("CLEARS the clock when a project re-opens, and re-stamps on re-close", async () => {
    // The defect `decided_at` has: it keeps the first decision time, so a
    // re-closed project would arrive already expired.
    const id = await makeProject({ status: "completed", closed_at: ago(400) });
    expect(await closedAt(id)).not.toBeNull();

    await admin.from("projects").update({ status: "active" }).eq("id", id);
    expect(await closedAt(id)).toBeNull();

    await admin.from("projects").update({ status: "completed" }).eq("id", id);
    const restamped = await closedAt(id);
    expect(restamped).not.toBeNull();
    expect(Date.parse(restamped!)).toBeGreaterThan(Date.parse(ago(1)));
  });

  it("accepts an explicit value so a fixture can be old", async () => {
    const id = await makeProject({ status: "declined", closed_at: ago(120) });
    expect(Date.parse((await closedAt(id))!)).toBeLessThan(
      Date.parse(ago(100)),
    );
  });
});

describe("R6: the purge removes the storage OBJECT, not only the row", () => {
  it("purges a never-converted intake and its object", async () => {
    const id = await makeProject({
      status: "submitted",
      created_at: ago(91),
    });
    const path = await attachMedia(id);
    expect(await objectExists(path)).toBe(true);

    const { count } = await purgeUnconvertedIntakeMedia(new Date());

    expect(count).toBeGreaterThanOrEqual(1);
    expect(await mediaCount(id)).toBe(0);
    expect(
      await objectExists(path),
      "the row is gone but the photograph is still in the bucket",
    ).toBe(false);
  });

  it("purges a closed project and its object", async () => {
    const id = await makeProject({
      status: "completed",
      created_at: ago(400),
      closed_at: ago(91),
    });
    const path = await attachMedia(id);

    const { count } = await purgeClosedProjectIntakeMedia(new Date());

    expect(count).toBeGreaterThanOrEqual(1);
    expect(await mediaCount(id)).toBe(0);
    expect(await objectExists(path)).toBe(false);
  });

  it("DISTINCTION: leaves live in-progress work untouched", async () => {
    // A bodysuit booked over a year. Both the row and the photograph survive.
    const id = await makeProject({ status: "active", created_at: ago(400) });
    const path = await attachMedia(id);

    await purgeUnconvertedIntakeMedia(new Date());
    await purgeClosedProjectIntakeMedia(new Date());

    expect(await mediaCount(id)).toBe(1);
    expect(await objectExists(path)).toBe(true);
  });

  it("DISTINCTION: leaves a project inside its 90 days untouched", async () => {
    const submitted = await makeProject({
      status: "submitted",
      created_at: ago(89),
    });
    const submittedPath = await attachMedia(submitted);
    const closed = await makeProject({
      status: "declined",
      created_at: ago(400),
      closed_at: ago(89),
    });
    const closedPath = await attachMedia(closed);

    await purgeUnconvertedIntakeMedia(new Date());
    await purgeClosedProjectIntakeMedia(new Date());

    expect(await mediaCount(submitted)).toBe(1);
    expect(await objectExists(submittedPath)).toBe(true);
    expect(await mediaCount(closed)).toBe(1);
    expect(await objectExists(closedPath)).toBe(true);
  });

  it("dry-run reports the count and deletes neither row nor object", async () => {
    const id = await makeProject({ status: "submitted", created_at: ago(120) });
    const path = await attachMedia(id);

    const { count } = await purgeUnconvertedIntakeMedia(new Date(), "dry-run");

    expect(count).toBeGreaterThanOrEqual(1);
    expect(await mediaCount(id)).toBe(1);
    expect(await objectExists(path)).toBe(true);
  });
});

describe("R6: the unstamped health check runs against the live schema", () => {
  it("returns a number rather than erroring", async () => {
    // 0152's trigger should keep this permanently zero. What matters here is
    // that the query is valid against the deployed schema, which a mocked
    // test cannot establish.
    const { count } = await countUnstampedClosedProjects();
    expect(typeof count).toBe("number");
    expect(count).toBe(0);
  });
});
