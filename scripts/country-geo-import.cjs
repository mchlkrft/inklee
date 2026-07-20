#!/usr/bin/env node
/**
 * Generic country geography importer for the coverage orchestrator.
 * Supersedes germany-geo-import.cjs (kept for compatibility).
 *
 *   node scripts/country-geo-import.cjs --country=AT [--out=units.json] [--post] [--base=https://inklee.app]
 *
 * Adapters (official identifiers, refreshable without identity loss):
 *   DE  OpenDataSoft georef-germany-gemeinde (ARS->AGS) + Wikidata pop/area by AGS (P439)
 *   AT  Wikidata only: Gemeindekennziffer (P964, first digit = Bundesland),
 *       coordinates (P625), population (P1082), area (P2046), district (P131)
 *   CH  OpenDataSoft georef-switzerland-gemeinde (BFS number, canton,
 *       district, centroid) + Wikidata population by BFS (P771)
 *
 * --post sends the dataset to /api/admin/seed-coverage (CRON_SECRET auth).
 */
const fs = require("node:fs");
const path = require("node:path");

const UA = "InkleeSeedCoverage/1.0 (+https://inklee.app)";
const ODS =
  "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets";
const WIKIDATA = "https://query.wikidata.org/sparql";

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

async function sparql(query) {
  const res = await fetch(`${WIKIDATA}?query=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
  });
  if (!res.ok) fail(`Wikidata query failed: HTTP ${res.status}`);
  return (await res.json()).results?.bindings ?? [];
}

function parsePoint(wkt) {
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(wkt ?? "");
  if (!m) return null;
  return { latitude: Number(m[2]), longitude: Number(m[1]) };
}

// ---------------------------------------------------------------------------
// Adapters. Each returns { sourceVersion, source, attribution, units }.

async function adapterDE() {
  const url = `${ODS}/georef-germany-gemeinde/exports/json?select=year,gem_code,gem_name,gem_name_short,gem_type,lan_code,lan_name,krs_code,krs_name,geo_point_2d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) fail(`OpenDataSoft export failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 5000)
    fail(`Implausible DE export (${rows?.length ?? 0} rows).`);

  console.log("→ Wikidata population/area by AGS…");
  const wd = new Map();
  for (const b of await sparql(
    `SELECT ?ags ?pop ?area WHERE { ?m wdt:P439 ?ags . OPTIONAL { ?m wdt:P1082 ?pop } OPTIONAL { ?m wdt:P2046 ?area } }`,
  )) {
    const ags = b.ags?.value;
    if (!ags) continue;
    const cur = wd.get(ags) ?? {};
    const pop = b.pop && Number.isFinite(Number(b.pop.value)) ? Math.round(Number(b.pop.value)) : null;
    if (pop && (!cur.population || pop > cur.population)) cur.population = pop;
    if (b.area && !cur.areaKm2) cur.areaKm2 = Number(b.area.value);
    wd.set(ags, cur);
  }

  const seen = new Set();
  const units = [];
  for (const m of rows) {
    const ars = String(m.gem_code ?? "").trim();
    const ags = ars.length === 12 ? `${ars.slice(0, 5)}${ars.slice(9, 12)}` : ars;
    const name = String(m.gem_name_short ?? m.gem_name ?? "").trim();
    if (!ags || !name || seen.has(ags)) continue;
    seen.add(ags);
    const extra = wd.get(ags) ?? {};
    units.push({
      externalId: ags,
      name,
      aliases: [
        ...(m.gem_name && m.gem_name !== name ? [String(m.gem_name)] : []),
        ...(ars.length === 12 ? [`ars:${ars}`] : []),
      ],
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
  return {
    source: "opendatasoft-georef+wikidata",
    sourceVersion: `georef-${rows[0]?.year ?? "unknown"}+wikidata-${new Date().toISOString().slice(0, 10)}`,
    attribution:
      "Municipality register: BKG/Destatis via OpenDataSoft (dl-de/by-2-0). Population: Wikidata (CC0).",
    units,
  };
}

const AT_STATES = {
  1: "Burgenland",
  2: "Kärnten",
  3: "Niederösterreich",
  4: "Oberösterreich",
  5: "Salzburg",
  6: "Steiermark",
  7: "Tirol",
  8: "Vorarlberg",
  9: "Wien",
};

async function adapterAT() {
  console.log("→ Wikidata Austrian municipalities (P964)…");
  const rows = await sparql(`SELECT ?code ?mLabel ?coord ?pop ?area ?districtLabel WHERE {
    ?m wdt:P964 ?code .
    FILTER NOT EXISTS { ?m wdt:P576 ?dissolved }
    OPTIONAL { ?m wdt:P625 ?coord }
    OPTIONAL { ?m wdt:P1082 ?pop }
    OPTIONAL { ?m wdt:P131 ?district }
    OPTIONAL { ?m wdt:P2046 ?area }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "de". }
  }`);
  const byCode = new Map();
  for (const b of rows) {
    const code = String(b.code?.value ?? "").trim();
    const name = String(b.mLabel?.value ?? "").trim();
    if (!/^\d{5}$/.test(code) || !name || name === code) continue;
    const cur = byCode.get(code);
    const pop = b.pop && Number.isFinite(Number(b.pop.value)) ? Math.round(Number(b.pop.value)) : null;
    const next = {
      externalId: code,
      name,
      aliases: [],
      stateCode: code[0],
      stateName: AT_STATES[Number(code[0])] ?? `State ${code[0]}`,
      districtCode: code.slice(0, 3),
      districtName: b.districtLabel?.value ?? null,
      population: pop,
      areaKm2: b.area ? Number(b.area.value) : null,
      centroid: parsePoint(b.coord?.value),
      settlementClass: null,
    };
    // Duplicate bindings (several statements) keep the richest row.
    if (!cur || (pop && (!cur.population || pop > cur.population)))
      byCode.set(code, { ...cur, ...next });
  }
  const units = [...byCode.values()];
  if (units.length < 1800) fail(`Implausible AT dataset (${units.length}).`);
  return {
    source: "wikidata-p964",
    sourceVersion: `wikidata-${new Date().toISOString().slice(0, 10)}`,
    attribution:
      "Austrian municipalities: Wikidata (CC0), Gemeindekennziffer per Statistik Austria.",
    units,
  };
}

async function adapterCH() {
  const url = `${ODS}/georef-switzerland-gemeinde/exports/json?select=year,gem_code,gem_name,kan_code,kan_name,bez_code,bez_name,geo_point_2d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) fail(`OpenDataSoft export failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 1500)
    fail(`Implausible CH export (${rows?.length ?? 0} rows).`);

  // Keep only the latest snapshot year per municipality.
  const latestYear = Math.max(...rows.map((r) => Number(r.year ?? 0)));

  console.log("→ Wikidata population by BFS (P771)…");
  const wd = new Map();
  for (const b of await sparql(
    `SELECT ?bfs ?pop WHERE { ?m wdt:P771 ?bfs . OPTIONAL { ?m wdt:P1082 ?pop } }`,
  )) {
    const key = String(parseInt(String(b.bfs?.value ?? ""), 10));
    if (!key || key === "NaN") continue;
    const pop = b.pop && Number.isFinite(Number(b.pop.value)) ? Math.round(Number(b.pop.value)) : null;
    if (pop && (!wd.has(key) || pop > wd.get(key))) wd.set(key, pop);
  }

  const seen = new Set();
  const units = [];
  for (const m of rows) {
    if (Number(m.year ?? 0) !== latestYear) continue;
    const raw = String(m.gem_code ?? "").trim();
    const bfs = String(parseInt(raw, 10));
    const name = String(m.gem_name ?? "").trim();
    if (!bfs || bfs === "NaN" || !name || seen.has(bfs)) continue;
    seen.add(bfs);
    units.push({
      externalId: bfs,
      name,
      aliases: raw !== bfs ? [`bfs:${raw}`] : [],
      stateCode: String(m.kan_code ?? ""),
      stateName: String(m.kan_name ?? ""),
      districtCode: m.bez_code ? String(m.bez_code) : null,
      districtName: m.bez_name ? String(m.bez_name) : null,
      population: wd.get(bfs) ?? null,
      areaKm2: null,
      centroid:
        m.geo_point_2d && Number.isFinite(Number(m.geo_point_2d.lat))
          ? {
              latitude: Number(m.geo_point_2d.lat),
              longitude: Number(m.geo_point_2d.lon),
            }
          : null,
      settlementClass: null,
    });
  }
  return {
    source: "opendatasoft-georef+wikidata",
    sourceVersion: `georef-${latestYear}+wikidata-${new Date().toISOString().slice(0, 10)}`,
    attribution:
      "Swiss municipalities: swisstopo/BFS via OpenDataSoft. Population: Wikidata (CC0).",
    units,
  };
}

const ADAPTERS = { DE: adapterDE, AT: adapterAT, CH: adapterCH };

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
  const country = (arg("country") ?? "").toUpperCase();
  const adapter = ADAPTERS[country];
  if (!adapter)
    fail(`No geography adapter for "${country}". Available: ${Object.keys(ADAPTERS).join(", ")}`);
  const out = arg("out", `${country.toLowerCase()}-units.json`);

  console.log(`→ building the ${country} geography…`);
  const dataset = await adapter();
  const withPop = dataset.units.filter((u) => u.population).length;
  const withCoord = dataset.units.filter((u) => u.centroid).length;
  fs.writeFileSync(out, JSON.stringify(dataset, null, 1));
  console.log(
    `✓ ${dataset.units.length} units (${withPop} with population, ${withCoord} with centroid) -> ${out}; version ${dataset.sourceVersion}`,
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
        countryCode: country,
        source: dataset.source,
        sourceVersion: dataset.sourceVersion,
        attribution: dataset.attribution,
        units: dataset.units,
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
