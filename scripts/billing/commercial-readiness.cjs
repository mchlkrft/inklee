// Pre-flight check for Plus commercial launch readiness. Reads LIVE production
// state (DISABLED_CAPABILITIES + database) and reports what blocks the launch.
//
// The capability registry (plus-capability-registry.ts) is the DEFINITION of
// what Plus sells. This script checks whether production REALITY matches.
//
//   node scripts/billing/commercial-readiness.cjs
//
// Exit 0 = ready, exit 1 = blockers found. Expected to FAIL until every
// commercial closure item is done (Stage 5 in plus-remaining-work-plan.md).

"use strict";

const { resolveEnvValue, requireDatabaseUrl, requireFromRepo } = require("../lib/repo-root.cjs");

// ── Marketed Plus benefits (from /pricing + Terms section 11) ───────────────
// A marketed benefit that is still parked in DISABLED_CAPABILITIES is a
// customer-visible lie: the /pricing page claims it, the server refuses it.

const MARKETED_CAPABILITIES = [
  { key: "branding", label: "Branding removal", shape: "grant" },
  { key: "custom_templates", label: "Custom email templates", shape: "restriction" },
  { key: "entitlement_caps", label: "Higher limits", shape: "restriction" },
  { key: "analytics", label: "Advanced analytics", shape: "restriction" },
];

// Capabilities that must NOT be parked at launch (superset of marketed: includes
// capabilities that enforce correctly but breaking them by parking would leave
// Plus with no differentiating value in that area).
const MUST_UNPARK_AT_LAUNCH = [
  ...MARKETED_CAPABILITIES.map((m) => m.key),
  // Not marketed yet but enforcement is built and a parked state would make the
  // entitlement grant produce zero observable effect:
  // "form_conditional", "form_custom", "large_projects",
  // "goods_discounts", "goods_scheduling", "goods_collections",
  // (These are GRANT-shaped: parked = false for everyone, which is their
  // pre-enforcement state anyway. Unparking them is a no-op until a Plus
  // artist exists, so they are not commercial blockers.)
];

// ── Checks ──────────────────────────────────────────────────────────────────

const findings = [];
let pass = 0;

function check(ok, label, detail) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    findings.push({ label, detail });
    console.log(`  FAIL  ${label}`);
    if (detail) console.log(`        ${detail}`);
  }
}

