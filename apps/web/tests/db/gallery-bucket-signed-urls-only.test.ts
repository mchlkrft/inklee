import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";
import { dbEnv } from "./helpers/db-env";

/**
 * 0151 LIVE `gallery` BUCKET — LO-5 DPIA R4, counsel Q18.
 *
 * DPIA §4 R4: "Unguessable URLs are not access control. Counsel named this
 * directly. Gallery objects sit at public URLs; signed expiring URLs are dated
 * and not built." This file is the evidence for the key
 * `dpia_r4_signed_gallery_urls_built`.
 *
 * THE CLAIM UNDER TEST IS THE REFUSAL, NOT THE SIGNATURE. "A signed URL works"
 * and "an unsigned request is refused" are different claims and only the
 * second one is the control: a signed URL over a still-public object would
 * pass the first and fail the second, and that is precisely the theatre this
 * migration exists to avoid. So the primary assertions below all fetch WITHOUT
 * a signature and require a refusal. The signed fetch appears only as the
 * DISTINCTION control (a bucket that refuses everything, including the
 * legitimate render path, would pass every refusal test here).
 *
 * These are raw `fetch` calls, not supabase-js storage calls, on purpose. The
 * threat is a browser or a crawler with a URL, not a configured SDK client, and
 * the SDK attaches an apikey header of its own that would quietly change what
 * is being tested.
 *
 * VACUOUS-PASS TRAPS, inherited from the sibling file
 * `gallery-archive-bucket-unreachable.test.ts` (whose header documents them
 * from having been hit) and avoided the same way:
 *
 *   1. A 404 against a path that never existed proves nothing: Storage 404s a
 *      missing object for every role. Every rejection below therefore targets
 *      a path the service role uploaded moments earlier and can itself read,
 *      proven by a positive control in `beforeAll`.
 *   2. `.list()` returning `{ data: [], error: null }` for anon is not a
 *      rejection signal on its own, so it is used only as a contrast against
 *      the service role genuinely seeing the object.
 *
 * MUTATION THAT REDS THIS FILE: flip the bucket's `public` column to true
 * (`update storage.buckets set public = true where id = 'gallery'`), or add any
 * `storage.objects` policy scoped to `bucket_id = 'gallery'` for anon or
 * authenticated. Executed: doing the former turns the two public-URL refusals
 * into 200s. Verified 2026-08-03 against the local stack.
 */

let admin: SupabaseClient;
let anon: SupabaseClient;
let authed: Actor;
let baseUrl: string;

const BUCKET = "gallery";
// The real shape a gallery object has: `{uid}/hub/{uuid}.webp`.
const REAL_PATH = `probe-artist/hub/probe-${Date.now()}.webp`;
const BYTES = "gallery bytes standing in for a client photograph";

/** The URL a browser would hold if the object were public (pre-0151 shape). */
const publicUrl = () =>
  `${baseUrl}/storage/v1/object/public/${BUCKET}/${REAL_PATH}`;
/** The INERT canonical URL actually stored in a gallery block after 0151. */
const authenticatedUrl = () =>
  `${baseUrl}/storage/v1/object/${BUCKET}/${REAL_PATH}`;

beforeAll(async () => {
  admin = adminClient();
  const { url, anonKey } = dbEnv();
  baseUrl = url.replace(/\/+$/, "");
  anon = createClient(url, anonKey);
  authed = await makeActor(admin, "gallery-live-probe");

  const uploaded = await admin.storage
    .from(BUCKET)
    .upload(REAL_PATH, new Blob([BYTES]), { contentType: "image/webp" });
  expect(uploaded.error, uploaded.error?.message).toBeNull();

  // POSITIVE CONTROL: the object genuinely exists and the service role can see
  // it. Without this, every 404 below could just mean "nothing is there".
  const adminList = await admin.storage.from(BUCKET).list("probe-artist/hub");
  expect(adminList.error, adminList.error?.message).toBeNull();
  expect(
    adminList.data?.some((f) => REAL_PATH.endsWith(f.name)),
    "the service role must see the object it just created, or every refusal below proves nothing",
  ).toBe(true);
}, 60_000);

afterAll(async () => {
  await admin.storage.from(BUCKET).remove([REAL_PATH]);
  if (authed) {
    await admin.from("profiles").delete().eq("id", authed.id);
    await admin.auth.admin.deleteUser(authed.id);
  }
}, 60_000);

