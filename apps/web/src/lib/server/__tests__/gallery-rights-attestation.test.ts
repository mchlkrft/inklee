import { describe, it, expect, vi, beforeEach } from "vitest";

// The shared gallery rights attestation (LO-5 DPIA §7 R3, activation key
// `dpia_r3_direct_upload_attestation_built`).
//
// The three call sites have their own suites; this one pins the module they
// all depend on, because a change HERE silently changes what every surface
// asserts and records. Two things it protects in particular: the strict
// "true" comparison, and the fail-closed return on a failed evidence write.

const { consentInsert, captureException } = vi.hoisted(() => ({
  consentInsert: vi.fn(),
  captureException: vi.fn(),
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

import { recordGalleryRightsAttestation } from "../gallery-rights-attestation";
import {
  GALLERY_RIGHTS_ATTESTATION_CONSENT_TYPE,
  GALLERY_RIGHTS_ATTESTATION_LOG_FAILED_ERROR,
  GALLERY_RIGHTS_ATTESTATION_TEXT,
  GALLERY_RIGHTS_ATTESTATION_VERSION,
  isGalleryRightsAttested,
} from "@inklee/shared/gallery-rights-attestation";

beforeEach(() => {
  vi.clearAllMocks();
  consentInsert.mockResolvedValue({ error: null });
});

describe("isGalleryRightsAttested", () => {
  it('accepts ONLY the literal string "true"', () => {
    expect(isGalleryRightsAttested("true")).toBe(true);
  });

  // Each of these is a real submission shape, not a synthetic edge case: an
  // unchecked box sends nothing, a raw HTML checkbox sends "on", and the
  // clients here send "false" explicitly. All must refuse, and all would be
  // ACCEPTED by a truthiness check, which is the mutation this guards.
  it.each([
    ["undefined (field absent)", undefined],
    ["null", null],
    ['the raw checkbox value "on"', "on"],
    ['the string "false"', "false"],
    ['the string "TRUE" (wrong case)', "TRUE"],
    ["the boolean true (not a form value)", true],
    ["the number 1", 1],
    ["an empty string", ""],
  ])("refuses %s", (_label, value) => {
    expect(isGalleryRightsAttested(value)).toBe(false);
  });
});

describe("the attestation text", () => {
  // §7 R2 records this attestation as one of three things carrying the
  // ACCEPTED residual that Inklee cannot verify artist-client consent. A
  // rights-only wording (which is what v1 was) does not carry it. If someone
  // reverts the text to a copyright-only claim, this reds.
  it("asserts the depicted person's agreement, not only the artist's rights", () => {
    expect(GALLERY_RIGHTS_ATTESTATION_TEXT).toMatch(/right to publish/i);
    expect(GALLERY_RIGHTS_ATTESTATION_TEXT).toMatch(/identifiable/i);
    expect(GALLERY_RIGHTS_ATTESTATION_TEXT).toMatch(/agreed/i);
  });

  // Copy rules (AGENTS.md): no em-dashes in user-visible strings.
  it("carries no em-dash and ends in terminal punctuation", () => {
    expect(GALLERY_RIGHTS_ATTESTATION_TEXT).not.toContain("—");
    expect(GALLERY_RIGHTS_ATTESTATION_TEXT.endsWith(".")).toBe(true);
  });

  // A wording change MUST come with a version change, or old evidence is
  // silently reinterpreted as meaning the new thing. Pinning the version
  // string makes that a deliberate, reviewable edit rather than a side effect.
  it("is recorded under an explicitly versioned identifier", () => {
    expect(GALLERY_RIGHTS_ATTESTATION_VERSION).toBe(
      "gallery-rights-attestation-v2",
    );
  });
});

describe("recordGalleryRightsAttestation", () => {
  it("writes an append-only row with the type, version and surface", async () => {
    const r = await recordGalleryRightsAttestation({
      artistId: "artist1",
      surface: "web_upload",
      detail: { file_name: "a.jpg", byte_size: 16 },
    });
    expect(r).toEqual({ ok: true });
    expect(consentInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        artist_id: "artist1",
        consent_type: GALLERY_RIGHTS_ATTESTATION_CONSENT_TYPE,
        consent_version: GALLERY_RIGHTS_ATTESTATION_VERSION,
        consented_at: expect.any(String),
        context: { surface: "web_upload", file_name: "a.jpg", byte_size: 16 },
      }),
    );
  });

  it("keeps the surface even when a caller passes no detail", async () => {
    await recordGalleryRightsAttestation({
      artistId: "artist1",
      surface: "native_upload",
    });
    expect(consentInsert).toHaveBeenCalledWith(
      expect.objectContaining({ context: { surface: "native_upload" } }),
    );
  });

  // FAIL LOUD, NEVER FAIL OPEN. A failed evidence write must not resolve to a
  // permissive default; the caller has to be able to refuse the upload.
  it("returns a refusal (not ok) when the insert errors", async () => {
    consentInsert.mockResolvedValue({ error: { message: "db down" } });
    const r = await recordGalleryRightsAttestation({
      artistId: "artist1",
      surface: "web_url_import",
      detail: { source_url: "https://example.com/a.jpg" },
    });
    expect(r).toEqual({
      ok: false,
      error: GALLERY_RIGHTS_ATTESTATION_LOG_FAILED_ERROR,
    });
    expect(captureException).toHaveBeenCalled();
  });

  // DISTINCTION: the recorder is not simply always-refusing. Covered by the
  // ok-path tests above, and pinned here against the failure case directly so
  // the pair cannot both be satisfied by a constant return.
  it("returns ok on a clean write and not-ok on a failed one, from the same inputs", async () => {
    const args = { artistId: "artist1", surface: "web_upload" as const };
    consentInsert.mockResolvedValue({ error: null });
    expect((await recordGalleryRightsAttestation(args)).ok).toBe(true);
    consentInsert.mockResolvedValue({ error: { message: "db down" } });
    expect((await recordGalleryRightsAttestation(args)).ok).toBe(false);
  });
});
