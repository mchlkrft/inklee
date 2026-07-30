// Repository-root discovery and repo-relative path helpers for the governance
// scripts (scripts/legal, scripts/billing, scripts/entitlements, scripts/audit).
//
// WHY THIS EXISTS
// ---------------
// Ten of those scripts previously hard-coded the absolute Windows path
// `A:/WORK/inklee` twice each: once to `require` postgres out of an absolute
// node_modules path, once to `readFileSync` an absolute apps/web/.env.local.
// They are the scripts that record legal approvals, recompute entitlement
// grandfathering and score the billing activation gate, so "only one machine on
// earth can run this check" was a governance problem, not a convenience one.
// See finding OPS-TOOL-001 in docs/audit/findings.yaml.
//
// DESIGN RULES
// ------------
// 1. The root is derived from THIS FILE's location, never from process.cwd()
//    and never from an environment variable. A script that can be pointed at a
//    different tree by an exported variable is a script whose output cannot be
//    trusted as evidence.
// 2. The derived root is VERIFIED before it is returned. A wrong-but-plausible
//    root is worse than a clear failure, so there is no fallback path: if the
//    markers are absent, every caller gets a loud error naming what was checked.
// 3. Paths are composed with path.join / path.resolve only. No string
//    concatenation of separators, so Windows and ubuntu CI behave identically.
// 4. The ONLY environment override is the credential itself (DATABASE_URL).
//    That one is genuinely necessary: CI and any second operator have no
//    apps/web/.env.local, and the alternative is a governance check that still
//    cannot be reproduced independently. Which source was used is printed, so a
//    stray exported DATABASE_URL cannot silently retarget a recorder.
//
// Zero dependencies. Node builtins only, matching the rest of scripts/.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

// scripts/lib/repo-root.cjs -> scripts/lib -> scripts -> <repo root>
const CANDIDATE_ROOT = path.resolve(__dirname, "..", "..");

// Identity marker. Checking only "does package.json exist" would accept any
// random parent directory; the name pins it to THIS repository.
const EXPECTED_PACKAGE_NAME = "inklee-monorepo";

// Relative location of the local credential file, as path segments.
const ENV_FILE_SEGMENTS = ["apps", "web", ".env.local"];

/** Returns null when `dir` is this repository's root, otherwise a human reason. */
function rootProblem(dir) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return `no package.json at ${pkgPath}`;

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch (e) {
    return `package.json at ${pkgPath} is not valid JSON (${e.message})`;
  }
  if (pkg.name !== EXPECTED_PACKAGE_NAME) {
    return `package.json at ${pkgPath} names "${pkg.name}", expected "${EXPECTED_PACKAGE_NAME}"`;
  }

  const webDir = path.join(dir, "apps", "web");
  if (!fs.existsSync(webDir)) return `no apps/web directory at ${webDir}`;

  return null;
}

function rootFailureMessage(reason) {
  return [
    "Could not confirm the Inklee repository root.",
    `  this file : ${__filename}`,
    `  candidate : ${CANDIDATE_ROOT}`,
    `  problem   : ${reason}`,
    "",
    "Paths are resolved from this file's own location. There is deliberately no",
    "fallback to the working directory and no environment override: a governance",
    "script that silently reads a different tree produces evidence about the",
    "wrong repository. Run from a complete checkout, with scripts/lib/ two levels",
    "below the repository root.",
  ].join("\n");
}

let cachedRoot = null;

/** Absolute path to the repository root. Throws with a full explanation if the
 *  location cannot be confirmed. Never guesses. */
function repoRoot() {
  if (cachedRoot) return cachedRoot;
  const reason = rootProblem(CANDIDATE_ROOT);
  if (reason) throw new Error(rootFailureMessage(reason));
  cachedRoot = CANDIDATE_ROOT;
  return cachedRoot;
}

/** path.join(repoRoot(), ...segments). Pass segments, never a pre-joined
 *  string with separators in it. */
function repoPath(...segments) {
  return path.join(repoRoot(), ...segments);
}

