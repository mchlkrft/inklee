import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";
import { dbEnv } from "./helpers/db-env";

/**
 * 0144 `gallery-archive` BUCKET (C1.5, counsel: "unguessable URLs are not
 * access control for images of identifiable people's skin"). Private
 * (`public = false`), RLS enabled on `storage.objects`, and — deliberately,
 * per the migration's own header — ZERO policies for this bucket, the same
 * posture `studio-media` (0078) and `welcome-pack-files` (0086) already use.
 * Nothing before this file proved that posture at the API layer for THIS
 * bucket; a typo in the bucket id, or a stray permissive policy added later
 * for an unrelated reason, would silently reopen it.
 *
 * TWO VACUOUS-PASS TRAPS, found by executing rather than reasoning, both
 * avoided below:
 *
 *   1. `.list()` on this bucket returns `{ data: [], error: null }` for
 *      anon/authenticated — NOT an error. An empty bucket and an
 *      RLS-hidden bucket look identical through `.list()` alone, so this
 *      file does not use it as a rejection signal (it uses it only as a
 *      CONTRAST once a real object is known to exist — see below).
 *   2. `.download()` of a path that never existed also returns 404 "Object
 *      not found" for every role, policy or no policy — so asserting 404
 *      against a MADE-UP path proves nothing. Every read assertion here
 *      targets a path the admin/service client uploaded moments earlier
 *      (proven to exist via the admin positive control before each
 *      rejection is asserted), so the 404 anon/authenticated receive is
 *      demonstrated to mean "hidden", not "absent".
 *
 * Executed 2026-08-02 against the local stack: anon and a real signed-in
 * user both get 404 "Object not found" downloading/signing a path the
 * service role just uploaded and can itself download; both get 403 "new row
 * violates row-level security policy" attempting to upload. MUTATION THAT
 * REDS THIS FILE: add any policy on `storage.objects` scoped to
 * `bucket_id = 'gallery-archive'` for `anon`/`authenticated`, or flip the
 * bucket's `public` column to `true` — either turns the read/write
 * rejections below into successes.
 */

let admin: SupabaseClient;
let anon: SupabaseClient;
let authed: Actor;
const BUCKET = "gallery-archive";
const REAL_PATH = `probe-${Date.now()}.txt`;

beforeAll(async () => {
  admin = adminClient();
  const { url, anonKey } = dbEnv();
  anon = createClient(url, anonKey);
  authed = await makeActor(admin, "gallery-archive-probe");

  // Positive control: prove the object genuinely exists (and that the
  // service role's own access is unaffected) before any rejection below is
  // asserted against it.
  const uploaded = await admin.storage
    .from(BUCKET)
    .upload(REAL_PATH, new Blob(["archived gallery bytes"]), {
      contentType: "text/plain",
    });
  expect(uploaded.error, uploaded.error?.message).toBeNull();

  const adminList = await admin.storage.from(BUCKET).list();
  expect(adminList.error, adminList.error?.message).toBeNull();
  expect(
    adminList.data?.some((f) => f.name === REAL_PATH),
    "the service role must see the object it just created, or the contrast below proves nothing",
  ).toBe(true);
}, 60_000);

afterAll(async () => {
  await admin.storage.from(BUCKET).remove([REAL_PATH]);
  if (authed) {
    await admin.from("profiles").delete().eq("id", authed.id);
    await admin.auth.admin.deleteUser(authed.id);
  }
}, 60_000);

describe("gallery-archive bucket: zero policies means service-role-only (0144)", () => {
  it("bucket exists and is PRIVATE (public = false)", async () => {
    const { data: bucket, error } = await admin.storage.getBucket(BUCKET);
    expect(error, error?.message).toBeNull();
    expect(bucket?.public, "the archive must never be public").toBe(false);
  });

  it("anon cannot download a real object in the bucket", async () => {
    const { data, error } = await anon.storage.from(BUCKET).download(REAL_PATH);
    expect(data).toBeNull();
    expect(error, "expected a rejection, not a successful read").not.toBeNull();
    expect((error as { statusCode?: string })?.statusCode).toBe("404");
  });

  it("anon cannot mint a signed URL for a real object in the bucket", async () => {
    const { data, error } = await anon.storage
      .from(BUCKET)
      .createSignedUrl(REAL_PATH, 60);
    expect(data).toBeNull();
    expect(error, "expected a rejection, not a signed URL").not.toBeNull();
  });

  it("anon cannot upload into the bucket", async () => {
    const { data, error } = await anon.storage
      .from(BUCKET)
      .upload(`anon-${Date.now()}.txt`, new Blob(["nope"]));
    expect(data).toBeNull();
    expect(
      error,
      "expected a rejection, not a successful write",
    ).not.toBeNull();
    expect((error as { statusCode?: string })?.statusCode).toBe("403");
  });

  it("an AUTHENTICATED (non-service) user cannot download a real object either", async () => {
    // Real signed-in JWT, not the anon key — the archive has no owner-select
    // case at all (unlike `bookings_owner_select`), not even for the artist
    // whose own gallery this is, per the migration's own header.
    const { data, error } = await authed.client.storage
      .from(BUCKET)
      .download(REAL_PATH);
    expect(data).toBeNull();
    expect(error, "expected a rejection, not a successful read").not.toBeNull();
    expect((error as { statusCode?: string })?.statusCode).toBe("404");
  });

  it("an AUTHENTICATED (non-service) user cannot upload into the bucket", async () => {
    const { data, error } = await authed.client.storage
      .from(BUCKET)
      .upload(`authed-${Date.now()}.txt`, new Blob(["nope"]));
    expect(data).toBeNull();
    expect(
      error,
      "expected a rejection, not a successful write",
    ).not.toBeNull();
    expect((error as { statusCode?: string })?.statusCode).toBe("403");
  });

  it("neither anon nor an authenticated user can list the object the service role can see", async () => {
    const [anonList, authedList] = await Promise.all([
      anon.storage.from(BUCKET).list(),
      authed.client.storage.from(BUCKET).list(),
    ]);
    // Not decisive alone (see file header) — decisive ONLY because the
    // beforeAll positive control already proved the object is really there
    // for the service role to see.
    expect(anonList.data?.some((f) => f.name === REAL_PATH) ?? false).toBe(
      false,
    );
    expect(authedList.data?.some((f) => f.name === REAL_PATH) ?? false).toBe(
      false,
    );
  });
});
