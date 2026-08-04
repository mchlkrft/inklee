import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";
import { HOSTED_GALLERY_PRIVATE_MARKER } from "@inklee/shared/bio-page";
import {
  signGalleryImageUrls,
  GALLERY_LIVE_BUCKET,
} from "@/lib/server/gallery-signed-urls";

// R6 Q3 interim disable (counsel §6.4; DSA procedure §2b/§4): a gallery image
// with an OPEN "image of me without consent" report must not be signed for
// render, and must return to the signable set once the report is dismissed.
// A mocked signer would prove nothing, so this uploads a REAL object and signs
// it; the CONTROL signs the healthy image so a broken suppression cannot pass
// by vacuity (if signing itself failed, the control would go red).

let admin: SupabaseClient;
let artist: Actor;
let path: string;
let imageUrl: string;
const createdReportIds: string[] = [];

async function insertReport(category: string, status: string): Promise<string> {
  const { data, error } = await admin
    .from("content_reports")
    .insert({
      category,
      url: imageUrl,
      description: "Interim-disable test report.",
      reporter_name: "Dana Doe",
      reporter_email: "dana@example.com",
      reference: "DSA-DISABLE-" + Math.random().toString(36).slice(2, 8),
      status,
    })
    .select("id")
    .single();
  if (error) throw error;
  createdReportIds.push(data!.id);
  return data!.id;
}

beforeAll(async () => {
  admin = adminClient();
  artist = await makeActor(admin, "gallery-interim-disable");
  path = `${artist.id}/hub/disable-${Date.now()}.webp`;
  imageUrl = `https://inklee.app${HOSTED_GALLERY_PRIVATE_MARKER}${path}`;
  const { error } = await admin.storage
    .from(GALLERY_LIVE_BUCKET)
    .upload(path, new Uint8Array([1, 2, 3, 4]), {
      contentType: "image/webp",
      upsert: true,
    });
  if (error) throw error;
}, 60_000);

afterAll(async () => {
  await admin.storage
    .from(GALLERY_LIVE_BUCKET)
    .remove([path])
    .catch(() => {});
  if (createdReportIds.length) {
    await admin.from("content_reports").delete().in("id", createdReportIds);
  }
  await destroyActor(admin, artist);
});

describe("gallery interim disable (R6 Q3): open report suppresses render signing", () => {
  it("CONTROL: with no report, the image signs and is renderable", async () => {
    const signed = await signGalleryImageUrls([imageUrl]);
    expect(signed.has(imageUrl)).toBe(true);
    expect(signed.get(imageUrl)).toContain("/object/sign/");
  });

  it("an OPEN image_without_consent report suppresses the signed URL", async () => {
    const id = await insertReport("image_without_consent", "new");
    try {
      const signed = await signGalleryImageUrls([imageUrl]);
      expect(signed.has(imageUrl)).toBe(false);
    } finally {
      await admin.from("content_reports").delete().eq("id", id);
    }
  });

  it("a 'reviewed' report still suppresses (open = new OR reviewed)", async () => {
    const id = await insertReport("image_without_consent", "reviewed");
    try {
      const signed = await signGalleryImageUrls([imageUrl]);
      expect(signed.has(imageUrl)).toBe(false);
    } finally {
      await admin.from("content_reports").delete().eq("id", id);
    }
  });

  it("a DISMISSED report does not suppress: the image returns", async () => {
    const id = await insertReport("image_without_consent", "dismissed");
    try {
      const signed = await signGalleryImageUrls([imageUrl]);
      expect(signed.has(imageUrl)).toBe(true);
    } finally {
      await admin.from("content_reports").delete().eq("id", id);
    }
  });

  it("an open report of a DIFFERENT category does not suppress", async () => {
    const id = await insertReport("copyright", "new");
    try {
      const signed = await signGalleryImageUrls([imageUrl]);
      expect(signed.has(imageUrl)).toBe(true);
    } finally {
      await admin.from("content_reports").delete().eq("id", id);
    }
  });
});
