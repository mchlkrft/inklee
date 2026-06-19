import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { guardedSharp, MAX_INPUT_PIXELS } from "@/lib/image-guard";

// A solid-colour raster compresses to a tiny PNG but decodes to its full pixel
// count: the canonical "decompression bomb". 7100x7100 = 50.41MP, just over the
// 50MP cap, so the guard must reject it while a normal image passes.
async function solidPng(size: number): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 120, g: 90, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

describe("guardedSharp", () => {
  it("pins the decompression-bomb cap at ~50MP", () => {
    expect(MAX_INPUT_PIXELS).toBe(50_000_000);
  });

  it("rejects a tiny file that decodes past the pixel cap", async () => {
    const bomb = await solidPng(7100); // ~50.4MP > cap
    // A small on-disk file (well under the 4MB upload cap) that decodes to a
    // ~150MB raster: the whole point of the guard.
    expect(bomb.byteLength).toBeLessThan(4 * 1024 * 1024);
    await expect(
      guardedSharp(bomb).resize(64, 64).webp().toBuffer(),
    ).rejects.toThrow();
  });

  it("processes a normal image to webp", async () => {
    const ok = await solidPng(64); // well under the cap
    const out = await guardedSharp(ok)
      .resize(32, 32, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(32);
  });
});
