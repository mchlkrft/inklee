import { guardedSharp } from "@/lib/image-guard";

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 85;

export type ProcessedImage = {
  buffer: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
  fileSize: number;
};

export async function processImage(file: File): Promise<ProcessedImage> {
  const input = Buffer.from(await file.arrayBuffer());

  const pipeline = guardedSharp(input).rotate(); // auto-rotate from EXIF

  const meta = await pipeline.clone().metadata();
  const origW = meta.width ?? 0;
  const origH = meta.height ?? 0;

  // Only resize if larger than max dimension
  const needsResize = origW > MAX_DIMENSION || origH > MAX_DIMENSION;

  const processed = needsResize
    ? pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
    : pipeline;

  const output = await processed
    .webp({ quality: WEBP_QUALITY, effort: 3 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: output.data,
    mimeType: "image/webp",
    width: output.info.width,
    height: output.info.height,
    fileSize: output.info.size,
  };
}
