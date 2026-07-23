// Record the MANAGEMENT-BOARD-approved tax posture (BM-2.0). Writes the records
// the `tax_policy_approved` activation gate needs, in one transaction:
//   1. a `tax_policies` row = the posture (distinct treatment PER customer class)
//      + the management-board approval (the board holds legal responsibility for
//      the posture, so it is the approving authority; professional review is
//      OPTIONAL evidence, not represented as legally mandatory).
//   2. a `billing_activation_approvals` row = tax_policy_approved -> true, BOUND
//      to the posture version (so a posture change re-closes the gate).
//   3. seeds `tax_thresholds` (the EE registration / EU B2C OSS / Union SME
//      thresholds) if not present, for ongoing threshold tracking.
//
//   node scripts/billing/record-tax-approval.cjs            # DRY RUN
//   node scripts/billing/record-tax-approval.cjs --apply    # write
//
// Refuses to --apply unless MANAGEMENT_BOARD_APPROVED is true and approvedBy +
// approvalBasis + at least one evidenceReference are set. Idempotent: re-running
// --apply supersedes the prior current posture (old rows stay as the audit
// trail with is_current=false).
//
// ─────────────────────────────────────────────────────────────────────────────
// FILL THIS IN, THEN RUN. Each treatment is a SPECIFIC legal basis (never a
// generic "out of scope"). These are a STARTING POINT for an unregistered
// Estonian small business; the management board confirms or replaces each line.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  version_label: "ee-unregistered-v1", // stable posture identifier (the gate binds to this)
  posture_version: "ee-unregistered-v1",

  seller_country: "EE",
  seller_vat_registered: false, // board confirms (below threshold today)
  seller_vat_number: null,
  oss_registered: false,
  calc_provider: "none", // "stripe_tax" | "manual" | "none"

  // Treatment PER customer class. Options: domestic_standard |
  // small_business_exemption | reverse_charge | place_of_supply_outside_estonia |
  // customer_country_vat | cross_border_sme_exemption | manual_review.
  treatment_rules: {
    estonian: { treatment: "small_business_exemption", reverseCharge: false },
    eu_business_vat: { treatment: "reverse_charge", reverseCharge: true },
    eu_business_no_vat: { treatment: "manual_review", reverseCharge: false }, // ambiguous: board confirms
    eu_consumer: { treatment: "cross_border_sme_exemption", reverseCharge: false }, // under the 10k threshold; over -> customer_country_vat (OSS)
    non_eu_business: { treatment: "place_of_supply_outside_estonia", reverseCharge: false },
    non_eu_consumer: { treatment: "place_of_supply_outside_estonia", reverseCharge: false },
  },

  // The MANAGEMENT-BOARD approval. Required to --apply.
  MANAGEMENT_BOARD_APPROVED: true, // board approved 2026-07-23
  approvedBy: "Management board (M. Kraeft)",
  approvalBasis:
    "Unregistered Estonian small-business posture with a distinct treatment per customer class: " +
    "domestic small-business exemption; reverse charge for VAT-registered EU business; place of supply " +
    "outside Estonia for non-EU; manual review for VAT-less EU business and over-threshold EU consumers " +
    "(cross-border SME exemption while under the 10k threshold).",
  evidenceReferences: [
    "docs/legal/accountant-decision-pack.md",
    "docs/legal/counsel-decision-pack.md (Answers, 2026-07-23)",
    "Management-board approval, 2026-07-23",
  ],
  professionalReviewer: null, // OPTIONAL: e.g. "Jane Doe, ACME Tax OU" (recorded as evidence)
  professionalReviewDate: null, // OPTIONAL ISO date
  nextMandatoryReviewAt: "2027-07-23T00:00:00Z", // when the posture must be re-reviewed
  notes: "Starting posture. Revise the per-class treatment + thresholds when EE VAT registration or OSS is triggered.",
};

// Thresholds to track (limits in minor units). Country-specific SME thresholds
// are added per country as the SME scheme is used in that country.
const THRESHOLDS = [
  { threshold_type: "ee_registration_40k", limit_minor: 4000000, notes: "Estonian VAT-registration threshold." },
  { threshold_type: "eu_b2c_oss_10k", limit_minor: 1000000, notes: "Cross-border EU B2C electronically supplied services." },
  { threshold_type: "union_turnover_sme", limit_minor: 10000000, notes: "Total Union turnover for the cross-border SME scheme." },
];
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const postgres = require("A:/WORK/inklee/node_modules/postgres/cjs/src/index.js");
const APPLY = process.argv.includes("--apply");
const url = fs
  .readFileSync("A:/WORK/inklee/apps/web/.env.local", "utf8")
  .match(/^DATABASE_URL=\"?([^\"\r\n]+)/m)[1];
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 8 });

