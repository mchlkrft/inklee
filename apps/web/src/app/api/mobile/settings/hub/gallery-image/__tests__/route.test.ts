import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/mobile/settings/hub/gallery-image (FD2, 2026-08-01): the native
// counterpart of uploadGalleryImageAction (link-hub/actions.ts), both now
// backed by the SAME shared gates (@/lib/server/hub-gallery-upload) so this
// suite pins the identical ordering the web test
// (link-hub/__tests__/upload-gallery-image.test.ts) already pins: entitlement
// FIRST (H4 — an unentitled upload would only orphan a storage object the
// hub-save gate then discards), the hosted-image ceiling counted
// server-side from SAVED settings (H6), and the unique-path/no-cache-bust
// upload shape (H7).

const {
  requireMobileUser,
  getAccountOverrides,
  richContentBlocksAllowed,
  processUpload,
} = vi.hoisted(() => ({
  requireMobileUser: vi.fn(),
  getAccountOverrides: vi.fn(),
  richContentBlocksAllowed: vi.fn(),
  processUpload: vi.fn(),
}));

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
// readImageFile/readImageFromForm stay REAL (pure); only the sharp/storage
// half is mocked, exactly like the web action's test.
vi.mock("@/lib/mobile-image", async () => {
  const real =
    await vi.importActual<typeof import("@/lib/mobile-image")>(
      "@/lib/mobile-image",
    );
  return {
    ...real,
    processAndUpload: (...a: unknown[]) => processUpload(...a),
  };
});

import { POST } from "../route";
import { sanitizeHostedGalleryImageUrl } from "@inklee/shared/bio-page";

const USER_ID = "artist1";
// A realistic Inklee-hosted shape (not a `cdn.example` stand-in): FD4 made the
// parser reject anything else, so a test proving the route's result is
// SAVE-ABLE needs a URL that actually passes sanitizeHostedGalleryImageUrl.
const HOSTED_BASE = "https://x.supabase.co/storage/v1/object/gallery";

function fakeSupabase(
  bioPage: Record<string, unknown> = { blocks: [], socials: [] },
) {
  return {
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: { settings: { bio_page: bioPage } } }),
          }),
        }),
      };
    },
  };
}

/** N stored gallery images across blocks, as saved settings would hold them. */
function bioPageWithImages(count: number): Record<string, unknown> {
  const blocks: Record<string, unknown>[] = [];
  let remaining = count;
  let i = 0;
  while (remaining > 0) {
    const n = Math.min(12, remaining);
    blocks.push({
      id: `g${i++}`,
      type: "image_gallery",
      layout: "grid",
      images: Array.from({ length: n }, (_, j) => ({
        url: `${HOSTED_BASE}/${i}-${j}.webp`,
      })),
    });
    remaining -= n;
  }
  return { blocks, socials: [] };
}

function requestWithImage(): Request {
  const form = new FormData();
  form.set(
    "image",
    new File([new Uint8Array(16)], "a.jpg", { type: "image/jpeg" }),
  );
  return new Request("http://test/api/mobile/settings/hub/gallery-image", {
    method: "POST",
    body: form,
  });
}

function requestWithBadFile(): Request {
  const form = new FormData();
  form.set(
    "image",
    new File([new Uint8Array(8)], "a.gif", { type: "image/gif" }),
  );
  return new Request("http://test/api/mobile/settings/hub/gallery-image", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireMobileUser.mockResolvedValue({
    ok: true,
    userId: USER_ID,
    supabase: fakeSupabase(),
  });
  getAccountOverrides.mockResolvedValue({});
  richContentBlocksAllowed.mockReturnValue(true);
  processUpload.mockResolvedValue({
    ok: true,
    url: `${HOSTED_BASE}/${USER_ID}/hub/uuid.webp`,
  });
});

describe("POST /api/mobile/settings/hub/gallery-image", () => {
  it("refuses when not signed in, before anything else", async () => {
    requireMobileUser.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Invalid or expired session.",
    });
    const res = await POST(requestWithImage());
    expect(res.status).toBe(401);
    expect(richContentBlocksAllowed).not.toHaveBeenCalled();
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("refuses an unentitled artist BEFORE touching storage (H4)", async () => {
    richContentBlocksAllowed.mockReturnValue(false);
    const res = await POST(requestWithImage());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("not_entitled");
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("fails safe to unentitled when the plan read throws", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    const res = await POST(requestWithImage());
    expect(res.status).toBe(403);
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("rejects a non-image file via the REAL validator without uploading", async () => {
    const res = await POST(requestWithBadFile());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain("PNG, JPG, or WebP");
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("enforces the hosted-image ceiling from SAVED settings (H6)", async () => {
    requireMobileUser.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      supabase: fakeSupabase(bioPageWithImages(120)), // 10 blocks x 12 = full
    });
    const res = await POST(requestWithImage());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("cap_reached");
    expect(json.error.message).toContain("limit of 120");
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("still uploads just under the ceiling", async () => {
    requireMobileUser.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      supabase: fakeSupabase(bioPageWithImages(119)),
    });
    const res = await POST(requestWithImage());
    expect(res.status).toBe(200);
  });

  it("uploads with the unique hub path, inside-fit, no upsert, no cache-bust", async () => {
    const res = await POST(requestWithImage());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.url).toBe(`${HOSTED_BASE}/${USER_ID}/hub/uuid.webp`);
    expect(processUpload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        path: expect.stringMatching(
          new RegExp(`^${USER_ID}/hub/[0-9a-f-]{36}\\.webp$`),
        ),
        width: 1600,
        height: 1600,
        fit: "inside",
        upsert: false,
        cacheBust: false,
      }),
    );
  });

  it("returns a URL the shared parser accepts as hosted (round-trips into a saveable block)", async () => {
    const res = await POST(requestWithImage());
    const json = await res.json();
    expect(sanitizeHostedGalleryImageUrl(json.data.url)).toBe(json.data.url);
  });

  it("surfaces a storage failure with the upstream status, without a raw 500 swallow", async () => {
    processUpload.mockResolvedValue({
      ok: false,
      error: "Upload failed. Try again.",
      status: 500,
    });
    const res = await POST(requestWithImage());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.message).toBe("Upload failed. Try again.");
  });
});
