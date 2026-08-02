import { describe, it, expect, vi, beforeEach } from "vitest";

// uploadGalleryImageAction (Track B slice B1): entitlement FIRST (H4 — an
// unentitled upload would only orphan a storage object the save gate then
// discards), the hosted-image ceiling counted server-side from SAVED settings
// (H6), and the unique-path/no-cache-bust upload shape (H7).

const {
  getUser,
  getAccountOverrides,
  richContentBlocksAllowed,
  processUpload,
  fetchImageForImport,
  checkGalleryImportRateLimit,
  consentInsert,
  captureException,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAccountOverrides: vi.fn(),
  richContentBlocksAllowed: vi.fn(),
  processUpload: vi.fn(),
  fetchImageForImport: vi.fn(),
  checkGalleryImportRateLimit: vi.fn(),
  consentInsert: vi.fn(),
  captureException: vi.fn(),
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
  richContentBlocksAllowed: (...a: unknown[]) => richContentBlocksAllowed(...a),
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
vi.mock("@/lib/server/gallery-url-import", () => ({
  fetchImageForImport: (...a: unknown[]) => fetchImageForImport(...a),
}));
vi.mock("@/lib/ratelimit", () => ({
  checkGalleryImportRateLimit: (...a: unknown[]) =>
    checkGalleryImportRateLimit(...a),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => {
      if (table !== "billing_consent_records") {
        throw new Error(`unexpected table: ${table}`);
      }
      return { insert: (...a: unknown[]) => consentInsert(...a) };
    },
  },
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => captureException(...a),
}));

import {
  uploadGalleryImageAction,
  importGalleryImageFromUrlAction,
} from "../actions";

function formWithImage(): FormData {
  const form = new FormData();
  form.set(
    "image",
    new File([new Uint8Array(16)], "a.jpg", { type: "image/jpeg" }),
  );
  return form;
}

// Real Inklee-hosted shape (founder ruling FD4, 2026-08-01, SUPERSEDES GB2):
// the parser now drops a non-hosted URL, so a fixture using a plain
// `cdn.example` stand-in would silently parse to ZERO stored images and
// falsely pass the H6 ceiling test regardless of the count below.
const HOSTED =
  "https://x.supabase.co/storage/v1/object/public/logos/artist1/hub";

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
        url: `${HOSTED}/${i}-${j}.webp`,
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
  richContentBlocksAllowed.mockReturnValue(true);
  profileSettings.value = { bio_page: { blocks: [], socials: [] } };
  processUpload.mockResolvedValue({
    ok: true,
    url: "https://cdn.example/logos/artist1/hub/uuid.webp",
  });
  fetchImageForImport.mockResolvedValue({
    ok: true,
    file: new File([new Uint8Array(16)], "a.jpg", { type: "image/jpeg" }),
  });
  checkGalleryImportRateLimit.mockResolvedValue({ allowed: true });
  consentInsert.mockResolvedValue({ error: null });
});

// `attested` defaults to true so every EXISTING test (rate limit, ceiling,
// entitlement, fetch-guard ordering) keeps exercising the behaviour it names
// without also having to opt into the C1.6 gate; the gate itself is covered
// by its own dedicated tests below with `attested: false` / omitted.
function formWithUrl(url: string, attested = true): FormData {
  const form = new FormData();
  form.set("url", url);
  form.set("rightsAttestation", attested ? "true" : "false");
  return form;
}

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
    richContentBlocksAllowed.mockReturnValue(false);
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
    expect(richContentBlocksAllowed).not.toHaveBeenCalled();
    expect(processUpload).not.toHaveBeenCalled();
  });
});

