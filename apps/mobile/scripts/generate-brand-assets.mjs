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
await mkdir(path.join(OUT_DIR, "store"), { recursive: true });

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

// A5 — splash wordmark: the brand "inklee" wordmark (apps/web branding),
// recolored per theme on a transparent bg. The expo-splash-screen plugin sets
// the display size via imageWidth (220dp); these render at ~3x for crispness.
// Light theme = charcoal wordmark on the bone splash bg; dark = near-white
// wordmark on the charcoal splash bg (see app.json expo-splash-screen).
const WORDMARK_SVG = path.join(
  ROOT,
  "apps/web/public/branding/logos/inklee-logo-bone.svg",
);
const NEAR_WHITE = "#f5f5f6";
async function renderWordmark(fill, out) {
  const svg = (await readFile(WORDMARK_SVG, "utf8")).replace(/#f5f5f6/gi, fill);
  await writeFile(
    out,
    await sharp(Buffer.from(svg)).resize({ width: 660 }).png().toBuffer(),
  );
  console.log("wrote", path.relative(ROOT, out));
}
await renderWordmark(NEAR_WHITE, path.join(OUT_DIR, "splash-wordmark-dark.png"));
await renderWordmark(CHARCOAL, path.join(OUT_DIR, "splash-wordmark-light.png"));

// A6 — Android notification small icon: white-on-transparent silhouette
// (Android renders alpha only and tints with the configured accent).
await compose({
  canvas: 96,
  markBuffer: await markLayer(d, WHITE, 84),
  out: path.join(OUT_DIR, "notification-icon.png"),
});

// C1 — Play Store hi-res icon: 512x512, same composition as the app icon.
{
  const mark = await markLayer(d, BONE, 338);
  const img = sharp({
    create: { width: 512, height: 512, channels: 4, background: CHARCOAL },
  }).composite([{ input: mark, gravity: "center" }]);
  await writeFile(
    path.join(OUT_DIR, "store", "play-icon.png"),
    await img.png().toBuffer(),
  );
  console.log("wrote", path.relative(ROOT, path.join(OUT_DIR, "store", "play-icon.png")));
}

// C2 — Play Store feature graphic: 1024x500, charcoal, mark left + wordmark.
// Text renders via SVG (system fonts through fontconfig); if the wordmark
// ever renders blank on a new machine, install/verify fonts or replace the
// text block with designed art.
{
  const mark = await markLayer(d, BONE, 380);
  const text = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="500">
      <text x="0" y="265" font-family="Segoe UI, Arial, sans-serif" font-size="96" font-weight="700" fill="${BONE}">inklee</text>
      <text x="4" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="400" fill="rgba(229,225,213,0.62)">Bookings for tattoo artists</text>
    </svg>`,
  );
  const img = sharp({
    create: { width: 1024, height: 500, channels: 4, background: CHARCOAL },
  }).composite([
    { input: mark, left: 64, top: 60 },
    { input: await sharp(text).png().toBuffer(), left: 470, top: 0 },
  ]);
  await writeFile(
    path.join(OUT_DIR, "store", "feature-graphic.png"),
    await img.png().toBuffer(),
  );
  console.log("wrote", path.relative(ROOT, path.join(OUT_DIR, "store", "feature-graphic.png")));
}

console.log("done");
