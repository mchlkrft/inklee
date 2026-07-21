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

async function adapterGB() {
  const url = `${ODS}/georef-united-kingdom-local-authority-district/exports/json?select=year,lad_code,lad_name,ctry_name,rgn_code,rgn_name,ctyua_name,geo_point_2d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) fail(`OpenDataSoft export failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 300)
    fail(`Implausible GB export (${rows?.length ?? 0} rows).`);
  const latestYear = Math.max(...rows.map((r) => Number(r.year ?? 0)));

  console.log("→ Wikidata population by GSS code (P836)…");
  const wd = new Map();
  for (const b of await sparql(
    `SELECT ?gss ?pop WHERE { ?x wdt:P836 ?gss . ?x wdt:P1082 ?pop . FILTER(STRLEN(?gss) = 9) }`,
  )) {
    const gss = String(b.gss?.value ?? "");
    const pop =
      b.pop && Number.isFinite(Number(b.pop.value))
        ? Math.round(Number(b.pop.value))
        : null;
    if (gss && pop && (!wd.has(gss) || pop > wd.get(gss))) wd.set(gss, pop);
  }

  const seen = new Set();
  const units = [];
  for (const m of rows) {
    if (Number(m.year ?? 0) !== latestYear) continue;
    const lad = String(m.lad_code ?? "").trim();
    const name = String(m.lad_name ?? "").trim();
    if (!lad || !name || seen.has(lad)) continue;
    seen.add(lad);
    // Region exists in England only; Scotland/Wales/NI use the country as
    // the first-level grouping.
    const stateName = String(m.rgn_name ?? m.ctry_name ?? "");
    units.push({
      externalId: lad,
      name,
      aliases: [],
      stateCode: String(m.rgn_code ?? m.ctry_name ?? ""),
      stateName,
      districtCode: null,
      districtName: m.ctyua_name ? String(m.ctyua_name) : null,
      population: wd.get(lad) ?? null,
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
      "UK local authority districts: ONS/OS via OpenDataSoft (OGL v3). Population: Wikidata (CC0).",
    units,
  };
}

async function adapterUS() {
  const url = `${ODS}/georef-united-states-of-america-county/exports/json?select=year,ste_code,ste_name,coty_code,coty_name,coty_name_long,coty_type,geo_point_2d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) fail(`OpenDataSoft export failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 3000)
    fail(`Implausible US export (${rows?.length ?? 0} rows).`);
  const latestYear = Math.max(...rows.map((r) => Number(r.year ?? 0)));

  // Area matters here: the spatial assigner derives its match radius from
  // it, and a county without area falls back to a 4 km radius on a
  // ~2,900 km² unit (17% of discoveries went unassigned without this).
  console.log("→ Wikidata population + area by county FIPS (P882)…");
  const wd = new Map();
  for (const b of await sparql(
    `SELECT ?fips ?pop ?area WHERE { ?x wdt:P882 ?fips . OPTIONAL { ?x wdt:P1082 ?pop } OPTIONAL { ?x wdt:P2046 ?area } }`,
  )) {
    const fips = String(b.fips?.value ?? "").padStart(5, "0");
    if (!fips) continue;
    const cur = wd.get(fips) ?? {};
    const pop =
      b.pop && Number.isFinite(Number(b.pop.value))
        ? Math.round(Number(b.pop.value))
        : null;
    const area =
      b.area && Number.isFinite(Number(b.area.value))
        ? Number(b.area.value)
        : null;
    if (pop && (!cur.population || pop > cur.population)) cur.population = pop;
    if (area && !cur.areaKm2) cur.areaKm2 = area;
    wd.set(fips, cur);
  }

  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const seen = new Set();
  const units = [];
  for (const m of rows) {
    if (Number(m.year ?? 0) !== latestYear) continue;
    const fips = String(first(m.coty_code) ?? "").trim();
    // coty_name_long carries the "... County" / "... Parish" suffix, which
    // makes a far better search term than the bare name.
    const name = String(
      first(m.coty_name_long) ?? first(m.coty_name) ?? "",
    ).trim();
    if (!/^\d{5}$/.test(fips) || !name || seen.has(fips)) continue;
    seen.add(fips);
    const shortName = String(first(m.coty_name) ?? "").trim();
    units.push({
      externalId: fips,
      name,
      aliases: shortName && shortName !== name ? [shortName] : [],
      stateCode: String(first(m.ste_code) ?? ""),
      stateName: String(first(m.ste_name) ?? ""),
      districtCode: null,
      districtName: null,
      population: wd.get(fips)?.population ?? null,
      areaKm2: wd.get(fips)?.areaKm2 ?? null,
      centroid:
        m.geo_point_2d && Number.isFinite(Number(m.geo_point_2d.lat))
          ? {
              latitude: Number(m.geo_point_2d.lat),
              longitude: Number(m.geo_point_2d.lon),
            }
          : null,
      settlementClass: first(m.coty_type) ? String(first(m.coty_type)) : null,
    });
  }
  return {
    source: "opendatasoft-georef+wikidata",
    sourceVersion: `georef-${latestYear}+wikidata-${new Date().toISOString().slice(0, 10)}`,
    attribution:
      "US counties: US Census Bureau TIGER via OpenDataSoft (public domain). Population: Wikidata (CC0).",
    units,
  };
}