(async () => {
  const now = new Date().toISOString();
  console.log(`=== record tax posture ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`);
  console.log("posture:", CONFIG.version_label, "| seller EE registered:", CONFIG.seller_vat_registered, "| calc:", CONFIG.calc_provider);
  console.log("approved_by (management board):", CONFIG.approvedBy || "(unset)");
  console.log("professional reviewer (evidence, optional):", CONFIG.professionalReviewer || "(none)");
  console.log("treatment_rules:", JSON.stringify(CONFIG.treatment_rules, null, 2));
  console.log("thresholds to seed:", THRESHOLDS.map((t) => `${t.threshold_type}=${t.limit_minor}`).join(", "));
  console.log("billing_activation_approvals: tax_policy_approved (b2b) bound_artifact=" + CONFIG.version_label);

  if (!APPLY) {
    console.log("\nDRY RUN. Fill CONFIG (treatment per class + MANAGEMENT_BOARD_APPROVED=true + approvedBy + approvalBasis + evidenceReferences), then --apply.");
    await sql.end();
    return;
  }

  // Reject whitespace-only entries so the ">=1 evidence" control can't be
  // satisfied with empty strings.
  const evidence = (
    Array.isArray(CONFIG.evidenceReferences) ? CONFIG.evidenceReferences : []
  )
    .map((s) => String(s).trim())
    .filter(Boolean);
  const approvedBy = String(CONFIG.approvedBy || "").trim();
  const approvalBasis = String(CONFIG.approvalBasis || "").trim();
  if (
    CONFIG.MANAGEMENT_BOARD_APPROVED !== true ||
    !approvedBy ||
    !approvalBasis ||
    evidence.length === 0
  ) {
    console.error(
      "\nREFUSING: MANAGEMENT_BOARD_APPROVED must be true and approvedBy + approvalBasis +\n" +
        "at least one non-empty evidenceReference set. The management board holds legal\n" +
        "responsibility for the posture; a founder/dev/single-employee approval does not substitute.",
    );
    process.exit(2);
  }

  await sql.begin(async (tx) => {
    await tx`update tax_policies set is_current = false where is_current = true`;
    await tx`
      insert into tax_policies
        (version_label, posture_version, seller_country, seller_vat_registered,
         seller_vat_number, oss_registered, calc_provider, treatment_rules,
         effective_from, is_current, management_board_approved, approved_by,
         approved_at, approval_basis, evidence_references, professional_reviewer,
         professional_review_date, next_mandatory_review_at, notes)
      values
        (${CONFIG.version_label}, ${CONFIG.posture_version}, ${CONFIG.seller_country},
         ${CONFIG.seller_vat_registered}, ${CONFIG.seller_vat_number}, ${CONFIG.oss_registered},
         ${CONFIG.calc_provider}, ${sql.json(CONFIG.treatment_rules)}, ${now}, true,
         true, ${approvedBy}, ${now}, ${approvalBasis},
         ${sql.json(evidence)}, ${CONFIG.professionalReviewer},
         ${CONFIG.professionalReviewDate}, ${CONFIG.nextMandatoryReviewAt}, ${CONFIG.notes})`;

    await tx`
      insert into billing_activation_approvals
        (approval_key, approval_group, approved, approved_by, approved_at,
         evidence_ref, bound_artifact, notes, updated_at)
      values
        ('tax_policy_approved', 'b2b', true, ${approvedBy}, ${now},
         ${evidence.join("; ")}, ${CONFIG.version_label},
         'Management-board-approved tax posture.', ${now})
      on conflict (approval_key) do update set
        approved = true, approved_by = ${approvedBy}, approved_at = ${now},
        evidence_ref = ${evidence.join("; ")},
        bound_artifact = ${CONFIG.version_label}, updated_at = ${now}`;

    for (const t of THRESHOLDS) {
      await tx`
        insert into tax_thresholds (threshold_type, limit_minor, currency, notes, updated_at)
        values (${t.threshold_type}, ${t.limit_minor}, 'eur', ${t.notes}, ${now})
        on conflict (threshold_type, coalesce(country, '')) do update set
          limit_minor = ${t.limit_minor}, notes = ${t.notes}, updated_at = ${now}`;
    }
  });

  console.log("\nAPPLIED: tax posture (current) + tax_policy_approved + thresholds recorded.");
  console.log("The tax gate is satisfied. Other b2b keys still block live billing.");
  await sql.end();
})().catch(async (e) => {
  console.error("error:", e.message);
  try { await sql.end(); } catch {}
  process.exit(1);
});
