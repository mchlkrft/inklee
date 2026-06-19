import sharp from "sharp";

/**
 * Decompression-bomb guard for EVERY server-side sharp pipeline.
 *
 * A tiny upload can decode to a huge raster (a "decompression bomb") and exhaust
 * serverless memory/CPU. sharp's default `limitInputPixels` (~268MP) is far too
 * permissive, and the most exposed entry point is the UNAUTHENTICATED public
 * booking form (an anonymous visitor uploading reference images). Capping the
 * decoded pixel count makes sharp throw on such inputs so the caller's catch can
 * turn it into a clean 400 instead of an OOM/500.
 *
 * This is the single source of the cap: every `sharp()` entry point in the app
 * goes through `guardedSharp` so the guard can never silently diverge again
 * (ME-10 one-source-of-truth). Pass through any extra sharp options; the pixel
 * cap is applied first and can still be overridden by an explicit caller option
 * if one is ever genuinely needed.
 */
export const MAX_INPUT_PIXELS = 50_000_000; // ~50MP

export function guardedSharp(
  input: Buffer,
  options?: sharp.SharpOptions,
): sharp.Sharp {
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, ...options });
}
