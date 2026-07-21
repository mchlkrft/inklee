#!/usr/bin/env node
/**
 * ghost-detect: flag likely-closed seed listings into the map_reports review
 * queue. Signal = the studio's own website domain no longer RESOLVES (DNS
 * ENOTFOUND after a retry), which strongly indicates the business let its
 * domain lapse, i.e. it closed. Deliberately conservative:
 *
 *   - only DNS-dead domains are flagged, never HTTP errors (403/404/500 can be
 *     bot-blocking or a temporary outage, not a closure);
 *   - it FLAGS for human review (reason 'closed', reporter null = automated),
 *     it never deletes or hides anything;
 *   - it skips any listing that already has an open report;
 *   - dry run by default; --apply writes the flags.
 *
 * Only ~19% of seed entries have a website, so this covers that subset. The
 * websiteless majority needs the web-search path (a separate pass).
 *
 *   node scripts/ghost-detect.cjs [--limit 2000] [--concurrency 12] [--apply]
 *
 * Auth: SUPABASE_ACCESS_TOKEN in env (Supabase management API).
 */
const PROJECT = "llmzzsmppaqwecbrowlp";
const API = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && !String(process.argv[idx + 1] ?? "").startsWith("--"))
    return process.argv[idx + 1];
  return fallback;
}
const APPLY = process.argv.includes("--apply");
const LIMIT = Number(arg("limit", "2000"));
const CONCURRENCY = Number(arg("concurrency", "12"));

function fail(m) {
  console.error(`✗ ${m}`);
  process.exit(1);
}

async function sql(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) fail("SUPABASE_ACCESS_TOKEN not set.");
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) fail(`Management API ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

const delay = (ms) =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

// One website check. Returns "dead" only for a domain that does not resolve
// (retried once to shrug off a transient DNS blip); everything else is "ok".
async function checkSite(url) {
  let parsed;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return "skip";
  } catch {
    return "skip";
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    try {
      await fetch(parsed.href, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; InkleeGhostCheck/1.0; +https://inklee.app)",
        },
      });
      clearTimeout(t);
      return "ok"; // any HTTP response means the domain is live
    } catch (e) {
      clearTimeout(t);
      const code = e?.cause?.code ?? e?.code ?? "";
      if (code === "ENOTFOUND") {
        if (attempt === 0) {
          await delay(1500);
          continue; // retry once for a transient DNS miss
        }
        return "dead";
      }
      return "ok"; // timeouts, resets, TLS, HTTP errors: not a clear closure
    }
  }
  return "ok";
}

async function mapPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run),
  );
  return out;
}

async function main() {
  console.log(
    `ghost-detect ${APPLY ? "APPLY" : "DRY RUN"} — up to ${LIMIT} sites, concurrency ${CONCURRENCY}`,
  );
  const rows = await sql(
    `select l.id, l.name, l.website_url
     from map_locations l
     where l.is_seed = true and l.claim_status <> 'claimed'
       and l.moderation_status = 'approved'
       and l.website_url is not null and l.website_url <> ''
       and not exists (
         select 1 from map_reports r
         where r.target_map_location_id = l.id and r.status = 'new'
       )
     order by l.id
     limit ${Math.max(1, LIMIT)}`,
  );
  console.log(`→ checking ${rows.length} websites…`);

  let dead = 0;
  let ok = 0;
  let skipped = 0;
  const flags = [];
  await mapPool(
    rows,
    async (r) => {
      const verdict = await checkSite(r.website_url);
      if (verdict === "dead") {
        dead++;
        flags.push(r);
        console.log(`  DEAD  ${r.name} — ${r.website_url}`);
      } else if (verdict === "skip") skipped++;
      else ok++;
    },
    CONCURRENCY,
  );

  console.log(
    `\n${rows.length} checked: ${ok} live, ${dead} dead-domain, ${skipped} unparseable.`,
  );

  if (!APPLY) {
    console.log(
      `DRY RUN: ${dead} would be flagged 'closed' for admin review. Re-run with --apply to write them.`,
    );
    return;
  }
  if (flags.length === 0) {
    console.log("Nothing to flag.");
    return;
  }
  for (let i = 0; i < flags.length; i += 200) {
    const chunk = flags.slice(i, i + 200);
    const values = chunk
      .map(
        (r) =>
          `(null, 'location', '${r.id}', 'closed', ${sqlStr(
            `Automated ghost check: website ${r.website_url} no longer resolves (DNS). Possible closure; verify before removing.`,
          )}, 'new')`,
      )
      .join(", ");
    await sql(
      `insert into map_reports (reporter_user_id, target_type, target_map_location_id, reason, detail, status) values ${values}`,
    );
  }
  console.log(`✓ flagged ${flags.length} listings 'closed' for admin review.`);
}

main().catch((e) => fail(e.message ?? String(e)));
