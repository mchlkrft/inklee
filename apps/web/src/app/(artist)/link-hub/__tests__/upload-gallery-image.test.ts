import { describe, it, expect, vi, beforeEach } from "vitest";

// uploadGalleryImageAction (Track B slice B1): entitlement FIRST (H4 — an
// unentitled upload would only orphan a storage object the save gate then
// discards), the hosted-image ceiling counted server-side from SAVED settings
// (H6), and the unique-path/no-cache-bust upload shape (H7).

const { getUser, getAccountOverrides, appearanceCustomAllowed, processUpload } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    getAccountOverrides: vi.fn(),
    appearanceCustomAllowed: vi.fn(),
    processUpload: vi.fn(),
  }));

const { profileSettings } = vi.hoisted(() => ({
  profileSettings: { value: {} as Record<string, unknown> },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: { settings: profileSettings.value } }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/entitlement-gates", () => ({
  appearanceCustomAllowed: (...a: unknown[]) => appearanceCustomAllowed(...a),
}));
// readImageFromForm stays REAL (pure); only the sharp/storage half is mocked.
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

import { uploadGalleryImageAction } from "../actions";

function formWithImage(): FormData {
  const form = new FormData();
  form.set(
    "image",
    new File([new Uint8Array(16)], "a.jpg", { type: "image/jpeg" }),
  );
  return form;
}

/** N stored gallery images across blocks, as saved settings would hold them. */
function settingsWithImages(count: number): Record<string, unknown> {
  const blocks = [] as Record<string, unknown>[];
  let remaining = count;
  let i = 0;
  while (remaining > 0) {
    const n = Math.min(12, remaining);
    blocks.push({
      id: `g${i++}`,
      type: "image_gallery",
      layout: "grid",
      images: Array.from({ length: n }, (_, j) => ({
        url: `https://cdn.example/${i}-${j}.webp`,
      })),
    });
    remaining -= n;
  }
  return { bio_page: { blocks, socials: [] } };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "artist1" } } });
  getAccountOverrides.mockResolvedValue({});
  appearanceCustomAllowed.mockReturnValue(true);
  profileSettings.value = { bio_page: { blocks: [], socials: [] } };
  processUpload.mockResolvedValue({
    ok: true,
    url: "https://cdn.example/logos/artist1/hub/uuid.webp",
  });
});

describe("uploadGalleryImageAction", () => {
  it("uploads with the unique hub path, inside-fit, no upsert, no cache-bust", async () => {
    const r = await uploadGalleryImageAction(formWithImage());
    expect(r).toEqual({
      ok: true,
      url: "https://cdn.example/logos/artist1/hub/uuid.webp",
    });
    expect(processUpload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        path: expect.stringMatching(/^artist1\/hub\/[0-9a-f-]{36}\.webp$/),
        width: 1600,
        height: 1600,
        fit: "inside",
        upsert: false,
        cacheBust: false,
      }),
    );
  });

  it("refuses an unentitled artist BEFORE touching storage (H4)", async () => {
    appearanceCustomAllowed.mockReturnValue(false);
    const r = await uploadGalleryImageAction(formWithImage());
    expect(r).toEqual({
      ok: false,
      error: "Image galleries are a Plus feature.",
    });
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("fails safe to unentitled when the plan read throws", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    const r = await uploadGalleryImageAction(formWithImage());
    expect(r.ok).toBe(false);
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("enforces the hosted-image ceiling from SAVED settings (H6)", async () => {
    profileSettings.value = settingsWithImages(120); // 10 blocks x 12 = full
    const r = await uploadGalleryImageAction(formWithImage());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("limit of 120");
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("still uploads just under the ceiling", async () => {
    profileSettings.value = settingsWithImages(119);
    const r = await uploadGalleryImageAction(formWithImage());
    expect(r.ok).toBe(true);
  });

  it("rejects a bad file via the REAL validator without uploading", async () => {
    const form = new FormData();
    form.set(
      "image",
      new File([new Uint8Array(8)], "a.gif", { type: "image/gif" }),
    );
    const r = await uploadGalleryImageAction(form);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("PNG, JPG, or WebP");
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("refuses when not signed in, before anything else", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await uploadGalleryImageAction(formWithImage());
    expect(r).toEqual({ ok: false, error: "Not signed in." });
    expect(appearanceCustomAllowed).not.toHaveBeenCalled();
    expect(processUpload).not.toHaveBeenCalled();
  });
});
