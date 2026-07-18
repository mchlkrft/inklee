#!/usr/bin/env node
/**
 * Germany geography importer for the country coverage orchestrator.
 *
 * Sources (both free, attribution recorded on the dataset row):
 *  1. OpenDataSoft "georef-germany-gemeinde" - official municipality register
 *     (AGS keys, state/district hierarchy, centroids). Derived from BKG/
 *     Destatis data, Datenlizenz Deutschland (dl-de/by-2-0).
 *  2. Wikidata SPARQL - population (P1082) and area (P2046) keyed by AGS
 *     (P439). CC0. Used because the official GV100AD carries population but
 *     no coordinates and ships as fixed-width/xlsx; a later adapter refresh
 *     can swap this source without losing unit identity (upsert by AGS).
 *
 * Usage:
 *   node scripts/germany-geo-import.cjs [--out germany-units.json] [--post]
 *     [--base=http://localhost:3000]
 *
 * --post sends the dataset to /api/admin/seed-coverage (CRON_SECRET auth);
 * without it the script only writes the JSON artifact.
 */
const fs = require("node:fs");
const path = require("node:path");

function flag(name) {
  return process.argv.includes(`--${name}`);
}
function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
function fail(m) {
  console.error(`✗ ${m}`);
  process.exit(1);
}

const ODS_BASE =
  "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-germany-gemeinde";
const WIKIDATA = "https://query.wikidata.org/sparql";
const UA = "InkleeSeedCoverage/1.0 (+https://inklee.app)";

async function fetchMunicipalities() {
  // The records API pages at 100; the export endpoint streams everything in
  // one request. select strips the multi-MB geometry.
  const url = `${ODS_BASE}/exports/json?select=year,gem_code,gem_name,gem_name_short,gem_type,lan_code,lan_name,krs_code,krs_name,geo_point_2d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) fail(`OpenDataSoft export failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 5000)
    fail(`Implausible municipality export (${rows?.length ?? 0} rows).`);
  return rows;
}

async function fetchWikidataByAgs() {
  const query = `SELECT ?ags ?pop ?area WHERE {
    ?m wdt:P439 ?ags .
    OPTIONAL { ?m wdt:P1082 ?pop }
    OPTIONAL { ?m wdt:P2046 ?area }
  }`;
  const res = await fetch(
    `${WIKIDATA}?query=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": UA,
      },
    },
  );
  if (!res.ok) fail(`Wikidata query failed: HTTP ${res.status}`);
  const data = await res.json();
  const byAgs = new Map();
  for (const b of data.results?.bindings ?? []) {
    const ags = b.ags?.value;
    if (!ags) continue;
    const existing = byAgs.get(ags) ?? {};
    const pop = b.pop ? Number(b.pop.value) : null;
    const area = b.area ? Number(b.area.value) : null;
    if (pop && (!existing.population || pop > existing.population))
      existing.population = pop;
    if (area && !existing.areaKm2) existing.areaKm2 = area;
    byAgs.set(ags, existing);
  }
  return byAgs;
}

function readSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  const envFile = path.join(__dirname, "..", "apps", "web", ".env.local");
  if (fs.existsSync(envFile)) {
    const line = fs
      .readFileSync(envFile, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("CRON_SECRET="));
    if (line)
      return line.slice("CRON_SECRET=".length).trim().replace(/^"|"$/g, "");
  }
  return null;
}

async function main() {
  const out = arg("out", "germany-units.json");
  console.log("→ downloading the municipality register (OpenDataSoft)…");
  const municipalities = await fetchMunicipalities();
  console.log(`  ${municipalities.length} municipalities.`);
  console.log("→ downloading population/area by AGS (Wikidata)…");
  const wikidata = await fetchWikidataByAgs();
  console.log(`  ${wikidata.size} AGS keys with population or area.`);

  const year = municipalities[0]?.year ?? "unknown";
  const seen = new Set();
  const units = [];
  let withPop = 0;
  for (const m of municipalities) {
    // OpenDataSoft carries the 12-digit ARS; the stable municipality key is
    // the 8-digit AGS = state(2)+region(1)+district(2) + municipality(3).
    const ars = String(m.gem_code ?? "").trim();
    const ags =
      ars.length === 12 ? `${ars.slice(0, 5)}${ars.slice(9, 12)}` : ars;
    const name = String(m.gem_name_short ?? m.gem_name ?? "").trim();
    if (!ags || !name || seen.has(ags)) continue;
    seen.add(ags);
    const extra = wikidata.get(ags) ?? {};
    if (extra.population) withPop += 1;
    const aliases = [];
    if (m.gem_name && m.gem_name !== name) aliases.push(String(m.gem_name));
    if (ars.length === 12) aliases.push(`ars:${ars}`);
    units.push({
      externalId: ags,
      name,
      aliases,
      stateCode: String(m.lan_code ?? ""),
      stateName: String(m.lan_name ?? ""),
      districtCode: m.krs_code ? String(m.krs_code) : null,
      districtName: m.krs_name ? String(m.krs_name) : null,
      population: extra.population ?? null,
      areaKm2: extra.areaKm2 ?? null,
      centroid:
        m.geo_point_2d && Number.isFinite(Number(m.geo_point_2d.lat))
          ? {
              latitude: Number(m.geo_point_2d.lat),
              longitude: Number(m.geo_point_2d.lon),
            }
          : null,
      settlementClass: m.gem_type ? String(m.gem_type) : null,
    });
  }

  const sourceVersion = `georef-${year}+wikidata-${new Date().toISOString().slice(0, 10)}`;
  fs.writeFileSync(out, JSON.stringify({ sourceVersion, units }, null, 1));
  console.log(
    `✓ wrote ${units.length} units (${withPop} with population) to ${out}; version ${sourceVersion}.`,
  );

  if (flag("post")) {
    const base = (arg("base", "http://localhost:3000") || "").replace(/\/+$/, "");
    const secret = readSecret();
    if (!secret) fail("CRON_SECRET not found (env or apps/web/.env.local).");
    console.log(`→ importing into ${base}…`);
    const res = await fetch(`${base}/api/admin/seed-coverage`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        action: "import-dataset",
        countryCode: "DE",
        source: "opendatasoft-georef+wikidata",
        sourceVersion,
        attribution:
          "Municipality register: BKG/Destatis via OpenDataSoft (dl-de/by-2-0). Population: Wikidata (CC0).",
        units,
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) fail(`Import failed HTTP ${res.status}: ${payload?.error}`);
    console.log(
      `✓ imported: ${payload.unitCount} municipalities, ${payload.clusterCount} rural clusters.`,
    );
  }
}

main().catch((e) => fail(e.message ?? String(e)));
