#!/usr/bin/env node
/**
 * Overture Maps tattoo candidate extractor (zero-cost, offline).
 *
 * Pulls tattoo-relevant places from Overture's public GeoParquet on S3
 * (anonymous reads, AWS Open Data program) for a bounding box around a seed
 * area, and writes a candidates JSON file for the admin import lane at
 * /admin/map/seeding/<area>. SoT: docs/product/inklee-2-map-seeding-tool.md.
 *
 * Requires the DuckDB CLI on PATH (single portable binary, free):
 *   winget install DuckDB.cli        (Windows)
 *   brew install duckdb              (macOS)
 *
 * Usage:
 *   node scripts/overture-tattoo-extract.cjs \
 *     --lat 18.7883 --lng 98.9853 --radius-km 15 \
 *     --release 2026-06-18.0 --out chiang-mai.json
 *
 * Find the latest release name at https://docs.overturemaps.org/release/.
 * The places `categories` column is mid-migration to `basic_category`; the
 * script tries the current shape first and falls back automatically.
 */

const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i === process.argv.length - 1) return fallback;
  return process.argv[i + 1];
}

const lat = Number(arg("lat"));
const lng = Number(arg("lng"));
const radiusKm = Number(arg("radius-km", "15"));
const release = arg("release");
const out = arg("out", "overture-candidates.json");
const maxRows = Number(arg("max", "200"));
// Explicit box: --bbox west,south,east,north. Continent-scale extractions
// need tall or wide boxes that a centre-plus-radius square cannot express,
// and splitting one huge scan into bands is what keeps each run inside its
// timeout.
const bboxArg = arg("bbox");
// Country-scale bboxes scan a lot of remote parquet; 10 minutes is fine for
// a city, not for Germany. Tune with --timeout-min.
const timeoutMin = Number(arg("timeout-min", "45"));

if (!release || (!bboxArg && (!Number.isFinite(lat) || !Number.isFinite(lng)))) {
  console.error(
    "Usage: node scripts/overture-tattoo-extract.cjs (--lat <lat> --lng <lng> [--radius-km 15] | --bbox west,south,east,north) --release <YYYY-MM-DD.n> [--out file.json] [--max 200] [--timeout-min 45]",
  );
  process.exit(1);
}

let box;
if (bboxArg) {
  const parts = bboxArg.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    console.error("--bbox needs four numbers: west,south,east,north");
    process.exit(1);
  }
  const [west, south, east, north] = parts;
  if (west >= east || south >= north) {
    console.error("--bbox must satisfy west < east and south < north");
    process.exit(1);
  }
  box = { latMin: south, latMax: north, lngMin: west, lngMax: east };
} else {
  const latDelta = radiusKm / 111.32;
  const lngDelta =
    radiusKm / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  box = {
    latMin: lat - latDelta,
    latMax: lat + latDelta,
    lngMin: lng - lngDelta,
    lngMax: lng + lngDelta,
  };
}

const source = `read_parquet('s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*', filename=true, hive_partitioning=1)`;

// Tattoo-relevant filters: category hit OR name hit. Conservative on purpose;
// every row goes through admin review anyway.
const nameFilter = `(
  lower(names.primary) LIKE '%tattoo%'
  OR lower(names.primary) LIKE '%tätowier%'
  OR lower(names.primary) LIKE '%piercing%'
  OR lower(names.primary) LIKE '% ink %'
  OR lower(names.primary) LIKE '% ink'
)`;

function sql(categoryExpr) {
  return `
INSTALL httpfs; LOAD httpfs;
SET s3_region='us-west-2';
SELECT
  id,
  names.primary AS name,
  bbox.ymin AS latitude,
  bbox.xmin AS longitude,
  ${categoryExpr} AS category,
  addresses[1].locality AS city,
  addresses[1].country AS country,
  addresses[1].freeform AS address,
  addresses[1].postcode AS postalCode,
  phones[1] AS phone,
  websites[1] AS websiteUrl,
  socials[1] AS socialUrl
FROM ${source}
WHERE bbox.ymin BETWEEN ${box.latMin} AND ${box.latMax}
  AND bbox.xmin BETWEEN ${box.lngMin} AND ${box.lngMax}
  AND (
    lower(coalesce(${categoryExpr}, '')) LIKE '%tattoo%'
    OR lower(coalesce(${categoryExpr}, '')) LIKE '%piercing%'
    OR ${nameFilter}
  )
LIMIT ${maxRows};
`;
}

function runDuck(query) {
  return execFileSync("duckdb", ["-json", "-c", query], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: timeoutMin * 60 * 1000,
  });
}

let rows;
try {
  try {
    rows = JSON.parse(runDuck(sql("categories.primary")) || "[]");
  } catch (err) {
    // Only a SCHEMA error justifies the basic_category fallback; a timeout
    // or network failure would just burn another full scan.
    const schemaError = /categories|Binder Error|not found in FROM/i.test(
      String(err.stderr ?? err.message ?? ""),
    );
    if (!schemaError) throw err;
    console.error("categories.primary failed, retrying with basic_category…");
    rows = JSON.parse(runDuck(sql("basic_category")) || "[]");
  }
} catch (err) {
  if (err.code === "ENOENT") {
    console.error(
      "The DuckDB CLI is not installed or not on PATH. Install it first (winget install DuckDB.cli).",
    );
  } else if (err.code === "ETIMEDOUT") {
    console.error(
      `Extraction timed out after ${timeoutMin} minutes. Re-run with a larger --timeout-min (the scan is resumable only from scratch, but S3 reads often go faster on a retry).`,
    );
  } else {
    console.error("Extraction failed:", err.message);
  }
  process.exit(1);
}

const candidates = rows
  .filter((r) => r.id && r.name && Number.isFinite(Number(r.latitude)))
  .map((r) => ({
    id: String(r.id),
    name: String(r.name),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    category: r.category ? String(r.category) : null,
    city: r.city ? String(r.city) : null,
    country: r.country ? String(r.country) : null,
    address: r.address ? String(r.address) : null,
    postalCode: r.postalCode ? String(r.postalCode) : null,
    phone: r.phone ? String(r.phone) : null,
    websiteUrl: r.websiteUrl ? String(r.websiteUrl) : null,
    socialUrl: r.socialUrl ? String(r.socialUrl) : null,
  }));

writeFileSync(out, JSON.stringify(candidates, null, 2));
console.log(
  `Wrote ${candidates.length} candidates to ${out} (bbox ${box.latMin.toFixed(4)}..${box.latMax.toFixed(4)}, ${box.lngMin.toFixed(4)}..${box.lngMax.toFixed(4)}, release ${release}).`,
);
console.log(
  "License: Overture places theme, CDLA-Permissive-2.0. Import via /admin/map/seeding.",
);
