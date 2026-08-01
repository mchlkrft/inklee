import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/mobile/settings/hub (FD2, 2026-08-01): the native editor now
// writes full image_gallery edits (reorder, caption, delete) through this
// endpoint, so this suite pins the three properties FD2 depends on that the
// route never had a dedicated test for:
//  1. a parser-level round-trip for reordering and caption edits (the native
//     editor sends the full `images` array back on every save; a corrupted
//     round-trip would silently reorder or drop an artist's captions);
//  2. the FD1 save-path entitlement gate (gateMediaBlocksForSave) still holds
//     through the mobile path, not just the web action;
//  3. `removeDroppedHubImages` orphan cleanup still fires when a native save
//     drops an image, wired with the correct prior/saved block arguments.

const {
  requireMobileUser,
  getAccountOverrides,
  richContentBlocksAllowed,
  removeDroppedHubImages,
} = vi.hoisted(() => ({
  requireMobileUser: vi.fn(),
  getAccountOverrides: vi.fn(),
  richContentBlocksAllowed: vi.fn(),
  removeDroppedHubImages: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/mobile-auth", () => ({
  requireMobileUser: (...a: unknown[]) => requireMobileUser(...a),
  mobileOk: (data: unknown) => Response.json({ data }),
  mobileError: (status: number, message: string, code?: string) =>
    Response.json({ error: { code: code ?? "error", message } }, { status }),
}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/entitlement-gates", () => ({
  richContentBlocksAllowed: (...a: unknown[]) => richContentBlocksAllowed(...a),
}));
vi.mock("@/lib/server/hub-images", () => ({
  removeDroppedHubImages: (...a: unknown[]) => removeDroppedHubImages(...a),
}));

import { POST } from "../route";

const USER_ID = "artist1";
const BASE = "https://x.supabase.co/storage/v1/object/public/logos";
const imgA = `${BASE}/${USER_ID}/hub/a.webp`;
const imgB = `${BASE}/${USER_ID}/hub/b.webp`;
const imgC = `${BASE}/${USER_ID}/hub/c.webp`;

/** A stateful fake matching the route's read-then-update shape on `profiles`. */
function fakeSupabase(initial: {
  slug: string;
  settings: Record<string, unknown>;
}) {
  let current = { ...initial };
  const updateCalls: Record<string, unknown>[] = [];
  return {
    updateCalls,
    from(table: string) {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { slug: current.slug, settings: current.settings },
              }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updateCalls.push(patch);
          current = { ...current, ...(patch as typeof current) };
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  };
}

function request(body: unknown): Request {
  return new Request("http://test/api/mobile/settings/hub", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAccountOverrides.mockResolvedValue({});
  richContentBlocksAllowed.mockReturnValue(true);
  removeDroppedHubImages.mockResolvedValue(0);
});

describe("POST /api/mobile/settings/hub — gallery editing (FD2)", () => {
  it("round-trips a reordered gallery's images in the saved order", async () => {
    const bio = {
      blocks: [
        {
          id: "g1",
          type: "image_gallery",
          layout: "grid",
          images: [{ url: imgA }, { url: imgB }, { url: imgC }],
        },
      ],
      socials: [],
    };
    const supabase = fakeSupabase({
      slug: "artist",
      settings: { bio_page: bio },
    });
    requireMobileUser.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      supabase,
    });

    // Native editor sends the full block list back, images reordered C, A, B.
    const res = await POST(
      request({
        blocks: [
          {
            id: "g1",
            type: "image_gallery",
            layout: "grid",
            images: [{ url: imgC }, { url: imgA }, { url: imgB }],
          },
        ],
        socials: [],
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(
      json.data.blocks[0].images.map((i: { url: string }) => i.url),
    ).toEqual([imgC, imgA, imgB]);
    // Persisted, not just echoed.
    const written = supabase.updateCalls[0].settings as {
      bio_page: typeof bio;
    };
    expect(written.bio_page.blocks[0].images.map((i) => i.url)).toEqual([
      imgC,
      imgA,
      imgB,
    ]);
  });

  it("round-trips an edited caption without disturbing the image url", async () => {
    const bio = {
      blocks: [
        {
          id: "g1",
          type: "image_gallery",
          layout: "grid",
          images: [{ url: imgA, caption: "Old caption" }],
        },
      ],
      socials: [],
    };
    const supabase = fakeSupabase({
      slug: "artist",
      settings: { bio_page: bio },
    });
    requireMobileUser.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      supabase,
    });

    const res = await POST(
      request({
        blocks: [
          {
            id: "g1",
            type: "image_gallery",
            layout: "grid",
            images: [{ url: imgA, caption: "New caption" }],
          },
        ],
        socials: [],
      }),
    );
    const json = await res.json();
    expect(json.data.blocks[0].images[0]).toEqual({
      url: imgA,
      caption: "New caption",
    });
  });

  it("holds the FD1 downgrade posture through the native path: keeps an unchanged gallery, drops a new one", async () => {
    const existing = {
      id: "g1",
      type: "image_gallery",
      layout: "grid",
      images: [{ url: imgA }],
    };
    const bio = { blocks: [existing], socials: [] };
    const supabase = fakeSupabase({
      slug: "artist",
      settings: { bio_page: bio },
    });
    requireMobileUser.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      supabase,
    });
    richContentBlocksAllowed.mockReturnValue(false); // downgraded artist

    const newGallery = {
      id: "g2",
      type: "image_gallery",
      layout: "grid",
      images: [{ url: imgB }],
    };
    const res = await POST(
      request({ blocks: [existing, newGallery], socials: [] }),
    );
    const json = await res.json();
    expect(json.data.blocks).toEqual([existing]);
  });

  it("invokes removeDroppedHubImages with the prior and saved blocks when a native save drops an image", async () => {
    const priorGallery = {
      id: "g1",
      type: "image_gallery",
      layout: "grid",
      images: [{ url: imgA }, { url: imgB }],
    };
    const bio = { blocks: [priorGallery], socials: [] };
    const supabase = fakeSupabase({
      slug: "artist",
      settings: { bio_page: bio },
    });
    requireMobileUser.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      supabase,
    });

    // Native delete = remove the image from local state, then Save — image B
    // is now gone from the gallery.
    const res = await POST(
      request({
        blocks: [
          {
            id: "g1",
            type: "image_gallery",
            layout: "grid",
            images: [{ url: imgA }],
          },
        ],
        socials: [],
      }),
    );
    expect(res.status).toBe(200);
    expect(removeDroppedHubImages).toHaveBeenCalledTimes(1);
    const [calledUserId, priorBlocks, savedBlocks] =
      removeDroppedHubImages.mock.calls[0];
    expect(calledUserId).toBe(USER_ID);
    expect(priorBlocks).toEqual([priorGallery]);
    expect(savedBlocks[0].images.map((i: { url: string }) => i.url)).toEqual([
      imgA,
    ]);
  });
});
