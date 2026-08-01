import { describe, it, expect, vi, beforeEach } from "vitest";

// "Import from URL" server-side fetch (founder ruling FD4, 2026-08-01,
// SUPERSEDES GB2): format/scheme validation, the SSRF hostname guard, the
// content-type/size limits (including the mid-stream byte-count abort, which
// is what makes the size cap hold against a body with no, or a false,
// Content-Length), all producing a CLEAR, distinct failure reason rather
// than a generic "something went wrong" (the FD4 brief's own words).

const { mockIsPublicHostname } = vi.hoisted(() => ({
  mockIsPublicHostname: vi.fn(),
}));
vi.mock("@/lib/server/ssrf-guard", () => ({
  isPublicHostname: (...a: unknown[]) => mockIsPublicHostname(...a),
}));

import { fetchImageForImport } from "../gallery-url-import";

const fetchMock = vi.fn();

/** A minimal mock of a fetch Response body: `getReader().read()` yields each
 *  chunk size in sequence as a zero-filled Uint8Array, then `{ done: true }`.
 *  Returns the `cancel` spy so a test can assert the stream was aborted. */
function chunkedBody(chunkSizes: number[]): {
  body: unknown;
  cancel: ReturnType<typeof vi.fn>;
} {
  const cancel = vi.fn(async () => undefined);
  let i = 0;
  const body = {
    getReader: () => ({
      read: async () => {
        if (i >= chunkSizes.length) {
          return { done: true, value: undefined } as const;
        }
        const value = new Uint8Array(chunkSizes[i]);
        i += 1;
        return { done: false, value } as const;
      },
      cancel,
    }),
  };
  return { body, cancel };
}

function jpegResponse(
  bytes: number,
  overrides: Partial<Record<string, unknown>> = {},
): Response {
  const { body } = chunkedBody(bytes > 0 ? [bytes] : []);
  return {
    ok: true,
    headers: new Headers({
      "content-type": "image/jpeg",
      "content-length": String(bytes),
    }),
    body,
    ...overrides,
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsPublicHostname.mockResolvedValue(true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(jpegResponse(16));
});

describe("fetchImageForImport", () => {
  it("imports a well-formed, reachable https image URL", async () => {
    const r = await fetchImageForImport("https://example.com/a.jpg");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file).toBeInstanceOf(File);
      expect(r.file.type).toBe("image/jpeg");
    }
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/a.jpg",
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("rejects an unparseable URL before touching the network", async () => {
    const r = await fetchImageForImport("not a url");
    expect(r).toEqual({
      ok: false,
      error: "That doesn't look like a valid URL.",
    });
    expect(mockIsPublicHostname).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a plain http URL (https-only) before the SSRF check", async () => {
    const r = await fetchImageForImport("http://example.com/a.jpg");
    expect(r).toEqual({
      ok: false,
      error: "Only https:// image URLs can be imported.",
    });
    expect(mockIsPublicHostname).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a private/unreachable hostname BEFORE fetching (SSRF guard)", async () => {
    mockIsPublicHostname.mockResolvedValue(false);
    const r = await fetchImageForImport(
      "https://169.254.169.254/latest/meta-data/",
    );
    expect(r).toEqual({ ok: false, error: "That URL can't be reached." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a network/fetch failure (incl. a denied redirect) as a clear reason", async () => {
    fetchMock.mockRejectedValue(new TypeError("unexpected redirect"));
    const r = await fetchImageForImport("https://example.com/a.jpg");
    expect(r).toEqual({ ok: false, error: "Could not reach that URL." });
  });

  it("rejects a non-OK HTTP status", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      headers: new Headers(),
    } as Response);
    const r = await fetchImageForImport("https://example.com/missing.jpg");
    expect(r).toEqual({
      ok: false,
      error: "That URL did not return an image.",
    });
  });

  it("rejects a disallowed content-type", async () => {
    fetchMock.mockResolvedValue(
      jpegResponse(16, {
        headers: new Headers({ "content-type": "text/html" }),
      }),
    );
    const r = await fetchImageForImport("https://example.com/page.html");
    expect(r).toEqual({ ok: false, error: "Image must be PNG, JPG, or WebP." });
  });

  it("tolerates a content-type with a charset parameter", async () => {
    fetchMock.mockResolvedValue(
      jpegResponse(16, {
        headers: new Headers({
          "content-type": "image/jpeg; charset=binary",
        }),
      }),
    );
    const r = await fetchImageForImport("https://example.com/a.jpg");
    expect(r.ok).toBe(true);
  });

  it("rejects an oversized image via the declared Content-Length, before reading the body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-type": "image/jpeg",
        "content-length": String(5 * 1024 * 1024),
      }),
      // No `body` provided: if the code touched it before the declared-length
      // check, calling `.getReader` on `undefined` would throw and fail the
      // test — this is what proves the declared-length check runs FIRST.
    } as unknown as Response);
    const r = await fetchImageForImport("https://example.com/huge.jpg");
    expect(r).toEqual({ ok: false, error: "Image is too large (max 4 MB)." });
  });

  it("aborts MID-STREAM the moment actual bytes cross the cap, without waiting for `done` (defends against no/false Content-Length)", async () => {
    // 3 x 2MB chunks = 6MB against a 4MB cap: the 3rd chunk pushes the running
    // total past the cap, so the read loop must stop THERE, never requesting
    // a 4th chunk and never buffering the full 6MB.
    const chunkSize = 2 * 1024 * 1024;
    const { body, cancel } = chunkedBody([chunkSize, chunkSize, chunkSize]);
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }), // no content-length
      body,
    } as unknown as Response);
    const r = await fetchImageForImport("https://example.com/huge.jpg");
    expect(r).toEqual({ ok: false, error: "Image is too large (max 4 MB)." });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty body", async () => {
    fetchMock.mockResolvedValue(jpegResponse(0));
    const r = await fetchImageForImport("https://example.com/empty.jpg");
    expect(r).toEqual({
      ok: false,
      error: "That URL returned an empty file.",
    });
  });

  it("rejects when the body is missing entirely", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      body: null,
    } as unknown as Response);
    const r = await fetchImageForImport("https://example.com/a.jpg");
    expect(r).toEqual({ ok: false, error: "Could not read that image." });
  });
});
