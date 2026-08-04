// Generic single-key activation-approval recorder. Use this to close the
// human-owned gate keys once their owner has signed off (counsel / accountant /
// founder). Edit CONFIG, dry-run, then --apply. Recording a key opens NOTHING on
// its own: a live charge needs the FULL b2b (or b2c) key set + a live Price +
// live mode.
//
//   node scripts/billing/record-approval.cjs            # DRY RUN
//   node scripts/billing/record-approval.cjs --apply    # write
//
// Refuses to --apply unless APPROVED is true and approved_by + evidence_ref are
// non-empty. Version-bound keys (terms_approved / privacy_notice_approved /
// tax_policy_approved / consumer_classification_approved /
// consumer_withdrawal_copy_approved) MUST set bound_artifact to the CURRENT
// artifact version or the gate re-closes itself. privacy_notice_approved is
// version-bound but NOT in REQUIRED_APPROVAL_KEYS (config.ts) — binding is not
// gating; see artifacts.ts.
const CONFIG = {
  approval_key: "terms_approved", // the gate key to record
  approval_group: "b2b", // 'technical' | 'b2b' | 'b2c'
  approved_by: "", // e.g. "Legal counsel (name, firm)" / "Accountant (name)" / "Management board (M. Kraeft)"
  evidence_ref: "", // signed email / doc reference / memo id
  // For version-bound keys, set this to the CURRENT version the owner approved.
  // terms_approved            -> the Terms versionHash (see the sign-off package)
  // privacy_notice_approved   -> the privacy notice versionHash
  // tax_policy_approved       -> the tax_policies version_label
  // consumer_classification_approved -> the service_classification version_label
  // consumer_withdrawal_copy_approved -> the withdrawal_policy version_label
  // Everything else: leave null.
  bound_artifact: null,
  notes: "",

  APPROVED: false, // set true ONLY after the named owner has signed off
};

// Keys whose approval MUST be version-bound (the artifacts resolver re-closes an
// approval whose bound_artifact no longer matches the current version).
const VERSION_BOUND = new Set([
  "terms_approved",
  "privacy_notice_approved",
  "tax_policy_approved",
  "consumer_classification_approved",
  "consumer_withdrawal_copy_approved",
]);

const { requireFromRepo, requireDatabaseUrl, resolveEnvValue } = require("../lib/repo-root.cjs");
const postgres = requireFromRepo("postgres");
const APPLY = process.argv.includes("--apply");
const url = requireDatabaseUrl();
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 8 });

// Launch keys must not be recorded while marketed capabilities are still parked.
// Selling three benefits that do not enforce is the exact defect this check exists
// to prevent (see plus-remaining-work-plan.md Stage 5: "Make unparking a hard
// precondition on recording the launch key").
const LAUNCH_KEYS = new Set([
  "consumer_sales_launch_approved",
  "business_sales_launch_approved",
]);
const MARKETED_CAPS = ["branding", "custom_templates", "entitlement_caps", "analytics"];

function checkUnparking() {
  if (!LAUNCH_KEYS.has(CONFIG.approval_key)) return;
  let raw;
  try {
    const resolved = resolveEnvValue("DISABLED_CAPABILITIES");
    raw = resolved.value || "";
  } catch {
    console.log("WARNING: DISABLED_CAPABILITIES not readable; skipping unpark check.");
    return;
  }
  const parked = new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const stillParked = MARKETED_CAPS.filter((k) => parked.has(k));
  if (stillParked.length > 0) {
    console.error(
      `\nREFUSING: ${CONFIG.approval_key} requires all marketed capabilities to be unparked.` +
      `\n  Still parked: ${stillParked.join(", ")}` +
      `\n  Unpark them in DISABLED_CAPABILITIES before recording the launch key.`
    );
    process.exit(3);
  }
  console.log("  unpark check: all marketed capabilities unparked");
}

(async () => {
  const now = new Date().toISOString();
  const approvedBy = String(CONFIG.approved_by || "").trim();
  const evidence = String(CONFIG.evidence_ref || "").trim();
  const bound = CONFIG.bound_artifact ? String(CONFIG.bound_artifact).trim() : null;

  console.log(`=== record ${CONFIG.approval_key} (${CONFIG.approval_group}) ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`);
  console.log("approved_by:", approvedBy || "(unset)");
  console.log("evidence_ref:", evidence || "(unset)");
  console.log("bound_artifact:", bound || "(none)");
  if (VERSION_BOUND.has(CONFIG.approval_key) && !bound) {
    console.log("WARNING: this key is version-bound but bound_artifact is empty; the gate will re-close.");
  }

  if (!APPLY) {
    checkUnparking();
    console.log("\nDRY RUN. Fill CONFIG (APPROVED=true + approved_by + evidence_ref [+ bound_artifact]) then --apply.");
    await sql.end();
    return;
  }
  if (
    CONFIG.APPROVED !== true ||
    !approvedBy ||
    !evidence ||
    !["technical", "b2b", "b2c"].includes(CONFIG.approval_group)
  ) {
    console.error("\nREFUSING: APPROVED must be true and approved_by + evidence_ref non-empty and a valid group.");
    process.exit(2);
  }
  checkUnparking();

  await sql`
    insert into billing_activation_approvals
      (approval_key, approval_group, approved, approved_by, approved_at, evidence_ref, bound_artifact, notes, updated_at)
    values
      (${CONFIG.approval_key}, ${CONFIG.approval_group}, true, ${approvedBy}, ${now},
       ${evidence}, ${bound}, ${CONFIG.notes || null}, ${now})
    on conflict (approval_key) do update set
      approval_group = ${CONFIG.approval_group}, approved = true, approved_by = ${approvedBy},
      approved_at = ${now}, evidence_ref = ${evidence}, bound_artifact = ${bound},
      notes = ${CONFIG.notes || null}, updated_at = ${now}`;

  console.log(`\nAPPLIED: ${CONFIG.approval_key} recorded. Live billing stays off until the full group + a live Price + live mode are in place.`);
  await sql.end();
})().catch(async (e) => {
  console.error("error:", e.message);
  try { await sql.end(); } catch {}
  process.exit(1);
});