async function adapterES() {
  const url = `${ODS}/georef-spain-municipio/exports/json?select=year,acom_code,acom_name,prov_code,prov_name,mun_code,mun_name,geo_point_2d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) fail(`OpenDataSoft export failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 7000)
    fail(`Implausible ES export (${rows?.length ?? 0} rows).`);
  const latestYear = Math.max(...rows.map((r) => Number(r.year ?? 0)));

  console.log("→ Wikidata population + area by INE code (P772)…");
  const wd = new Map();
  for (const b of await sparql(
    `SELECT ?ine ?pop ?area WHERE { ?x wdt:P772 ?ine . OPTIONAL { ?x wdt:P1082 ?pop } OPTIONAL { ?x wdt:P2046 ?area } }`,
  )) {
    const ine = String(b.ine?.value ?? "").padStart(5, "0");
    if (!/^\d{5}$/.test(ine)) continue;
    const cur = wd.get(ine) ?? {};
    const pop =
      b.pop && Number.isFinite(Number(b.pop.value))
        ? Math.round(Number(b.pop.value))
        : null;
    const area =
      b.area && Number.isFinite(Number(b.area.value))
        ? Number(b.area.value)
        : null;
    if (pop && (!cur.population || pop > cur.population)) cur.population = pop;
    if (area && !cur.areaKm2) cur.areaKm2 = area;
    wd.set(ine, cur);
  }

  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const seen = new Set();
  const units = [];
  for (const m of rows) {
    if (Number(m.year ?? 0) !== latestYear) continue;
    const ine = String(first(m.mun_code) ?? "").trim();
    const name = String(first(m.mun_name) ?? "").trim();
    if (!/^\d{5}$/.test(ine) || !name || seen.has(ine)) continue;
    seen.add(ine);
    units.push({
      externalId: ine,
      name,
      aliases: [],
      // Autonomous community is the first level; province is the district.
      stateCode: String(first(m.acom_code) ?? ""),
      stateName: String(first(m.acom_name) ?? ""),
      districtCode: first(m.prov_code) ? String(first(m.prov_code)) : null,
      districtName: first(m.prov_name) ? String(first(m.prov_name)) : null,
      population: wd.get(ine)?.population ?? null,
      areaKm2: wd.get(ine)?.areaKm2 ?? null,
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
      "Spanish municipalities: IGN/INE via OpenDataSoft. Population: Wikidata (CC0).",
    units,
  };
}

// France: ~34,900 communes. INSEE code (P374) is the stable identity; note
// Corsica uses 2A/2B in place of a leading department digit, so the code is
// not purely numeric. Region is the chunk level (stateCode) and department
// the district. Population comes from Wikidata best-effort: it only drives
// the paid search tier, and units without it fall to structured-first rural
// coverage, which is correct for a small commune anyway.
const INSEE = /^[0-9][0-9AB][0-9]{3}$/;
async function adapterFR() {
  const url = `${ODS}/georef-france-commune/exports/json?select=year,reg_code,reg_name,dep_code,dep_name,com_code,com_name,geo_point_2d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) fail(`OpenDataSoft export failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 30000)
    fail(`Implausible FR export (${rows?.length ?? 0} rows).`);
  const latestYear = Math.max(...rows.map((r) => Number(r.year ?? 0)));

  console.log("→ Wikidata population + area by INSEE code (P374), best-effort…");
  const wd = new Map();
  try {
    for (const b of await sparql(
      `SELECT ?insee ?pop ?area WHERE { ?x wdt:P374 ?insee . OPTIONAL { ?x wdt:P1082 ?pop } OPTIONAL { ?x wdt:P2046 ?area } }`,
    )) {
      const insee = String(b.insee?.value ?? "").trim().toUpperCase();
      if (!INSEE.test(insee)) continue;
      const cur = wd.get(insee) ?? {};
      const pop =
        b.pop && Number.isFinite(Number(b.pop.value))
          ? Math.round(Number(b.pop.value))
          : null;
      const area =
        b.area && Number.isFinite(Number(b.area.value))
          ? Number(b.area.value)
          : null;
      if (pop && (!cur.population || pop > cur.population)) cur.population = pop;
      if (area && !cur.areaKm2) cur.areaKm2 = area;
      wd.set(insee, cur);
    }
    console.log(`  Wikidata: ${wd.size} communes with attributes.`);
  } catch (e) {
    console.log(`  Wikidata step skipped (${e.message ?? e}); tiering falls back to structured-first rural.`);
  }

  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const seen = new Set();
  const units = [];
  for (const m of rows) {
    if (Number(m.year ?? 0) !== latestYear) continue;
    const insee = String(first(m.com_code) ?? "").trim().toUpperCase();
    const name = String(first(m.com_name) ?? "").trim();
    if (!INSEE.test(insee) || !name || seen.has(insee)) continue;
    seen.add(insee);
    units.push({
      externalId: insee,
      name,
      aliases: [],
      stateCode: String(first(m.reg_code) ?? ""),
      stateName: String(first(m.reg_name) ?? ""),
      districtCode: first(m.dep_code) ? String(first(m.dep_code)) : null,
      districtName: first(m.dep_name) ? String(first(m.dep_name)) : null,
      population: wd.get(insee)?.population ?? null,
      areaKm2: wd.get(insee)?.areaKm2 ?? null,
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
      "French communes: IGN/INSEE via OpenDataSoft. Population: Wikidata (CC0).",
    units,
  };
}

// Japan: no ODS georef dataset exists, so geography is Wikidata-only (like
// Austria). Municipalities = the four administrative types (city/town/village
// + Tokyo's special wards), current only (dissolved ones filtered by P576).
// QID is the stable identity; prefecture/district (P131) drives clustering.
// ~1,770 municipalities. Names come back in Japanese, which is correct for
// the paid search bundles.
async function adapterJP() {
  console.log("→ Wikidata Japanese municipalities (city/town/village/special ward)…");
  const rows = await sparql(`SELECT ?m ?mLabel ?coord ?pop ?area ?pref ?prefLabel WHERE {
    VALUES ?type { wd:Q494721 wd:Q1059478 wd:Q4174776 wd:Q5327704 }
    ?m wdt:P31 ?type .
    ?m wdt:P625 ?coord .
    FILTER NOT EXISTS { ?m wdt:P576 ?dissolved }
    OPTIONAL { ?m wdt:P1082 ?pop }
    OPTIONAL { ?m wdt:P2046 ?area }
    OPTIONAL { ?m wdt:P131 ?pref }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
  }`);
  const byQid = new Map();
  for (const b of rows) {
    const qid = String(b.m?.value ?? "").split("/").pop();
    const name = String(b.mLabel?.value ?? "").trim();
    if (!/^Q\d+$/.test(qid) || !name || name === qid) continue;
    const pop =
      b.pop && Number.isFinite(Number(b.pop.value))
        ? Math.round(Number(b.pop.value))
        : null;
    const prefQid = b.pref?.value ? String(b.pref.value).split("/").pop() : null;
    const cur = byQid.get(qid);
    const next = {
      externalId: qid,
      name,
      aliases: [],
      stateCode: prefQid ?? "JP",
      stateName: b.prefLabel?.value ?? "",
      districtCode: prefQid,
      districtName: b.prefLabel?.value ?? null,
      population: pop,
      areaKm2: b.area ? Number(b.area.value) : null,
      centroid: parsePoint(b.coord?.value),
      settlementClass: null,
    };
    if (!cur || (pop && (!cur.population || pop > cur.population)))
      byQid.set(qid, { ...cur, ...next });
  }
  const units = [...byQid.values()];
  if (units.length < 1500) fail(`Implausible JP dataset (${units.length}).`);
  return {
    source: "wikidata-jp-municipalities",
    sourceVersion: `wikidata-${new Date().toISOString().slice(0, 10)}`,
    attribution: "Japanese municipalities: Wikidata (CC0).",
    units,
  };
}

// Netherlands: ~345 municipalities (gemeenten), coarse like the UK. CBS code
// is the stable identity; province (prov_code) is the state level. Population
// from Wikidata by CBS municipality code (P382).
async function adapterNL() {
  const url = `${ODS}/georef-netherlands-gemeente/exports/json?select=year,prov_code,prov_name,gem_code,gem_name,geo_point_2d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) fail(`OpenDataSoft export failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 250)
    fail(`Implausible NL export (${rows?.length ?? 0} rows).`);
  const latestYear = Math.max(...rows.map((r) => Number(r.year ?? 0)));

  console.log("→ Wikidata population + area by CBS code (P382)…");
  const wd = new Map();
  for (const b of await sparql(
    `SELECT ?code ?pop ?area WHERE { ?x wdt:P382 ?code . OPTIONAL { ?x wdt:P1082 ?pop } OPTIONAL { ?x wdt:P2046 ?area } }`,
  )) {
    const code = String(b.code?.value ?? "").replace(/\D/g, "").padStart(4, "0");
    if (!/^\d{4}$/.test(code)) continue;
    const cur = wd.get(code) ?? {};
    const pop =
      b.pop && Number.isFinite(Number(b.pop.value))
        ? Math.round(Number(b.pop.value))
        : null;
    const area =
      b.area && Number.isFinite(Number(b.area.value))
        ? Number(b.area.value)
        : null;
    if (pop && (!cur.population || pop > cur.population)) cur.population = pop;
    if (area && !cur.areaKm2) cur.areaKm2 = area;
    wd.set(code, cur);
  }

  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const seen = new Set();
  const units = [];
  for (const m of rows) {
    if (Number(m.year ?? 0) !== latestYear) continue;
    const code = String(first(m.gem_code) ?? "")
      .replace(/\D/g, "")
      .padStart(4, "0");
    const name = String(first(m.gem_name) ?? "").trim();
    if (!/^\d{4}$/.test(code) || !name || seen.has(code)) continue;
    seen.add(code);
    units.push({
      externalId: code,
      name,
      aliases: [],
      stateCode: String(first(m.prov_code) ?? ""),
      stateName: String(first(m.prov_name) ?? ""),
      districtCode: null,
      districtName: null,
      population: wd.get(code)?.population ?? null,
      areaKm2: wd.get(code)?.areaKm2 ?? null,
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
      "Dutch municipalities: CBS/Kadaster via OpenDataSoft. Population: Wikidata (CC0).",
    units,
  };
}

// South Korea: no ODS dataset, so Wikidata-only like Japan. Basic municipal
// level (시군구) = cities + counties + autonomous districts of the metros
// (Seoul's 25 districts are their own type). Wikidata typing is fragmented,
// so four explicit types rather than a P279* net (which times out). QID is
// the stable identity; province/metro (P131) drives clustering.
async function adapterKR() {
  console.log("→ Wikidata Korean municipalities (city/county/district)…");
  const rows = await sparql(`SELECT ?m ?mLabel ?coord ?pop ?area ?pref ?prefLabel WHERE {
    VALUES ?type { wd:Q29045252 wd:Q17143371 wd:Q15901936 wd:Q15634846 }
    ?m wdt:P31 ?type .
    ?m wdt:P625 ?coord .
    FILTER NOT EXISTS { ?m wdt:P576 ?dissolved }
    OPTIONAL { ?m wdt:P1082 ?pop }
    OPTIONAL { ?m wdt:P2046 ?area }
    OPTIONAL { ?m wdt:P131 ?pref }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "ko,en". }
  }`);
  const byQid = new Map();
  for (const b of rows) {
    const qid = String(b.m?.value ?? "").split("/").pop();
    const name = String(b.mLabel?.value ?? "").trim();
    if (!/^Q\d+$/.test(qid) || !name || name === qid) continue;
    const pop =
      b.pop && Number.isFinite(Number(b.pop.value))
        ? Math.round(Number(b.pop.value))
        : null;
    const prefQid = b.pref?.value ? String(b.pref.value).split("/").pop() : null;
    const cur = byQid.get(qid);
    const next = {
      externalId: qid,
      name,
      aliases: [],
      stateCode: prefQid ?? "KR",
      stateName: b.prefLabel?.value ?? "",
      districtCode: prefQid,
      districtName: b.prefLabel?.value ?? null,
      population: pop,
      areaKm2: b.area ? Number(b.area.value) : null,
      centroid: parsePoint(b.coord?.value),
      settlementClass: null,
    };
    if (!cur || (pop && (!cur.population || pop > cur.population)))
      byQid.set(qid, { ...cur, ...next });
  }
  const units = [...byQid.values()];
  if (units.length < 150) fail(`Implausible KR dataset (${units.length}).`);
  return {
    source: "wikidata-kr-municipalities",
    sourceVersion: `wikidata-${new Date().toISOString().slice(0, 10)}`,
    attribution: "Korean municipalities: Wikidata (CC0).",
    units,
  };
}

// Italy: ~7,900 comuni. ISTAT code (6 digits) is the stable identity; region
// (reg) is the state level and province (prov) the district. Population from
// Wikidata by ISTAT municipality code (P635).
async function adapterIT() {
  const url = `${ODS}/georef-italy-comune/exports/json?select=year,reg_code,reg_name,prov_code,prov_name,com_code,com_name,geo_point_2d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) fail(`OpenDataSoft export failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 6000)
    fail(`Implausible IT export (${rows?.length ?? 0} rows).`);
  const latestYear = Math.max(...rows.map((r) => Number(r.year ?? 0)));

  console.log("→ Wikidata population + area by ISTAT code (P635)…");
  const wd = new Map();
  for (const b of await sparql(
    `SELECT ?code ?pop ?area WHERE { ?x wdt:P635 ?code . OPTIONAL { ?x wdt:P1082 ?pop } OPTIONAL { ?x wdt:P2046 ?area } }`,
  )) {
    const code = String(b.code?.value ?? "").replace(/\D/g, "").padStart(6, "0");
    if (!/^\d{6}$/.test(code)) continue;
    const cur = wd.get(code) ?? {};
    const pop =
      b.pop && Number.isFinite(Number(b.pop.value))
        ? Math.round(Number(b.pop.value))
        : null;
    const area =
      b.area && Number.isFinite(Number(b.area.value))
        ? Number(b.area.value)
        : null;
    if (pop && (!cur.population || pop > cur.population)) cur.population = pop;
    if (area && !cur.areaKm2) cur.areaKm2 = area;
    wd.set(code, cur);
  }

  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const seen = new Set();
  const units = [];
  for (const m of rows) {
    if (Number(m.year ?? 0) !== latestYear) continue;
    const code = String(first(m.com_code) ?? "")
      .replace(/\D/g, "")
      .padStart(6, "0");
    const name = String(first(m.com_name) ?? "").trim();
    if (!/^\d{6}$/.test(code) || !name || seen.has(code)) continue;
    seen.add(code);
    units.push({
      externalId: code,
      name,
      aliases: [],
      stateCode: String(first(m.reg_code) ?? ""),
      stateName: String(first(m.reg_name) ?? ""),
      districtCode: first(m.prov_code) ? String(first(m.prov_code)) : null,
      districtName: first(m.prov_name) ? String(first(m.prov_name)) : null,
      population: wd.get(code)?.population ?? null,
      areaKm2: wd.get(code)?.areaKm2 ?? null,
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
      "Italian comuni: ISTAT via OpenDataSoft. Population: Wikidata (CC0).",
    units,
  };
}

// Thailand: no ODS dataset, Wikidata-only. The district (อำเภอ / amphoe,
// Q475061) is the coverage unit - the municipal-equivalent level, ~928 of
// them (878 carry coordinates). Province (P131) drives clustering; QID is the
// stable identity; Thai labels feed the Thai query bundles.
async function adapterTH() {
  console.log("→ Wikidata Thai districts (อำเภอ / amphoe)…");
  const rows = await sparql(`SELECT ?m ?mLabel ?coord ?pop ?area ?prov ?provLabel WHERE {
    ?m wdt:P31 wd:Q475061 .
    ?m wdt:P625 ?coord .
    FILTER NOT EXISTS { ?m wdt:P576 ?dissolved }
    OPTIONAL { ?m wdt:P1082 ?pop }
    OPTIONAL { ?m wdt:P2046 ?area }
    OPTIONAL { ?m wdt:P131 ?prov }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "th,en". }
  }`);
  const byQid = new Map();
  for (const b of rows) {
    const qid = String(b.m?.value ?? "").split("/").pop();
    const name = String(b.mLabel?.value ?? "").trim();
    if (!/^Q\d+$/.test(qid) || !name || name === qid) continue;
    const pop =
      b.pop && Number.isFinite(Number(b.pop.value))
        ? Math.round(Number(b.pop.value))
        : null;
    const provQid = b.prov?.value ? String(b.prov.value).split("/").pop() : null;
    const cur = byQid.get(qid);
    const next = {
      externalId: qid,
      name,
      aliases: [],
      stateCode: provQid ?? "TH",
      stateName: b.provLabel?.value ?? "",
      districtCode: provQid,
      districtName: b.provLabel?.value ?? null,
      population: pop,
      areaKm2: b.area ? Number(b.area.value) : null,
      centroid: parsePoint(b.coord?.value),
      settlementClass: null,
    };
    if (!cur || (pop && (!cur.population || pop > cur.population)))
      byQid.set(qid, { ...cur, ...next });
  }
  const units = [...byQid.values()];
  if (units.length < 600) fail(`Implausible TH dataset (${units.length}).`);
  return {
    source: "wikidata-th-amphoe",
    sourceVersion: `wikidata-${new Date().toISOString().slice(0, 10)}`,
    attribution: "Thai districts: Wikidata (CC0).",
    units,
  };
}

// Australia: ~537 Local Government Areas (LGAs). ASGS LGA code is the stable
// identity; state (ste) is the region. Area is computed from the LGA polygon
// so the spatial-assignment radius fits both tiny inner-city councils and huge
// outback LGAs (a fixed default would strand studios in big urban councils
// like Brisbane). Population is best-effort from Wikidata by LGA name+state.
function ringAreaKm2(ring) {
  const R = 6371;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    sum +=
      ((lng2 - lng1) * Math.PI) / 180 *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((sum * R * R) / 2);
}
function geomAreaKm2(geom) {
  if (!geom || !geom.coordinates) return null;
  try {
    if (geom.type === "Polygon") return ringAreaKm2(geom.coordinates[0]);
    if (geom.type === "MultiPolygon")
      return geom.coordinates.reduce((a, poly) => a + ringAreaKm2(poly[0]), 0);
  } catch {
    return null;
  }
  return null;
}
async function adapterAU() {
  const url = `${ODS}/georef-australia-local-government-area/exports/json?select=year,ste_code,ste_name,lga_code,lga_name,geo_point_2d,geo_shape`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) fail(`OpenDataSoft export failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 400)
    fail(`Implausible AU export (${rows?.length ?? 0} rows).`);
  const latestYear = Math.max(...rows.map((r) => Number(r.year ?? 0)));

  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const seen = new Set();
  const units = [];
  for (const m of rows) {
    if (Number(m.year ?? 0) !== latestYear) continue;
    const code = String(first(m.lga_code) ?? "").trim();
    const name = String(first(m.lga_name) ?? "").trim();
    if (!/^\d{3,6}$/.test(code) || !name || seen.has(code)) continue;
    seen.add(code);
    const area = geomAreaKm2(m.geo_shape?.geometry ?? m.geo_shape);
    units.push({
      externalId: code,
      name,
      aliases: [],
      stateCode: String(first(m.ste_code) ?? ""),
      stateName: String(first(m.ste_name) ?? ""),
      districtCode: null,
      districtName: null,
      population: null,
      areaKm2: area && area > 0 && area < 2_000_000 ? Math.round(area) : null,
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
    source: "opendatasoft-georef",
    sourceVersion: `georef-${latestYear}`,
    attribution: "Australian LGAs: ABS ASGS via OpenDataSoft.",
    units,
  };
}

const ADAPTERS = {
  DE: adapterDE,
  AT: adapterAT,
  CH: adapterCH,
  GB: adapterGB,
  US: adapterUS,
  ES: adapterES,
  FR: adapterFR,
  JP: adapterJP,
  NL: adapterNL,
  KR: adapterKR,
  IT: adapterIT,
  TH: adapterTH,
  AU: adapterAU,
};

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

    // Large countries import state by state: it keeps every request inside
    // the payload cap, and rural clusters are computed per state anyway
    // (they never cross a state line), so chunking changes nothing about
    // the result.
    const CHUNK_ABOVE = 12000;
    const groups =
      dataset.units.length > CHUNK_ABOVE
        ? [
            ...dataset.units
              .reduce((m, u) => {
                const k = u.stateCode || "?";
                m.set(k, [...(m.get(k) ?? []), u]);
                return m;
              }, new Map())
              .entries(),
          ].map(([k, units]) => ({ label: `state ${k}`, units }))
        : [{ label: "all", units: dataset.units }];

    console.log(
      `→ importing into ${base}${groups.length > 1 ? ` in ${groups.length} state chunks` : ""}…`,
    );
    let unitCount = 0;
    let clusterCount = 0;
    for (const group of groups) {
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
          units: group.units,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok)
        fail(`Import failed (${group.label}) HTTP ${res.status}: ${payload?.error}`);
      unitCount += payload.unitCount ?? 0;
      clusterCount += payload.clusterCount ?? 0;
      if (groups.length > 1)
        console.log(
          `  ${group.label}: ${payload.unitCount} units, ${payload.clusterCount} clusters`,
        );
    }
    console.log(
      `✓ imported: ${unitCount} municipalities, ${clusterCount} rural clusters.`,
    );
  }
}

main().catch((e) => fail(e.message ?? String(e)));