describe("gallery bucket: an UNSIGNED request is refused (0151, DPIA R4)", () => {
  it("the bucket exists and is PRIVATE (public = false)", async () => {
    const { data: bucket, error } = await admin.storage.getBucket(BUCKET);
    expect(error, error?.message).toBeNull();
    expect(
      bucket?.public,
      "a public live-gallery bucket makes every signed URL in this feature decoration",
    ).toBe(false);
  });

  it("an unauthenticated GET of the PUBLIC-form URL is refused", async () => {
    // The pre-0151 URL shape. This is the exact request a crawler, a shared
    // link, or a browser-history entry would make.
    const res = await fetch(publicUrl());
    expect(
      res.ok,
      `expected a refusal, got ${res.status} — the object is world-readable`,
    ).toBe(false);
    expect(res.status).toBe(400);
  });

  it("an unauthenticated GET of the STORED canonical URL is refused", async () => {
    // This is the value actually persisted in a gallery block. It must be
    // inert: if this ever returns bytes, the stored settings JSON is itself a
    // working link to a private image.
    const res = await fetch(authenticatedUrl());
    expect(
      res.ok,
      `expected a refusal, got ${res.status} — the stored URL is directly fetchable`,
    ).toBe(false);
    expect([400, 401]).toContain(res.status);
  });

  it("a request bearing only the public ANON key is refused", async () => {
    // The anon key is shipped to every browser, so it is not a secret and must
    // not function as an access grant here.
    const { anonKey } = dbEnv();
    const res = await fetch(authenticatedUrl(), {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    expect(
      res.ok,
      `expected a refusal, got ${res.status} — the public anon key can read gallery objects`,
    ).toBe(false);
  });

  it("a real signed-in USER cannot download the object, and cannot mint a signature for it", async () => {
    // Not even the authenticated role: the bucket has no owner-select case at
    // all, because the editor renders through the server's signing path rather
    // than being handed direct bucket access.
    const download = await authed.client.storage
      .from(BUCKET)
      .download(REAL_PATH);
    expect(download.data).toBeNull();
    expect(
      download.error,
      "expected a rejection, not a successful read",
    ).not.toBeNull();

    const signed = await authed.client.storage
      .from(BUCKET)
      .createSignedUrl(REAL_PATH, 60);
    expect(
      signed.data,
      "a user who can mint their own signature has bypassed the server's entitlement gate",
    ).toBeNull();
    expect(signed.error).not.toBeNull();
  });

  it("neither anon nor an authenticated user can write into the bucket", async () => {
    const [anonWrite, authedWrite] = await Promise.all([
      anon.storage
        .from(BUCKET)
        .upload(`anon-${Date.now()}.webp`, new Blob(["no"])),
      authed.client.storage
        .from(BUCKET)
        .upload(`authed-${Date.now()}.webp`, new Blob(["no"])),
    ]);
    expect(anonWrite.data).toBeNull();
    expect((anonWrite.error as { statusCode?: string })?.statusCode).toBe(
      "403",
    );
    expect(authedWrite.data).toBeNull();
    expect((authedWrite.error as { statusCode?: string })?.statusCode).toBe(
      "403",
    );
  });

  it("neither anon nor an authenticated user can list the object the service role can see", async () => {
    const [anonList, authedList] = await Promise.all([
      anon.storage.from(BUCKET).list("probe-artist/hub"),
      authed.client.storage.from(BUCKET).list("probe-artist/hub"),
    ]);
    // Decisive only because beforeAll proved the object is really there.
    expect(anonList.data?.length ?? 0).toBe(0);
    expect(authedList.data?.length ?? 0).toBe(0);
  });
});

describe("DISTINCTION: the legitimate signed path still works (0151)", () => {
  // Without this block, every assertion above would also pass against a bucket
  // that refuses the SERVER too, i.e. against a completely broken feature.
  // "Refuses everyone" is not the control; "refuses everyone without a
  // signature" is.
  it("a server-minted signed URL fetches the object, with no credentials on the request", async () => {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(REAL_PATH, 60);
    expect(error, error?.message).toBeNull();
    expect(data?.signedUrl).toBeTruthy();

    const res = await fetch(data!.signedUrl);
    expect(
      res.ok,
      `the signed URL must work, or the gallery renders nothing (got ${res.status})`,
    ).toBe(true);
    expect(await res.text()).toBe(BYTES);
  });

  it("the signature is bound to its object: it does not unlock a SIBLING object", async () => {
    // A signature that worked for any path in the bucket would collapse back
    // into "one leaked URL exposes everything", which is the R4 risk wearing a
    // token.
    const otherPath = `probe-artist/hub/other-${Date.now()}.webp`;
    const up = await admin.storage
      .from(BUCKET)
      .upload(otherPath, new Blob(["a different image"]), {
        contentType: "image/webp",
      });
    expect(up.error, up.error?.message).toBeNull();
    try {
      const { data } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(REAL_PATH, 60);
      // Swap the object path, keep the token.
      const swapped = data!.signedUrl.replace(REAL_PATH, otherPath);
      const res = await fetch(swapped);
      expect(res.ok, "one object's token must not fetch another object").toBe(
        false,
      );
    } finally {
      await admin.storage.from(BUCKET).remove([otherPath]);
    }
  });

  it("an EXPIRED signature is refused, so the URL is genuinely expiring and not merely opaque", async () => {
    // The DPIA says "signed EXPIRING URLs". Expiry is half the requirement and
    // it is the half a test can silently skip by only ever using fresh tokens.
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(REAL_PATH, 1);
    expect(error, error?.message).toBeNull();
    // Fresh: works. Proves the URL itself is well-formed, so the refusal after
    // the wait is attributable to expiry and nothing else.
    expect((await fetch(data!.signedUrl)).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 2500));
    const after = await fetch(data!.signedUrl);
    expect(after.ok, "an expired token must stop working").toBe(false);
  }, 30_000);
});
