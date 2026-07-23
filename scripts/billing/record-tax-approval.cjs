// Record the accountant-approved tax posture (BM-2.0). This writes the TWO
// linked records the `tax_policy_approved` activation gate needs:
//   1. a `tax_policies` row  = the actual posture (how tax is treated per
//      customer class) + the accountant's formal sign-off (approved_by_accountant).
//   2. a `billing_activation_approvals` row = tax_policy_approved -> true, BOUND
//      to that tax-policy version (so if the posture later changes, the gate
//      re-closes until re-approved).
//
//   node scripts/billing/record-tax-approval.cjs            # DRY RUN
//   node scripts/billing/record-tax-approval.cjs --apply    # write both rows
//
// It REFUSES to --apply unless ACCOUNTANT_SIGNED_OFF is true and ACCOUNTANT_NAME
// + EVIDENCE_REF are set: founder/dev approval can NEVER substitute for the
// accountant (amendment 2). Idempotent: re-running --apply supersedes the prior
// current policy.
//
// ─────────────────────────────────────────────────────────────────────────────
// FILL THIS IN WITH YOUR ACCOUNTANT'S ANSWERS, THEN RUN.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  // A stable label for this posture version, e.g. "ee-unregistered-2026-07".
  version_label: "ee-unregistered-v1",

  // Seller (Inklee OU) tax registration state at go-live.
  seller_country: "EE",
  seller_vat_registered: false, // accountant confirms (below threshold today)
  seller_vat_number: null, // set when registered
  oss_registered: false,

  // Who computes the tax amount at checkout: "stripe_tax" | "manual" | "none".
  // "none" fits an unregistered seller charging no VAT.
  calc_provider: "none",

  // THE CORE ACCOUNTANT DECISION: the treatment PER customer class. Keys are the
  // classification's vat_customer_status; each value is { treatment, reverseCharge,
  // note? }. Below is a STARTING POINT for an unregistered EE seller (no VAT
  // charged to anyone). The accountant confirms or replaces each line.
  //   treatment options: domestic_standard | reverse_charge | oss_destination |
  //                      zero_rated_export | out_of_scope
  treatment_rules: {
    eu_vat_registered_business: {
      treatment: "out_of_scope",
      reverseCharge: false,
      note: "Unregistered EE seller: no VAT charged. Accountant to confirm.",
    },
    business_without_vat: {
      treatment: "out_of_scope",
      reverseCharge: false,
      note: "Accountant to confirm.",
    },
    private_non_taxable: {
      treatment: "out_of_scope",
      reverseCharge: false,
      note: "Accountant to confirm.",
    },
    non_eu_business: {
      treatment: "out_of_scope",
      reverseCharge: false,
      note: "Accountant to confirm.",
    },
  },

  // The accountant's formal sign-off. REQUIRED to --apply.
  ACCOUNTANT_SIGNED_OFF: false, // set true ONLY after the accountant approves
  ACCOUNTANT_NAME: "", // e.g. "Jane Doe, ACME Accounting OU"
  EVIDENCE_REF: "", // e.g. an email/doc reference for the sign-off
  notes: "",
};
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
  console.log(`=== record tax approval ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`);
  console.log("tax_policies:", {
    version_label: CONFIG.version_label,
    seller_country: CONFIG.seller_country,
    seller_vat_registered: CONFIG.seller_vat_registered,
    oss_registered: CONFIG.oss_registered,
    calc_provider: CONFIG.calc_provider,
    approved_by_accountant: CONFIG.ACCOUNTANT_NAME || "(unset)",
  });
  console.log("treatment_rules:", JSON.stringify(CONFIG.treatment_rules, null, 2));
  console.log(
    "billing_activation_approvals: tax_policy_approved (b2b) approved=true bound_artifact=" +
      CONFIG.version_label,
  );

  if (!APPLY) {
    console.log("\nDRY RUN. Fill CONFIG with the accountant's answers, set");
    console.log("ACCOUNTANT_SIGNED_OFF=true + ACCOUNTANT_NAME + EVIDENCE_REF, then --apply.");
    await sql.end();
    return;
  }

  // Hard guard: the accountant sign-off cannot be skipped.
  if (
    CONFIG.ACCOUNTANT_SIGNED_OFF !== true ||
    !CONFIG.ACCOUNTANT_NAME ||
    !CONFIG.EVIDENCE_REF
  ) {
    console.error(
      "\nREFUSING: ACCOUNTANT_SIGNED_OFF must be true and ACCOUNTANT_NAME + EVIDENCE_REF set.\n" +
        "Founder/dev approval cannot substitute for the accountant (amendment 2).",
    );
    process.exit(2);
  }

  await sql.begin(async (tx) => {
    // Only one current policy at a time.
    await tx`update tax_policies set is_current = false where is_current = true`;
    await tx`
      insert into tax_policies
        (version_label, seller_country, seller_vat_registered, seller_vat_number,
         oss_registered, calc_provider, treatment_rules, effective_from, is_current,
         approved_by_accountant, approved_at, accountant_ref, notes)
      values
        (${CONFIG.version_label}, ${CONFIG.seller_country}, ${CONFIG.seller_vat_registered},
         ${CONFIG.seller_vat_number}, ${CONFIG.oss_registered}, ${CONFIG.calc_provider},
         ${sql.json(CONFIG.treatment_rules)}, ${now}, true,
         ${CONFIG.ACCOUNTANT_NAME}, ${now}, ${CONFIG.EVIDENCE_REF}, ${CONFIG.notes})`;

    await tx`
      insert into billing_activation_approvals
        (approval_key, approval_group, approved, approved_by, approved_at,
         evidence_ref, bound_artifact, notes, updated_at)
      values
        ('tax_policy_approved', 'b2b', true, ${CONFIG.ACCOUNTANT_NAME}, ${now},
         ${CONFIG.EVIDENCE_REF}, ${CONFIG.version_label},
         'Accountant-approved tax posture.', ${now})
      on conflict (approval_key) do update set
        approved = true, approved_by = ${CONFIG.ACCOUNTANT_NAME}, approved_at = ${now},
        evidence_ref = ${CONFIG.EVIDENCE_REF}, bound_artifact = ${CONFIG.version_label},
        updated_at = ${now}`;
  });

  console.log("\nAPPLIED: tax_policies (current) + tax_policy_approved recorded.");
  console.log("The tax gate is now satisfied. Other b2b keys still block live billing.");
  await sql.end();
})().catch(async (e) => {
  console.error("error:", e.message);
  try { await sql.end(); } catch {}
  process.exit(1);
});
