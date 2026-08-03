import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";
import { HOSTED_GALLERY_PRIVATE_MARKER } from "@inklee/shared/bio-page";
import { takedownGalleryImage } from "@/lib/server/gallery-takedown";
import {
  GALLERY_LIVE_BUCKET,
  GALLERY_ARCHIVE_BUCKET,
} from "@/lib/server/gallery-relocation";

// #79 / Q16 element 2, action half. The whole point of this test, like the R6
// intake-purge test, is that a mocked bucket proves nothing: "delete the render"
// is not "delete the object", and Postgres cascade does not reach storage. So it
// uploads a REAL object to both private buckets, runs the takedown, and asserts
// the bytes are gone. It can fail: the control asserts the objects EXIST before.

let admin: SupabaseClient;
let artist: Actor;
let reportId: string;
let path: string;
let imageUrl: string;
const KEEP_URL = "https://inklee.app/keepme.webp";
const createdReportIds: string[] = [];
const createdStmtIds: string[] = [];

async function objectExists(bucket: string, p: string): Promise<boolean> {
  const dir = p.split("/").slice(0, -1).join("/");
  const base = p.split("/").pop() as string;
  const { data } = await admin.storage.from(bucket).list(dir, { search: base });
  return (data ?? []).some((f) => f.name === base);
}

beforeAll(async () => {
  admin = adminClient();
  artist = await makeActor(admin, "gallery-takedown");
  path = `${artist.id}/hub/takedown-${Date.now()}.webp`;
  imageUrl = `https://inklee.app${HOSTED_GALLERY_PRIVATE_MARKER}${path}`;

  // Same object in BOTH buckets (an entitled artist's live object AND a
  // downgraded artist's archived copy), to prove removal targets both.
  for (const bucket of [GALLERY_LIVE_BUCKET, GALLERY_ARCHIVE_BUCKET]) {
    const { error } = await admin.storage
      .from(bucket)
      .upload(path, new Uint8Array([1, 2, 3, 4]), {
        contentType: "image/webp",
        upsert: true,
      });
    if (error) throw error;
  }

  // The artist's bio page references the reported image plus one to keep.
  const { error: pErr } = await admin
    .from("profiles")
    .update({
      settings: {
        bio_page: {
          blocks: [
            {
              type: "image_gallery",
              images: [{ url: imageUrl }, { url: KEEP_URL }],
            },
          ],
        },
      },
    })
    .eq("id", artist.id);
  if (pErr) throw pErr;

  const { data: report, error: rErr } = await admin
    .from("content_reports")
    .insert({
      category: "image_without_consent",
      url: imageUrl,
      description: "This is a photograph of me posted without my consent.",
      reporter_name: "Dana Doe",
      reporter_email: "dana@example.com",
      reference: "DSA-TAKEDOWN-" + Math.random().toString(36).slice(2, 8),
    })
    .select("id")
    .single();
  if (rErr) throw rErr;
  reportId = report!.id;
  createdReportIds.push(reportId);
}, 60_000);

afterAll(async () => {
  for (const bucket of [GALLERY_LIVE_BUCKET, GALLERY_ARCHIVE_BUCKET]) {
    await admin.storage
      .from(bucket)
      .remove([path])
      .catch(() => {});
  }
  await admin
    .from("moderation_statements")
    .delete()
    .eq("target_artist_id", artist.id);
  if (createdReportIds.length) {
    await admin.from("content_reports").delete().in("id", createdReportIds);
  }
  await destroyActor(admin, artist);
});

describe("gallery takedown removes the storage object (#79 Q16 e2)", () => {
  it("CONTROL: both objects exist before the takedown", async () => {
    expect(await objectExists(GALLERY_LIVE_BUCKET, path)).toBe(true);
    expect(await objectExists(GALLERY_ARCHIVE_BUCKET, path)).toBe(true);
  });

  it("deletes the object from BOTH buckets, strips the block, issues the artist's Art.17 statement, and resolves the report", async () => {
    const result = await takedownGalleryImage({
      reportId,
      artistId: artist.id,
      imageUrl,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.statementId) createdStmtIds.push(result.statementId);

    // (a) the bytes are gone from both private buckets
    expect(await objectExists(GALLERY_LIVE_BUCKET, path)).toBe(false);
    expect(await objectExists(GALLERY_ARCHIVE_BUCKET, path)).toBe(false);
    expect(result.removedFromBuckets).toEqual(
      expect.arrayContaining([GALLERY_LIVE_BUCKET, GALLERY_ARCHIVE_BUCKET]),
    );

    // (b) the image is gone from the artist's bio_page block; the other stays
    const { data: profile } = await admin
      .from("profiles")
      .select("settings")
      .eq("id", artist.id)
      .single();
    const blocks = ((profile!.settings as { bio_page?: { blocks?: unknown[] } })
      .bio_page?.blocks ?? []) as { images?: { url: string }[] }[];
    const urls = blocks.flatMap((b) => (b.images ?? []).map((i) => i.url));
    expect(urls).not.toContain(imageUrl);
    expect(urls).toContain(KEEP_URL);
    expect(result.strippedFromBlocks).toBe(true);

    // (c) an Art.17 statement of reasons is owed to the ARTIST
    expect(result.statementId).toBeTruthy();
    const { data: stmt } = await admin
      .from("moderation_statements")
      .select("target_type, delivered_to, action")
      .eq("id", result.statementId as string)
      .single();
    expect(stmt!.target_type).toBe("gallery_image");
    expect(stmt!.delivered_to).toBe(artist.id);
    expect(stmt!.action).toBe("removed");

    // (d) the queue row is resolved and linked
    const { data: resolved } = await admin
      .from("content_reports")
      .select("status, target_artist_id, statement_of_reasons_id")
      .eq("id", reportId)
      .single();
    expect(resolved!.status).toBe("actioned");
    expect(resolved!.target_artist_id).toBe(artist.id);
    expect(resolved!.statement_of_reasons_id).toBe(result.statementId);
  });
});
