import { describe, it, expect, vi, beforeEach } from "vitest";

// The shared upload pipeline (Track B slice B1). Pins the two properties the
// gallery build added: `.rotate()` runs BEFORE resize (EXIF orientation applied,
// not just stripped — GB1), and `cacheBust: false` returns the bare public URL
// (unique-path uploads must not store a ?t= into settings JSON).

const { chainCalls, mockUpload, mockGetPublicUrl } = vi.hoisted(() => ({
  chainCalls: [] as { method: string; args: unknown[] }[],
  mockUpload: vi.fn(),
  mockGetPublicUrl: vi.fn(),
}));

vi.mock("@/lib/image-guard", () => ({
  guardedSharp: () => {
    const chain = {
      rotate: (...args: unknown[]) => {
        chainCalls.push({ method: "rotate", args });
        return chain;
      },
      resize: (...args: unknown[]) => {
        chainCalls.push({ method: "resize", args });
        return chain;
      },
      webp: (...args: unknown[]) => {
        chainCalls.push({ method: "webp", args });
        return chain;
      },
      toBuffer: () => Promise.resolve(Buffer.from("processed")),
    };
    return chain;
  },
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => mockUpload(...a),
        getPublicUrl: (...a: unknown[]) => mockGetPublicUrl(...a),
      }),
    },
  },
}));

import { processAndUpload, readImageFromForm } from "@/lib/mobile-image";

function makeFile(bytes = 16, type = "image/jpeg", name = "photo.jpg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  chainCalls.length = 0;
  mockUpload.mockResolvedValue({ error: null });
  mockGetPublicUrl.mockReturnValue({
    data: { publicUrl: "https://cdn.example/logos/u1/hub/x.webp" },
  });
});

describe("processAndUpload", () => {
  it("applies EXIF orientation via rotate() BEFORE resize (GB1)", async () => {
    const r = await processAndUpload(makeFile(), {
      path: "u1/hub/x.webp",
      width: 1600,
      height: 1600,
      fit: "inside",
    });
    expect(r.ok).toBe(true);
    const order = chainCalls.map((c) => c.method);
    expect(order.indexOf("rotate")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("rotate")).toBeLessThan(order.indexOf("resize"));
    // No-arg rotate = auto-orient from EXIF; an angle argument would be a bug.
    expect(chainCalls.find((c) => c.method === "rotate")!.args).toEqual([]);
  });

  it("returns the BARE public URL when cacheBust is false (gallery path)", async () => {
    const r = await processAndUpload(makeFile(), {
      path: "u1/hub/x.webp",
      width: 1600,
      height: 1600,
      fit: "inside",
      upsert: false,
      cacheBust: false,
    });
    expect(r.ok && r.url).toBe("https://cdn.example/logos/u1/hub/x.webp");
  });

  it("keeps the ?t= cache-bust by default (fixed-path uploads need it)", async () => {
    const r = await processAndUpload(makeFile(), {
      path: "u1/cover.webp",
      width: 1600,
      height: 600,
    });
    expect(r.ok && r.url).toMatch(/^https:\/\/cdn\.example\/.+\?t=\d+$/);
  });

  it("passes upsert through to storage", async () => {
    await processAndUpload(makeFile(), {
      path: "u1/hub/x.webp",
      width: 1600,
      height: 1600,
      upsert: false,
    });
    expect(mockUpload).toHaveBeenCalledWith(
      "u1/hub/x.webp",
      expect.anything(),
      expect.objectContaining({ upsert: false }),
    );
  });
});

describe("readImageFromForm", () => {
  it("accepts a valid image", () => {
    const form = new FormData();
    form.set("image", makeFile());
    const r = readImageFromForm(form);
    expect(r.ok).toBe(true);
  });

  it("rejects a missing file, a wrong type, and an oversize file", () => {
    const empty = new FormData();
    expect(readImageFromForm(empty).ok).toBe(false);

    const gif = new FormData();
    gif.set("image", makeFile(16, "image/gif", "a.gif"));
    const r2 = readImageFromForm(gif);
    expect(r2.ok).toBe(false);
    expect(!r2.ok && r2.error).toContain("PNG, JPG, or WebP");

    const big = new FormData();
    big.set("image", makeFile(4 * 1024 * 1024 + 1));
    const r3 = readImageFromForm(big);
    expect(r3.ok).toBe(false);
    expect(!r3.ok && r3.error).toContain("too large");
  });
});
