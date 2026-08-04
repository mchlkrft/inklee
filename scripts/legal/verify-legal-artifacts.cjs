// Legal artifact integrity validator (founder direction 2026-07-28, section 7).
//
// The invariant, end to end:
//   active source versionHash = frozen snapshot hash
//                             = approved artifact hash (billing_activation_approvals)
//                             = checkout acceptance versionHash
//
// The filesystem half also runs in CI on every commit
// (apps/web/src/lib/legal/__tests__/legal-artifact-integrity.test.ts). This
// script adds the database half and is the PRE-LAUNCH check: run it before
// recording any billing approval and before any consumer flip.
//
//   node scripts/legal/verify-legal-artifacts.cjs
//
// Read-only. Exits 1 on any violation. Checks:
//   [fs]  every versioned doc has a frozen snapshot for its declared version
//   [fs]  live source is byte-identical to that snapshot (edit => version bump)
//   [db]  terms_approved bound_artifact equals the computed snapshot hash
//   [db]  privacy_notice_approved bound_artifact equals the computed snapshot
//         hash (C1.9 / R5 Q5; binding only, not in REQUIRED_APPROVAL_KEYS)
//   [db]  version-bound policy approvals (tax, classification, withdrawal copy)
//         are bound to the CURRENT is_current version_label
//   [db]  no version-bound approval row is bound to an obsolete artifact
//
// Checkout acceptance needs no separate probe: consumer checkout records the
// buyer's accepted version through the SAME getLegalDoc read this script
// validates, so [fs] holding implies checkout captures the active version.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  repoPath,
  requireFromRepo,
  resolveEnvValue,
  envFileLabel,
  connectionTarget,
} = require("../lib/repo-root.cjs");

const LEGAL_DIR = repoPath("apps", "web", "content", "legal");
const DOC_IDS = [
  "imprint",
  "terms",
  "dpa",
  "acceptable-use",
  "privacy",
  "cookies",
  "subprocessors",
];

let failures = 0;
function fail(msg) {
  failures++;
  console.log(`  FAIL ${msg}`);
}
function ok(msg) {
  console.log(`  ok   ${msg}`);
}

function frontmatterVersion(raw, id) {
  const m = raw.match(/^version:\s*"?([^"\r\n]+)"?\s*$/m);
  if (!m) throw new Error(`${id}.md has no frontmatter version`);
  return m[1].trim();
}

// ---------------------------------------------------------------- filesystem
console.log("[fs] source vs frozen snapshot");
const hashes = {};
for (const id of DOC_IDS) {
  const livePath = path.join(LEGAL_DIR, `${id}.md`);
  const raw = fs.readFileSync(livePath, "utf8");
  let version;
  try {
    version = frontmatterVersion(raw, id);
  } catch (e) {
    fail(e.message);
    continue;
  }
  const snapshotPath = path.join(LEGAL_DIR, "_versions", version, `${id}.md`);
  if (!fs.existsSync(snapshotPath)) {
    fail(`${id} v${version}: snapshot missing (${snapshotPath})`);
    continue;
  }
  const snapshot = fs.readFileSync(snapshotPath, "utf8");
  if (raw !== snapshot) {
    fail(
      `${id} v${version}: live source differs from its frozen snapshot. ` +
        `An edit requires a version bump + new snapshot + re-approval.`,
    );
    continue;
  }
  hashes[id] = crypto.createHash("sha256").update(snapshot).digest("hex");
  ok(`${id} v${version} identical, hash ${hashes[id].slice(0, 12)}...`);
}