(async () => {
  console.log("\n=== commercial-readiness ===\n");

  // ── 1. DISABLED_CAPABILITIES ──────────────────────────────────────────────
  console.log("[1] DISABLED_CAPABILITIES\n");

  let disabledSet;
  try {
    const resolved = resolveEnvValue("DISABLED_CAPABILITIES");
    const raw = resolved.value || "";
    disabledSet = new Set(
      raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    );
    console.log(`  source: ${resolved.source || "(empty)"}`);
    console.log(`  parked: ${disabledSet.size === 0 ? "(none)" : [...disabledSet].join(", ")}\n`);
  } catch {
    disabledSet = null;
    console.log("  WARN  DISABLED_CAPABILITIES not available; skipping park checks\n");
  }

  if (disabledSet) {
    for (const m of MARKETED_CAPABILITIES) {
      const parked = disabledSet.has(m.key);
      check(
        !parked,
        `${m.label} (${m.key}) is not parked`,
        parked
          ? `Marketed on /pricing but parked in DISABLED_CAPABILITIES. ${m.shape === "restriction" ? "Restriction shape: parked = permissive (everyone can access), which is the WRONG direction for launch." : "Grant shape: parked = nobody gets it."}`
          : null,
      );
    }
  }

  // ── 2. Database state ─────────────────────────────────────────────────────
  console.log("\n[2] Database launch state\n");

  const url = requireDatabaseUrl({ announce: false });
  const postgres = requireFromRepo("postgres");
  const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 8 });

  try {
    // 2a. Launch keys
    const launchKeys = await sql`
      select approval_key, approved
      from billing_activation_approvals
      where approval_key in ('consumer_sales_launch_approved', 'business_sales_launch_approved')`;

    const consumerKey = launchKeys.find((r) => r.approval_key === "consumer_sales_launch_approved");
    const businessKey = launchKeys.find((r) => r.approval_key === "business_sales_launch_approved");

    check(
      consumerKey && consumerKey.approved,
      "consumer_sales_launch_approved is recorded and approved",
      !consumerKey
        ? "Key not recorded. Record with: node scripts/billing/record-approval.cjs"
        : "Key recorded but approved=false",
    );

    check(
      businessKey && businessKey.approved,
      "business_sales_launch_approved is recorded and approved",
      !businessKey
        ? "Key not recorded"
        : "Key recorded but approved=false",
    );

    // 2b. Founder offer policy
    const [{ count: offerRows }] = await sql`
      select count(*)::int as count from founder_offer_policy`;

    check(
      offerRows > 0,
      `founder_offer_policy has ${offerRows} row(s) (offer is ${offerRows > 0 ? "open" : "closed"})`,
      offerRows === 0
        ? "The founder offer is closed by default (0 rows). Insert the policy row to open it."
        : null,
    );

    // 2c. Active subscribers
    const [{ count: activeSubs }] = await sql`
      select count(*)::int as count from billing_subscriptions
      where status in ('active', 'trialing')`;

    console.log(`\n  INFO  Active Plus subscribers: ${activeSubs}`);

    // 2d. Entitlement caps parked status check: are any artists currently
    // over the Free cap? If entitlement_caps is about to be unparked, this
    // matters for the user experience.
    const capChecks = [
      { key: "custom_fields", table: "booking_form_fields", countCol: "artist_id" },
    ];

    for (const c of capChecks) {
      try {
        const overCap = await sql`
          select count(distinct artist_id)::int as count
          from ${sql(c.table)}
          group by artist_id
          having count(*) > 3`;
        if (overCap.length > 0) {
          console.log(`  WARN  ${overCap.length} artist(s) exceed the Free ${c.key} cap of 3 (legacy_free_v1 should cover them)`);
        }
      } catch {
        // Table may not exist in test environments
      }
    }

    // 2e. Consent evidence binding (C5): check that recent consent rows have
    // hashes (the fix from this session)
    const [{ count: unhashed }] = await sql`
      select count(*)::int as count
      from billing_consent_records
      where consent_hash is null`;

    if (unhashed > 0) {
      console.log(`  WARN  ${unhashed} consent record(s) have no consent_hash (pre-C5 rows; not a blocker for launch)`);
    }
  } finally {
    await sql.end();
  }

  // ── 3. Source-level checks ─────────────────────────────────────────────────
  console.log("\n[3] Source-level alignment\n");

  // 3a. Fee schedule version: v1 is the pre-launch state (flat 3%). v2 must
  // be activated deliberately after accountant sign-off (Stage 4). Premature
  // v2 activation would charge the wrong rate, an unrecoverable money error.
  const fs = require("node:fs");
  const { repoPath } = require("../lib/repo-root.cjs");
  try {
    const feeSource = fs.readFileSync(
      repoPath("packages", "shared", "src", "fee-schedule.ts"),
      "utf8",
    );
    const m = feeSource.match(/ACTIVE_FEE_SCHEDULE_VERSION\s*=\s*(\S+)/);
    if (m) {
      const isV1 = m[1].includes("V1") || m[1].includes("v1");
      check(
        isV1,
        `ACTIVE_FEE_SCHEDULE_VERSION points at V1 (${m[1].replace(/[;,]/g, "")})`,
        !isV1 ? "V2 appears to be activated. This must only happen after accountant sign-off (Stage 4)." : null,
      );
    }
  } catch {
    console.log("  SKIP  fee-schedule.ts not readable");
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = pass + findings.length;
  console.log(`\n=== ${findings.length === 0 ? "READY" : "NOT READY"} (${pass}/${total} passed) ===\n`);

  if (findings.length > 0) {
    console.log("Blockers:");
    for (const f of findings) {
      console.log(`  - ${f.label}`);
      if (f.detail) console.log(`    ${f.detail}`);
    }
    console.log("");
    process.exit(1);
  }
})().catch((e) => {
  console.error("error:", e.message);
  process.exit(1);
});
