#!/usr/bin/env node
/**
 * OpenStreetMap tattoo extractor: ONE bounded country-wide Overpass query
 * (shop=tattoo / tattoo=yes), never per-municipality spam. Pilot-grade use
 * of the public Overpass API with a descriptive User-Agent and a hard
 * timeout; for recurring nationwide refreshes switch to a Geofabrik extract
 * or a self-hosted Overpass (documented limitation).
 *
 * License: ODbL. Attribution is carried on every ingested discovery.
 *
 * Usage:
 *   node scripts/osm-tattoo-extract.cjs [--country=DE] [--out osm-tattoo.json]
 */
const fs = require("node:fs");

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
function fail(m) {
  console.error(`✗ ${m}`);
  process.exit(1);
}

const country = (arg("country", "DE") || "DE").toUpperCase();
const out = arg("out", `osm-tattoo-${country.toLowerCase()}.json`);

const query = `
[out:json][timeout:180];
area["ISO3166-1"="${country}"][admin_level=2]->.c;
(
  nwr["shop"="tattoo"](area.c);
  nwr["tattoo"="yes"]["shop"](area.c);
);
out center tags;
`;

function pick(tags, ...keys) {
  for (const k of keys) {
    if (tags[k]) return String(tags[k]);
  }
  return null;
}

async function main() {
  console.log(`→ one Overpass query for ${country} (shop=tattoo)…`);
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "User-Agent": "InkleeSeedCoverage/1.0 (+https://inklee.app)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(200_000),
  });
  if (!res.ok) fail(`Overpass returned HTTP ${res.status}.`);
  const data = await res.json();
  const elements = Array.isArray(data.elements) ? data.elements : [];

  const rows = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = pick(tags, "name");
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const instagram = pick(tags, "contact:instagram", "instagram");
    const socialUrl = instagram
      ? instagram.startsWith("http")
        ? instagram
        : `https://instagram.com/${instagram.replace(/^@/, "")}`
      : null;
    const street = pick(tags, "addr:street");
    const number = pick(tags, "addr:housenumber");
    rows.push({
      provider: "osm",
      providerResultId: `${el.type}/${el.id}`,
      name,
      category: tags.shop === "tattoo" ? "tattoo" : pick(tags, "shop"),
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lon) ? lon : null,
      address: street ? `${street}${number ? ` ${number}` : ""}` : null,
      city: pick(tags, "addr:city"),
      postalCode: pick(tags, "addr:postcode"),
      websiteUrl: pick(tags, "website", "contact:website"),
      socialUrl,
      phone: pick(tags, "phone", "contact:phone"),
      email: pick(tags, "email", "contact:email"),
      sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    });
  }
  fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  console.log(
    `✓ wrote ${rows.length} OSM tattoo places to ${out}. Attribution: OpenStreetMap contributors (ODbL).`,
  );
  console.log(
    `  Ingest with: node scripts/seed-coverage.cjs ingest --run=<id> --provider=osm --file=${out}`,
  );
}

main().catch((e) => fail(e.message ?? String(e)));
