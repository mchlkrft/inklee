import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Signed expiring gallery URLs (LO-5 DPIA R4, counsel Q18, migration 0151).
 *
 * The bucket-level proof that an UNSIGNED request is refused lives in
 * `tests/db/gallery-bucket-signed-urls-only.test.ts`, executed against a real
 * stack. This file covers the application half: that the server mints
 * signatures from the private bucket with a bounded TTL, that a read failure
 * fails LOUD instead of resolving to something permissive, and that no render
 * surface ever falls back to an unsigned URL.
 */

const { createSignedUrls, from, reportsFrom, reportsResult } = vi.hoisted(
  () => ({
    createSignedUrls: vi.fn(),
    from: vi.fn(),
    reportsFrom: vi.fn(),
    reportsResult: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    // R6 Q3 interim suppression (added in b19cf2bb): signGalleryImageUrls now
    // reads content_reports BEFORE signing, to drop any candidate URL under an
    // open image_without_consent report. This models the exact call shape it
    // uses — `.from("content_reports").select("url").eq("category", ...)
    // .in("status", ...).in("url", candidateUrls)` — and resolves to whatever
    // `reportsResult` is set to. The beforeEach default is "no open reports",
    // so every pre-existing signing assertion in this file is unaffected.
    from: (table: string) => {
      reportsFrom(table);
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              in: () => Promise.resolve(reportsResult()),
            }),
          }),
        }),
      };
    },
    storage: {
      from: (bucket: string) => {
        from(bucket);
        return {
          createSignedUrls: (...a: unknown[]) => createSignedUrls(...a),
        };
      },
    },
  },
}));

import {
  GALLERY_LIVE_BUCKET,
  GALLERY_SIGNED_URL_TTL_SECONDS,
  galleryObjectUrl,
  galleryObjectPathFromUrl,
  renderableGalleryImages,
  signGalleryImageUrls,
} from "@/lib/server/gallery-signed-urls";

const BASE = "https://x.supabase.co";
const url = (p: string) => `${BASE}/storage/v1/object/gallery/${p}`;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
  createSignedUrls.mockResolvedValue({ data: [], error: null });
  // Default: no gallery URL is under an open report, so suppression is a no-op
  // and the signing behaviour every other test asserts is unchanged.
  reportsResult.mockReturnValue({ data: [], error: null });
});

describe("the bucket and TTL are the ones the DPIA disposition assumes", () => {
  it("signs out of the PRIVATE live bucket, never the public logos bucket", () => {
    // Named explicitly: pointing this at `logos` would leave every assertion
    // in the DB test true while the feature served public objects, because
    // that test probes the bucket, not the caller.
    expect(GALLERY_LIVE_BUCKET).toBe("gallery");
  });

  it("bounds the TTL to 15 minutes", () => {
    // The number is a judgement (see the constant's own comment), but an
    // UNBOUNDED or day-long TTL would make "expiring" meaningless, so the
    // range is asserted rather than left to review.
    expect(GALLERY_SIGNED_URL_TTL_SECONDS).toBe(900);
    expect(GALLERY_SIGNED_URL_TTL_SECONDS).toBeGreaterThan(0);
    expect(GALLERY_SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(3600);
  });

  it("passes that TTL to storage, and asks the private bucket for it", async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: "u1/hub/a.webp", signedUrl: "https://signed/a" }],
      error: null,
    });
    await signGalleryImageUrls([url("u1/hub/a.webp")]);
    expect(from).toHaveBeenCalledWith("gallery");
    expect(createSignedUrls).toHaveBeenCalledWith(
      ["u1/hub/a.webp"],
      GALLERY_SIGNED_URL_TTL_SECONDS,
    );
  });
});

