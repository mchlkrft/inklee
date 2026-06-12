// Generates the app's brand assets (docs/mobile-store-assets.md §A) from the
// canonical spiderweb mark in apps/web/src/app/icon.svg, recolored to the
// founder-chosen app theme: bone spiderweb on charcoal.
//
//   node apps/mobile/scripts/generate-brand-assets.mjs   (run from repo root)
//
// Outputs into apps/mobile/assets/. Uses the workspace's hoisted sharp.
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC_SVG = path.join(ROOT, "apps/web/src/app/icon.svg");
const OUT_DIR = path.join(ROOT, "apps/mobile/assets");

const CHARCOAL = "#1e1e1e";
const BONE = "#e5e1d5";
const WHITE = "#ffffff";

// The source icon is the mark (class .b, mustard) on a rounded charcoal rect
// (class .c). We extract just the mark path and re-fill it per asset; the
// backgrounds are composed here (Apple masks its own corners, Android crops
// the adaptive layers, so the rounded rect must NOT be baked in).
async function loadMarkPath() {
  const svg = await readFile(SRC_SVG, "utf8");
  const m = svg.match(/<path class="b" d="([^"]+)"/);
  if (!m) throw new Error("Could not find the mark path (.b) in icon.svg");
  return m[1];
}

function markSvg(d, fill) {
  // Square viewBox matching the source rect (the file's own viewBox is
  // slightly shorter and would clip the mark's bottom edge).
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1234.33814 1234.33814"><path fill="${fill}" d="${d}"/></svg>`,
  );
}

// Tightly-cropped mark at high resolution, ready to scale + composite.
async function renderMark(d, fill) {
  return sharp(markSvg(d, fill), { density: 220 }).trim().png().toBuffer();
}

async function markLayer(d, fill, size) {
  const mark = await renderMark(d, fill);
  return sharp(mark)
    .resize(size, size, { fit: "inside" })
    .png()
    .toBuffer();
}

async function compose({ canvas, background, markBuffer, out }) {
  const img = sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: markBuffer, gravity: "center" }]);
  await writeFile(out, await img.png().toBuffer());
  console.log("wrote", path.relative(ROOT, out));
}

const d = await loadMarkPath();
await mkdir(OUT_DIR, { recursive: true });

// A1 — iOS/base app icon: full-bleed charcoal, bone mark at ~66% width.
await compose({
  canvas: 1024,
  background: CHARCOAL,
  markBuffer: await markLayer(d, BONE, 676),
  out: path.join(OUT_DIR, "icon.png"),
});

// A2 — Android adaptive foreground: transparent, mark inside the ~61% safe
// circle (the OS crops to circle/squircle), so 580px on the 1024 canvas.
await compose({
  canvas: 1024,
  markBuffer: await markLayer(d, BONE, 580),
  out: path.join(OUT_DIR, "adaptive-icon.png"),
});

// A4 — Android 13+ monochrome layer: white silhouette, same safe-zone geometry.
await compose({
  canvas: 1024,
  markBuffer: await markLayer(d, WHITE, 580),
  out: path.join(OUT_DIR, "monochrome-icon.png"),
});

// A5 — splash logo: transparent, generous padding; display size is set by the
// expo-splash-screen plugin's imageWidth, the file just needs to be crisp.
await compose({
  canvas: 1024,
  markBuffer: await markLayer(d, BONE, 720),
  out: path.join(OUT_DIR, "splash-logo.png"),
});

// A6 — Android notification small icon: white-on-transparent silhouette
// (Android renders alpha only and tints with the configured accent).
await compose({
  canvas: 96,
  markBuffer: await markLayer(d, WHITE, 84),
  out: path.join(OUT_DIR, "notification-icon.png"),
});

console.log("done");