/** Resolve and require a dependency out of the repository's own install,
 *  independent of which workspace declares it and of pnpm's hoisting mode. */
function requireFromRepo(moduleName) {
  const searchFrom = [repoPath("apps", "web"), repoRoot()];
  let resolved;
  try {
    resolved = require.resolve(moduleName, { paths: searchFrom });
  } catch {
    throw new Error(
      [
        `Cannot resolve the '${moduleName}' package from this repository.`,
        `  searched from: ${searchFrom.join(", ")}`,
        "",
        `Run \`pnpm install\` at ${repoRoot()} and try again.`,
      ].join("\n"),
    );
  }
  return require(resolved);
}

/** Absolute path of the local credential file (apps/web/.env.local). */
function envFilePath() {
  return repoPath(...ENV_FILE_SEGMENTS);
}

/** Repo-relative label for messages, e.g. "apps/web/.env.local". */
function envFileLabel() {
  return ENV_FILE_SEGMENTS.join("/");
}

/** Extract one variable from a .env file body.
 *
 *  Byte-for-byte the same extraction the ten scripts did inline before this
 *  refactor (`/^NAME="?([^"\r\n]+)/m`): line-anchored, tolerates one leading
 *  double quote, stops at the next quote or end of line. Kept identical on
 *  purpose so the refactor cannot change which connection string a recorder
 *  uses. Exported for the test that asserts that equivalence. */
function parseEnvVar(raw, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = raw.match(new RegExp(`^${escaped}="?([^"\\r\\n]+)`, "m"));
  return m ? m[1] : null;
}

/** Resolve a variable from process.env first, then apps/web/.env.local.
 *
 *  Returns { value, source }. `value` is null when neither source supplies it
 *  and the file exists (the caller decides whether that is fatal).
 *
 *  THROWS when the variable is unset AND the file is missing. That case is a
 *  setup error, not "the value is absent", and collapsing the two would let a
 *  check silently skip itself on a machine that simply never had the file. */
function resolveEnvValue(name) {
  const fromEnv = process.env[name];
  if (fromEnv && fromEnv.trim()) return { value: fromEnv.trim(), source: "process.env" };

  const file = envFilePath();
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(
        [
          `${name} is not set and ${envFileLabel()} does not exist.`,
          `  looked for: ${file}`,
          "",
          `Either export ${name}, or create ${envFileLabel()} (the vault mirrors it).`,
        ].join("\n"),
      );
    }
    throw e;
  }

  const value = parseEnvVar(raw, name);
  return { value, source: value === null ? null : envFileLabel() };
}

/** Best-effort host of a connection string, for a one-line "which database am I
 *  about to touch" disclosure. Never returns credentials. */
function connectionTarget(url) {
  try {
    return new URL(url).host || "(no host)";
  } catch {
    return "(unparseable connection string)";
  }
}

/** DATABASE_URL or a clear exit. Prints the target host and which source it came
 *  from, so an exported DATABASE_URL cannot silently retarget a recorder that
 *  the operator believes is pointed at production. */
function requireDatabaseUrl({ announce = true } = {}) {
  let resolved;
  try {
    resolved = resolveEnvValue("DATABASE_URL");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  if (!resolved.value) {
    console.error(
      [
        `DATABASE_URL not found (checked process.env and ${envFileLabel()}).`,
        `  env file: ${envFilePath()}`,
      ].join("\n"),
    );
    process.exit(1);
  }
  if (announce) {
    console.log(`db target: ${connectionTarget(resolved.value)} (from ${resolved.source})`);
  }
  return resolved.value;
}

module.exports = {
  EXPECTED_PACKAGE_NAME,
  repoRoot,
  repoPath,
  requireFromRepo,
  envFilePath,
  envFileLabel,
  parseEnvVar,
  resolveEnvValue,
  connectionTarget,
  requireDatabaseUrl,
  // Exported for tests only: the unverified candidate and the verifier.
  _CANDIDATE_ROOT: CANDIDATE_ROOT,
  _rootProblem: rootProblem,
};
