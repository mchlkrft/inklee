import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";

// migration 0155 PART B: moderation_statements can now target a removed gallery
// image (target_type='gallery_image'), so the hosting artist can be given the
// Art. 17 statement of reasons. The extension is a CONVERGENT drop-then-create
// of the anonymous inline target_type check; this file proves it added the new
// value WITHOUT narrowing the existing vocabulary.

let admin: SupabaseClient;
let artist: Actor;
const createdStmtIds: string[] = [];

beforeAll(async () => {
  admin = adminClient();
  artist = await makeActor(admin, "modstmt-gallery");
}, 60_000);

afterAll(async () => {
  if (createdStmtIds.length) {
    await admin.from("moderation_statements").delete().in("id", createdStmtIds);
  }
  await destroyActor(admin, artist);
});

describe("moderation_statements: gallery_image target (0155)", () => {
  it("accepts target_type=gallery_image with action=removed (the takedown statement)", async () => {
    const { data, error } = await admin
      .from("moderation_statements")
      .insert({
        target_type: "gallery_image",
        target_artist_id: artist.id,
        action: "removed",
        grounds:
          "The depicted person withdrew consent; the image was removed under Art. 17.",
        automated: false,
        delivered_to: artist.id,
      })
      .select("id, target_type")
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.target_type).toBe("gallery_image");
    if (data?.id) createdStmtIds.push(data.id);
  });

  it("still rejects an unknown target_type (23514 check violation)", async () => {
    const { error } = await admin.from("moderation_statements").insert({
      target_type: "not_a_target",
      action: "removed",
      grounds: "x",
      automated: false,
    });
    expect(error?.code).toBe("23514");
  });

  it("still accepts a pre-existing target (regression: drop-then-create did not narrow the vocab)", async () => {
    const { data, error } = await admin
      .from("moderation_statements")
      .insert({
        target_type: "artist",
        target_artist_id: artist.id,
        action: "warning_shown",
        grounds: "control row proving the old vocabulary survives",
        automated: true,
      })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    if (data?.id) createdStmtIds.push(data.id);
  });
});