describe("the canonical stored URL is inert", () => {
  it("builds the authenticated-object form, not the public form", () => {
    const built = galleryObjectUrl("u1/hub/a.webp");
    expect(built).toBe(`${BASE}/storage/v1/object/gallery/u1/hub/a.webp`);
    expect(built).not.toContain("/object/public/");
  });

  it("fails LOUD when the storage base URL is missing rather than emitting a half-formed URL", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    // A relative or `undefined/...` URL would be stored in settings JSON and
    // then rendered. Throwing is the only safe outcome.
    expect(() => galleryObjectUrl("u1/hub/a.webp")).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("extracts a path from the canonical form but not from public or signed forms", () => {
    expect(galleryObjectPathFromUrl(url("u1/hub/a.webp"))).toBe(
      "u1/hub/a.webp",
    );
    expect(
      galleryObjectPathFromUrl(
        `${BASE}/storage/v1/object/public/gallery/u1/hub/a.webp`,
      ),
    ).toBeNull();
    expect(
      galleryObjectPathFromUrl(
        `${BASE}/storage/v1/object/sign/gallery/u1/hub/a.webp?token=abc`,
      ),
    ).toBeNull();
    expect(galleryObjectPathFromUrl("https://example.com/a.jpg")).toBeNull();
  });
});

describe("signGalleryImageUrls", () => {
  // DISTINCTION CONTROL. Everything else in this describe block asserts a
  // refusal or an omission; without this, a function that returned an empty
  // map unconditionally would pass all of them.
  it("returns a signed URL for each canonical gallery URL", async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: "u1/hub/a.webp", signedUrl: "https://signed/a" },
        { path: "u1/hub/b.webp", signedUrl: "https://signed/b" },
      ],
      error: null,
    });
    const out = await signGalleryImageUrls([
      url("u1/hub/a.webp"),
      url("u1/hub/b.webp"),
    ]);
    expect(out.get(url("u1/hub/a.webp"))).toBe("https://signed/a");
    expect(out.get(url("u1/hub/b.webp"))).toBe("https://signed/b");
  });

  it("THROWS on a storage error instead of returning an empty map", async () => {
    // The defect class removed across nine findings on 2026-08-02: a failed
    // read resolving to a permissive-looking default. An empty map is
    // indistinguishable from "this artist has no images", which would make a
    // storage outage look like an empty gallery forever.
    createSignedUrls.mockResolvedValue({
      data: null,
      error: { message: "storage exploded" },
    });
    await expect(signGalleryImageUrls([url("u1/hub/a.webp")])).rejects.toThrow(
      /storage exploded/,
    );
  });

  it("never returns an unsigned or public URL on ANY path", async () => {
    // The failure that would matter most is not an exception, it is a silent
    // downgrade to a fetchable URL. Assert on the VALUES, across a mixed batch
    // where one object could not be signed.
    createSignedUrls.mockResolvedValue({
      data: [
        { path: "u1/hub/a.webp", signedUrl: "https://signed/a" },
        {
          path: "u1/hub/gone.webp",
          signedUrl: null,
          error: "Object not found",
        },
      ],
      error: null,
    });
    const out = await signGalleryImageUrls([
      url("u1/hub/a.webp"),
      url("u1/hub/gone.webp"),
    ]);
    expect(out.has(url("u1/hub/gone.webp"))).toBe(false);
    for (const value of out.values()) {
      expect(value).not.toContain("/object/public/");
      expect(value).not.toContain("/storage/v1/object/gallery/");
    }
  });

  it("skips a foreign URL rather than laundering it into a signed one", async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: "u1/hub/a.webp", signedUrl: "https://signed/a" }],
      error: null,
    });
    const out = await signGalleryImageUrls([
      "https://evil.example.com/a.jpg",
      url("u1/hub/a.webp"),
    ]);
    expect(createSignedUrls).toHaveBeenCalledWith(
      ["u1/hub/a.webp"],
      GALLERY_SIGNED_URL_TTL_SECONDS,
    );
    expect(out.has("https://evil.example.com/a.jpg")).toBe(false);
  });

  it("makes no storage call at all when there is nothing signable", async () => {
    const out = await signGalleryImageUrls(["https://example.com/a.jpg"]);
    expect(out.size).toBe(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("de-duplicates repeated paths into one signing request", async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: "u1/hub/a.webp", signedUrl: "https://signed/a" }],
      error: null,
    });
    // The same image may legitimately appear in two gallery blocks.
    const out = await signGalleryImageUrls([
      url("u1/hub/a.webp"),
      url("u1/hub/a.webp"),
    ]);
    expect(createSignedUrls).toHaveBeenCalledWith(
      ["u1/hub/a.webp"],
      GALLERY_SIGNED_URL_TTL_SECONDS,
    );
    expect(out.get(url("u1/hub/a.webp"))).toBe("https://signed/a");
  });

  // R6 Q3 INTERIM SUPPRESSION (b19cf2bb). The three tests below cover behaviour
  // that shipped with zero application-level coverage: a candidate URL under an
  // open "image of me without consent" report must be pulled from the signable
  // set BEFORE the storage call, and a failure to read that moderation state
  // must fail CLOSED rather than sign a possibly-reported image.

  it("drops a URL under an OPEN report BEFORE signing, and signs the rest", async () => {
    // b is under an open report; a is clean. Assert the storage call itself
    // never saw b's path, not merely that b is absent from the output — the
    // suppression is the whole control, and "absent from output" alone would
    // also pass if b were signed and then filtered by some later accident.
    reportsResult.mockReturnValue({
      data: [{ url: url("u1/hub/b.webp") }],
      error: null,
    });
    createSignedUrls.mockResolvedValue({
      data: [{ path: "u1/hub/a.webp", signedUrl: "https://signed/a" }],
      error: null,
    });
    const out = await signGalleryImageUrls([
      url("u1/hub/a.webp"),
      url("u1/hub/b.webp"),
    ]);
    // FALSIFICATION: delete the `pathByUrl.delete(row.url)` suppression loop in
    // signGalleryImageUrls and this reddens — createSignedUrls is then called
    // with both paths and b appears in the output.
    expect(createSignedUrls).toHaveBeenCalledWith(
      ["u1/hub/a.webp"],
      GALLERY_SIGNED_URL_TTL_SECONDS,
    );
    expect(out.get(url("u1/hub/a.webp"))).toBe("https://signed/a");
    expect(out.has(url("u1/hub/b.webp"))).toBe(false);
  });

  it("signs NOTHING when every candidate is under an open report", async () => {
    reportsResult.mockReturnValue({
      data: [{ url: url("u1/hub/a.webp") }],
      error: null,
    });
    const out = await signGalleryImageUrls([url("u1/hub/a.webp")]);
    // FALSIFICATION: remove the post-suppression `if (pathByUrl.size === 0)
    // return out;` guard and this reddens — createSignedUrls is then called
    // with an empty path list instead of not at all.
    expect(out.size).toBe(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("THROWS (fails CLOSED) when the content_reports check errors, and signs nothing", async () => {
    // A moderation-state read that errors must never fall through to signing,
    // or a reported image could be served during a database blip. Note this is
    // the OPPOSITE default from discounts (fail-open): a suppressed image is a
    // consent harm, a lost sale is not the trade here.
    reportsResult.mockReturnValue({
      data: null,
      error: { message: "content_reports unreachable" },
    });
    // FALSIFICATION: delete the `if (reportError) throw` guard and this reddens
    // — the function then treats a null result as "no open reports", signs the
    // URL, and resolves instead of rejecting.
    await expect(signGalleryImageUrls([url("u1/hub/a.webp")])).rejects.toThrow(
      /content_reports/,
    );
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});

describe("renderableGalleryImages: no fallback to the unsigned URL", () => {
  const a = { url: url("u1/hub/a.webp") };
  const b = { url: url("u1/hub/b.webp") };

  // DISTINCTION CONTROL: a helper that dropped everything would satisfy the
  // omission tests below and silently render an empty gallery forever.
  it("renders a signed image, using the SIGNED url as the src", () => {
    const out = renderableGalleryImages(
      [a],
      new Map([[a.url, "https://signed/a"]]),
    );
    expect(out).toEqual([{ image: a, src: "https://signed/a" }]);
  });

  it("omits an image with no signature rather than falling back to image.url", () => {
    // This is the single most likely regression: a `?? img.url` added later
    // for "robustness" would put the inert URL into the DOM, and once the
    // bucket were ever made public it would be a live leak.
    const out = renderableGalleryImages(
      [a, b],
      new Map([[a.url, "https://signed/a"]]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].image).toBe(a);
    expect(out.map((e) => e.src)).not.toContain(b.url);
  });

  it("renders nothing at all when nothing could be signed", () => {
    expect(renderableGalleryImages([a, b], new Map())).toEqual([]);
  });
});