// ------------------------------------------------------------------ database
(async () => {
  const postgres = requireFromRepo("postgres");
  // Unchanged semantics: a MISSING credential file is an error (resolveEnvValue
  // throws, the catch below exits 1), while a present file with no DATABASE_URL
  // is the documented SKIP. Collapsing those two would let the database half
  // silently opt out on a machine that never had the file.
  const { value: dbUrl, source } = resolveEnvValue("DATABASE_URL");
  if (!dbUrl) {
    console.log(`\n[db] SKIPPED: no DATABASE_URL in the environment or ${envFileLabel()}`);
    console.log(
      "     The database half is REQUIRED before any launch-adjacent approval.",
    );
    process.exit(failures ? 1 : 0);
  }
  console.log(`\n[db] target ${connectionTarget(dbUrl)} (from ${source})`);
  const sql = postgres(dbUrl, { ssl: "require", max: 1, idle_timeout: 8 });

  console.log("\n[db] recorded approvals vs current artifacts");
  try {
    const approvals =
      await sql`select approval_key, approved, bound_artifact from billing_activation_approvals where approval_key in ('terms_approved','privacy_notice_approved','tax_policy_approved','consumer_classification_approved','consumer_withdrawal_copy_approved')`;
    const byKey = Object.fromEntries(
      approvals.map((r) => [r.approval_key, r]),
    );

    // terms_approved binds to the snapshot HASH this script just computed.
    const terms = byKey.terms_approved;
    if (!terms) ok("terms_approved: not recorded yet (nothing to validate)");
    else if (!terms.approved) ok("terms_approved: recorded but not approved");
    else if (terms.bound_artifact === hashes.terms)
      ok("terms_approved bound to the current snapshot hash");
    else
      fail(
        `terms_approved is bound to '${(terms.bound_artifact || "").slice(0, 12)}...' ` +
          `but the current snapshot hashes to '${(hashes.terms || "").slice(0, 12)}...'. ` +
          `The approval references an obsolete Terms version.`,
      );

    // privacy_notice_approved binds to the snapshot HASH the same way (C1.9 /
    // R5 Q5, counsel master package §6.1). Binding, not gating: this key is
    // deliberately absent from REQUIRED_APPROVAL_KEYS, so an unrecorded row
    // here is expected and not a failure.
    const privacyNotice = byKey.privacy_notice_approved;
    if (!privacyNotice)
      ok("privacy_notice_approved: not recorded yet (nothing to validate)");
    else if (!privacyNotice.approved)
      ok("privacy_notice_approved: recorded but not approved");
    else if (privacyNotice.bound_artifact === hashes.privacy)
      ok("privacy_notice_approved bound to the current snapshot hash");
    else
      fail(
        `privacy_notice_approved is bound to '${(privacyNotice.bound_artifact || "").slice(0, 12)}...' ` +
          `but the current snapshot hashes to '${(hashes.privacy || "").slice(0, 12)}...'. ` +
          `The approval references an obsolete privacy notice version.`,
      );

    // Policy-table artifacts bind to the is_current version_label.
    const [tax] =
      await sql`select version_label from tax_policies where is_current = true limit 1`;
    const policies =
      await sql`select policy_kind, version_label from billing_legal_policies where is_current = true`;
    const currentByKind = Object.fromEntries(
      policies.map((r) => [r.policy_kind, r.version_label]),
    );
    const POLICY_KEYS = [
      ["tax_policy_approved", tax ? tax.version_label : null],
      [
        "consumer_classification_approved",
        currentByKind.service_classification ?? null,
      ],
      [
        "consumer_withdrawal_copy_approved",
        currentByKind.withdrawal_policy ?? null,
      ],
    ];
    for (const [key, current] of POLICY_KEYS) {
      const rec = byKey[key];
      if (!rec || !rec.approved) {
        ok(`${key}: not approved yet (nothing to validate)`);
        continue;
      }
      if (current === null) {
        fail(`${key}: approved, but NO current artifact version exists`);
        continue;
      }
      if (rec.bound_artifact === current)
        ok(`${key} bound to current '${current}'`);
      else
        fail(
          `${key} bound to '${rec.bound_artifact}' but current is '${current}'`,
        );
    }
  } finally {
    await sql.end();
  }

  console.log(
    failures
      ? `\n${failures} violation(s). The gate may be open against text that no longer exists. Fix before any approval or flip.`
      : "\nAll legal artifact bindings are intact.",
  );
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("validator error:", e.message);
  process.exit(1);
});