// importGalleryImageFromUrlAction (founder ruling FD4, 2026-08-01, SUPERSEDES
// GB2): the SAME entitlement-first / ceiling / unique-path posture as the
// direct upload, sourcing bytes from `fetchImageForImport` (mocked here —
// its own guard logic is covered by gallery-url-import.test.ts) instead of a
// device file.
describe("importGalleryImageFromUrlAction", () => {
  it("imports and uploads through the SAME pipeline as a direct upload", async () => {
    const r = await importGalleryImageFromUrlAction(
      formWithUrl("https://example.com/a.jpg"),
    );
    expect(r).toEqual({
      ok: true,
      url: "https://cdn.example/logos/artist1/hub/uuid.webp",
    });
    expect(fetchImageForImport).toHaveBeenCalledWith(
      "https://example.com/a.jpg",
    );
    expect(processUpload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        path: expect.stringMatching(/^artist1\/hub\/[0-9a-f-]{36}\.webp$/),
        fit: "inside",
        upsert: false,
        cacheBust: false,
      }),
    );
    // C1.6: the attestation is logged append-only (insert, never update) BEFORE
    // the network fetch, tied to this artist and this exact source URL.
    expect(consentInsert).toHaveBeenCalledTimes(1);
    expect(consentInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        artist_id: "artist1",
        consent_type: "gallery_image_rights_attestation",
        consent_version: expect.any(String),
        context: { source_url: "https://example.com/a.jpg" },
      }),
    );
    const consentCallOrder = consentInsert.mock.invocationCallOrder[0];
    const fetchCallOrder = fetchImageForImport.mock.invocationCallOrder[0];
    expect(consentCallOrder).toBeLessThan(fetchCallOrder);
  });

  it("refuses a rate-limited artist BEFORE the ceiling read and BEFORE fetching", async () => {
    checkGalleryImportRateLimit.mockResolvedValue({ allowed: false });
    const r = await importGalleryImageFromUrlAction(
      formWithUrl("https://example.com/a.jpg"),
    );
    expect(r).toEqual({
      ok: false,
      error: "Too many attempts. Please wait a moment and try again.",
    });
    expect(fetchImageForImport).not.toHaveBeenCalled();
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("refuses an unentitled artist BEFORE fetching anything (H4, extended to imports)", async () => {
    richContentBlocksAllowed.mockReturnValue(false);
    const r = await importGalleryImageFromUrlAction(
      formWithUrl("https://example.com/a.jpg"),
    );
    expect(r).toEqual({
      ok: false,
      error: "Image galleries are a Plus feature.",
    });
    expect(fetchImageForImport).not.toHaveBeenCalled();
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("rejects a missing/blank url before anything else", async () => {
    const r = await importGalleryImageFromUrlAction(formWithUrl("   "));
    expect(r).toEqual({ ok: false, error: "Enter an image URL." });
    expect(fetchImageForImport).not.toHaveBeenCalled();
  });

  it("enforces the SAME hosted-image ceiling as direct upload (H6), before fetching", async () => {
    profileSettings.value = settingsWithImages(120);
    const r = await importGalleryImageFromUrlAction(
      formWithUrl("https://example.com/a.jpg"),
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("limit of 120");
    expect(fetchImageForImport).not.toHaveBeenCalled();
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("surfaces the guard's specific failure reason unchanged (e.g. SSRF refusal)", async () => {
    fetchImageForImport.mockResolvedValue({
      ok: false,
      error: "That URL can't be reached.",
    });
    const r = await importGalleryImageFromUrlAction(
      formWithUrl("https://169.254.169.254/latest/meta-data/"),
    );
    expect(r).toEqual({ ok: false, error: "That URL can't be reached." });
    expect(processUpload).not.toHaveBeenCalled();
  });

  it("refuses when not signed in, before anything else", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await importGalleryImageFromUrlAction(
      formWithUrl("https://example.com/a.jpg"),
    );
    expect(r).toEqual({ ok: false, error: "Not signed in." });
    expect(richContentBlocksAllowed).not.toHaveBeenCalled();
    expect(fetchImageForImport).not.toHaveBeenCalled();
  });
});

// C1.6 rights attestation (counsel,
// docs/legal/counsel-accountant-handoff-2026-08.md Part 4): "no attestation =
// no import," enforced SERVER-SIDE — a client that omits or falsifies the
// field is refused regardless of what the UI rendered. Every case here would
// pass with the field checked merely for TRUTHINESS (e.g. `Boolean(...)`)
// rather than the literal string "true", so the "false" case in particular
// mutation-proves the exact comparison, not just "some check exists".
describe("importGalleryImageFromUrlAction — C1.6 rights attestation", () => {
  it("refuses an import with no rightsAttestation field at all", async () => {
    const form = new FormData();
    form.set("url", "https://example.com/a.jpg");
    const r = await importGalleryImageFromUrlAction(form);
    expect(r).toEqual({
      ok: false,
      error:
        "Confirm you have the right to use this image before importing it.",
    });
    expect(consentInsert).not.toHaveBeenCalled();
    expect(checkGalleryImportRateLimit).not.toHaveBeenCalled();
    expect(fetchImageForImport).not.toHaveBeenCalled();
    expect(processUpload).not.toHaveBeenCalled();
  });

  it('refuses an import with rightsAttestation explicitly "false"', async () => {
    const r = await importGalleryImageFromUrlAction(
      formWithUrl("https://example.com/a.jpg", false),
    );
    expect(r.ok).toBe(false);
    expect(consentInsert).not.toHaveBeenCalled();
    expect(fetchImageForImport).not.toHaveBeenCalled();
  });

  it('refuses a truthy-but-not-"true" value (e.g. the raw checkbox "on")', async () => {
    const form = new FormData();
    form.set("url", "https://example.com/a.jpg");
    form.set("rightsAttestation", "on");
    const r = await importGalleryImageFromUrlAction(form);
    expect(r.ok).toBe(false);
    expect(fetchImageForImport).not.toHaveBeenCalled();
  });

  it("checks attestation BEFORE the rate limit and the entitlement's egress-spending path", async () => {
    checkGalleryImportRateLimit.mockResolvedValue({ allowed: false });
    const form = new FormData();
    form.set("url", "https://example.com/a.jpg");
    // No rightsAttestation set: if attestation were checked AFTER the rate
    // limit, this would return the rate-limit error instead.
    const r = await importGalleryImageFromUrlAction(form);
    expect(r).toEqual({
      ok: false,
      error:
        "Confirm you have the right to use this image before importing it.",
    });
    expect(checkGalleryImportRateLimit).not.toHaveBeenCalled();
  });

  it("refuses the import (fails closed) when the attestation cannot be durably logged", async () => {
    consentInsert.mockResolvedValue({ error: { message: "db down" } });
    const r = await importGalleryImageFromUrlAction(
      formWithUrl("https://example.com/a.jpg"),
    );
    expect(r).toEqual({
      ok: false,
      error: "Could not record your confirmation. Please try again.",
    });
    expect(captureException).toHaveBeenCalled();
    expect(fetchImageForImport).not.toHaveBeenCalled();
    expect(processUpload).not.toHaveBeenCalled();
  });
});
