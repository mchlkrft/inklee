#!/usr/bin/env node
/**
 * seed-country: CLI trigger for the automated seed import lane.
 *
 *   node scripts/seed-country.cjs --country=DE --area=<uuid> \
 *     --mode=dry-run --file=path/to/candidates.json \
 *     [--max=150] [--label="berlin batch 1"] [--base=https://inklee.app]
 *
 * Posts the batch to /api/admin/seed-country (CRON_SECRET bearer auth).
 * The server refuses unless AUTOMATED_SEED_IMPORT_ENABLED is set there.
 * dry-run evaluates and plans without importing; import executes the plan
 * behind the safety gates. The same input never imports twice (checksum).
 *
 * CRON_SECRET comes from the environment, or from apps/web/.env.local as a
 * fallback for local runs.
 */
const fs = require("node:fs");
const path = require("node:path");

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function readSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  const envFile = path.join(__dirname, "..", "apps", "web", ".env.local");
  if (fs.existsSync(envFile)) {
    const line = fs
      .readFileSync(envFile, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("CRON_SECRET="));
    if (line) return line.slice("CRON_SECRET=".length).trim().replace(/^"|"$/g, "");
  }
  return null;
}

async function main() {
  const country = arg("country");
  const area = arg("area");
  const modeArg = arg("mode", "dry-run");
  const file = arg("file");
  const max = arg("max");
  const label = arg("label") ?? (file ? path.basename(file) : null);
  const base = (arg("base", "http://localhost:3000") || "").replace(/\/+$/, "");

  if (!country) fail("Missing --country=XX (ISO code with a country config).");
  if (!area) fail("Missing --area=<seed area uuid> (create one in /admin/map/seeding).");
  if (!file) fail("Missing --file=<candidates JSON> (overture-tattoo-extract output).");
  if (!["dry-run", "import"].includes(modeArg))
    fail("--mode must be dry-run or import.");
  if (!fs.existsSync(file)) fail(`File not found: ${file}`);

  const secret = readSecret();
  if (!secret) fail("CRON_SECRET not found (env or apps/web/.env.local).");

  const raw = fs.readFileSync(file, "utf8");
  const body = {
    countryCode: country,
    areaId: area,
    mode: modeArg === "dry-run" ? "dry_run" : "import",
    label,
    candidates: raw,
  };
  if (max) body.maxImport = Number(max);

  console.log(`→ ${modeArg} ${country} against ${base} (${label ?? "unlabeled"})`);
  const res = await fetch(`${base}/api/admin/seed-country`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    fail(
      `HTTP ${res.status}: ${payload?.error ?? "no detail"}${payload?.runId ? ` (run ${payload.runId})` : ""}`,
    );
  }
  const s = payload.summary;
  console.log(`✓ run ${s.runId} finished: ${s.status}`);
  console.log(`  total ${s.totalCount}`);
  for (const [decision, count] of Object.entries(s.counts)) {
    if (count > 0) console.log(`  ${decision}: ${count}`);
  }
  if (s.mode === "import")
    console.log(`  created ${s.createdCount}, skipped ${s.skippedCount}`);
  if (s.gateFailures?.length)
    console.log(`  gates: ${s.gateFailures.join(" | ")}`);
  if (s.verification && typeof s.verification.expected === "number")
    console.log(
      `  verified ${s.verification.found}/${s.verification.expected}${s.verification.missing?.length ? ` MISSING ${s.verification.missing.length}` : ""}`,
    );
}

main().catch((err) => fail(err.message ?? String(err)));
