#!/usr/bin/env node
/**
 * seed-coverage: CLI for the country coverage orchestrator.
 *
 *   node scripts/seed-coverage.cjs plan --country=DE            # planning dry run (projection only)
 *   node scripts/seed-coverage.cjs run --country=DE --scope=pilot --mode=dry-run
 *   node scripts/seed-coverage.cjs run --country=DE --scope=pilot --mode=import
 *   node scripts/seed-coverage.cjs run --country=DE --scope=nationwide --mode=import
 *   node scripts/seed-coverage.cjs ingest --run=<id> --provider=overture|osm --file=x.json [--label=...]
 *   node scripts/seed-coverage.cjs tick                          # execute one worker tick now
 *   node scripts/seed-coverage.cjs resume --run=<id>
 *   node scripts/seed-coverage.cjs pause --run=<id>
 *   node scripts/seed-coverage.cjs cancel --run=<id>
 *   node scripts/seed-coverage.cjs retry --run=<id>              # requeue failed/partial/blocked units
 *   node scripts/seed-coverage.cjs gaps --run=<id>               # status + gap list
 *   node scripts/seed-coverage.cjs status [--country=DE]
 *
 * All commands post to /api/admin/seed-coverage (CRON_SECRET bearer auth);
 * the server additionally refuses unless AUTOMATED_SEED_IMPORT_ENABLED is
 * set. Geography import: scripts/germany-geo-import.cjs --post.
 * mode dry-run = discovery without profile writes; import = full pipeline.
 */
const fs = require("node:fs");
const path = require("node:path");

const command = process.argv[2];

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
function fail(m) {
  console.error(`✗ ${m}`);
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
    if (line)
      return line.slice("CRON_SECRET=".length).trim().replace(/^"|"$/g, "");
  }
  return null;
}

async function post(body) {
  const base = (arg("base", "http://localhost:3000") || "").replace(/\/+$/, "");
  const secret = readSecret();
  if (!secret) fail("CRON_SECRET not found (env or apps/web/.env.local).");
  const res = await fetch(`${base}/api/admin/seed-coverage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) fail(`HTTP ${res.status}: ${payload?.error ?? "no detail"}`);
  return payload;
}

async function main() {
  const country = (arg("country", "DE") || "DE").toUpperCase();

  if (command === "plan") {
    const r = await post({
      action: "create-run",
      countryCode: country,
      scope: arg("scope", "nationwide"),
      mode: "planning",
    });
    console.log(`✓ planning run ${r.runId}`);
    console.log(JSON.stringify(r.projection, null, 2));
    return;
  }

  if (command === "run") {
    const modeArg = arg("mode", "dry-run");
    if (!["dry-run", "import"].includes(modeArg))
      fail("--mode must be dry-run or import.");
    const scope = arg("scope", "pilot");
    const r = await post({
      action: "create-run",
      countryCode: country,
      scope,
      mode: modeArg === "import" ? "import" : "discovery",
      regionFilter: arg("region"),
      autoAdvance: process.argv.includes("--auto-advance"),
    });
    console.log(`✓ ${scope} ${modeArg} run created: ${r.runId}`);
    if (r.projection) console.log(JSON.stringify(r.projection, null, 2));
    console.log(
      "Next: ingest structured extractions (overture/osm), then let the cron worker progress it, or force ticks with: node scripts/seed-coverage.cjs tick",
    );
    return;
  }

  if (command === "ingest") {
    const runId = arg("run");
    const provider = arg("provider");
    const file = arg("file");
    if (!runId || !provider || !file)
      fail("ingest needs --run, --provider=overture|osm, --file.");
    if (!fs.existsSync(file)) fail(`File not found: ${file}`);
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    let rows = Array.isArray(raw) ? raw : (raw.rows ?? raw.candidates ?? []);
    if (provider === "overture") {
      // The overture-tattoo-extract format maps 1:1 onto discoveries.
      rows = rows
        .filter((r) => !r.country || String(r.country).toUpperCase() === country)
        .map((r) => ({
          provider: "overture",
          providerResultId: r.id,
          name: r.name,
          category: r.category ?? null,
          latitude: r.latitude,
          longitude: r.longitude,
          city: r.city ?? null,
          address: r.address ?? null,
          postalCode: r.postalCode ?? null,
          phone: r.phone ?? null,
          openingHours: r.openingHours ?? null,
          websiteUrl: r.websiteUrl ?? null,
          socialUrl: r.socialUrl ?? null,
          sourceUrl: r.websiteUrl ?? null,
          extra: r.extra ?? null,
        }));
    }
    console.log(`→ ingesting ${rows.length} ${provider} rows…`);
    let inserted = 0;
    let assigned = 0;
    for (let i = 0; i < rows.length; i += 4000) {
      const r = await post({
        action: "ingest",
        runId,
        provider,
        label: arg("label", path.basename(file)),
        rows: rows.slice(i, i + 4000),
      });
      inserted += r.inserted ?? 0;
      assigned += r.assigned ?? 0;
    }
    console.log(`✓ ingested ${inserted} unique discoveries (${assigned} spatially assigned).`);
    return;
  }

  if (command === "tick") {
    const r = await post({ action: "tick" });
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (["pause", "resume", "cancel", "retry"].includes(command)) {
    const runId = arg("run");
    if (!runId) fail(`${command} needs --run=<id>.`);
    const r = await post({ action: command, runId });
    console.log(r.error ? `✗ ${r.error}` : `✓ ${command} ok ${r.requeued !== undefined ? `(${r.requeued} requeued)` : ""}`);
    return;
  }

  if (command === "gaps" || command === "status") {
    const runId = arg("run");
    const r = await post({
      action: "status",
      countryCode: country,
      runId: runId ?? undefined,
      statusFilter: command === "gaps" ? undefined : arg("filter"),
    });
    if (runId && r.run) {
      const run = r.run;
      console.log(
        `${run.id} ${run.countryCode} ${run.scope}/${run.mode} → ${run.status} (policy ${run.policyVersion}, dataset ${run.datasetVersion})`,
      );
      if (run.counters) console.log(JSON.stringify(run.counters, null, 2));
      if (command === "gaps") {
        if (run.gaps?.total !== undefined) {
          console.log(
            `Gaps (${run.gaps.total} total${run.gaps.truncated ? `, first ${run.gaps.list.length} listed` : ""}):`,
          );
          for (const g of run.gaps.list.slice(0, 200))
            console.log(`  ${g.externalId} ${g.name} → ${g.status}`);
        } else {
          const gaps = (r.tasks ?? []).filter(
            (t) => !["complete", "complete_no_results"].includes(t.status),
          );
          console.log(`Open units so far (${gaps.length} in the first 1000):`);
          for (const g of gaps.slice(0, 100))
            console.log(
              `  ${g.unitExternalId} ${g.unitName} [${g.strategy}] → ${g.status}${g.errorClass ? ` (${g.errorClass})` : ""}`,
            );
        }
      }
      return;
    }
    for (const run of r.runs ?? [])
      console.log(
        `${run.id} ${run.countryCode} ${run.scope}/${run.mode} → ${run.status} (${run.createdAt})`,
      );
    return;
  }

  fail(
    "Commands: plan | run | ingest | tick | pause | resume | cancel | retry | gaps | status",
  );
}

main().catch((e) => fail(e.message ?? String(e)));
