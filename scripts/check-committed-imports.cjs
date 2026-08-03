#!/usr/bin/env node
/**
 * Fail if the COMMITTED tree contains a named `@/` import whose target module
 * does not export it at the same commit.
 *
 * WHY THIS EXISTS. Master has failed to build its own imports three times:
 *
 *   8ba6e7e3  shipped a module with no consumer
 *   a7710919  shipped a route without its test
 *   (2026-08-03) settings/payouts/page.tsx shipped importing
 *               resolveNoSeparateCardProcessingFeesClaim, which no commit
 *               anywhere defined - `git log -S ... --all` returned nothing
 *
 * One mechanism behind all three: a pathspec commit does not close over its own
 * import graph, and the pre-commit hook typechecks the WORKING TREE rather than
 * the commit. So the author's `tsc` is green, the hook is green, and the commit
 * is broken. The third instance was found by an unrelated audit, weeks of
 * commits later, and only because someone grepped the object store instead of
 * the checkout.
 *
 * This reads blobs out of the object store on purpose. A checker that inspects
 * the working tree would reproduce the exact blind spot it is meant to close.
 *
 * DELIBERATELY CONSERVATIVE. It abstains wherever resolution is uncertain
 * (wildcard re-exports, unresolvable aliases) and reports only unambiguous
 * misses. It is NOT a substitute for typechecking: it does not see relative
 * imports, package imports, default imports, or type errors of any other kind.
 * A clean run means "no committed alias import is missing its export", nothing
 * more.
 *
 * Its first draft reported 12 misses, every one a false positive from
 * `export type { X }`, which the export matcher did not handle. Recorded
 * because a checker that cries wolf gets muted on its second run, which would
 * be worse than not having one.
 *
 * Usage: node scripts/check-committed-imports.cjs [ref]     (default HEAD)
 */
const { execFileSync } = require("child_process");

const REF = process.argv[2] || "HEAD";
const SRC_PREFIX = "apps/web/src";

/**
 * execFileSync, NOT execSync, and this is load-bearing rather than style.
 *
 * The first version interpolated the ref into a shell command. On Windows,
 * Node's execSync runs through cmd.exe, where `^` is the ESCAPE character. So
 * `git show 9a1f5c13^:path` reached git as `git show 9a1f5c13:path`: the caret
 * was consumed and the command silently read the CHILD commit instead of its
 * parent.
 *
 * The consequence is worth spelling out, because it is the reason this comment
 * is longer than the function. This script was tested by running it against a
 * commit known to contain the defect, and it reported a clean tree - not
 * because the detection was broken, but because the shell had quietly pointed
 * it at the fixed commit. A verification tool that cannot be aimed is worse
 * than none: it certifies whatever it happened to look at.
 *
 * The tell was that the file, import and abstain counts came back IDENTICAL
 * for the two refs. Two different commits producing byte-identical statistics
 * is not a pass, it is evidence that the same tree was read twice.
 *
 * (An earlier draft of this comment blamed parentheses in Next.js route-group
 * paths, `app/(artist)/...`, which look like shell syntax. That was checked and
 * is FALSE: cmd.exe passes bare parens through fine. Recorded so nobody
 * re-derives the wrong lesson from the right fix.)
 *
 * Passing argv directly removes the shell, and with it both classes of
 * surprise.
 */
function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

const tree = git(["ls-tree", "-r", "--name-only", REF]).split("\n");
const existing = new Set(tree);
const files = tree
  .filter((f) => new RegExp(`^${SRC_PREFIX}/.*\\.(ts|tsx)$`).test(f))
  .filter((f) => !f.includes("__tests__") && !f.includes(".test."));

const cache = new Map();
function blob(file) {
  if (cache.has(file)) return cache.get(file);
  let content = null;
  try {
    content = git(["show", `${REF}:${file}`]);
  } catch {
    content = null;
  }
  cache.set(file, content);
  return content;
}

function resolveAlias(spec) {
  if (!spec.startsWith("@/")) return null;
  const base = `${SRC_PREFIX}/${spec.slice(2)}`;
  return (
    [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
      (c) => existing.has(c),
    ) ?? null
  );
}

function exportsName(content, name) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (
    new RegExp(
      `export\\s+(?:declare\\s+)?(?:async\\s+)?(?:function|const|let|var|class|type|interface|enum)\\s+${n}\\b`,
    ).test(content)
  ) {
    return true;
  }
  // Both `export { a }` and `export type { a }`. Missing the second form is
  // what produced this checker's first-draft false positives.
  for (const m of content.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const seg = part.trim();
      if (!seg) continue;
      const as = seg.split(/\s+as\s+/);
      if ((as[1] ?? as[0]).trim().replace(/^type\s+/, "") === name) return true;
    }
  }
  return false;
}

const misses = [];
let checked = 0;
let abstained = 0;

for (const file of files) {
  const content = blob(file);
  if (!content) continue;
  const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["'](@\/[^"']+)["']/g;
  for (const m of content.matchAll(re)) {
    const target = resolveAlias(m[2]);
    const targetContent = target ? blob(target) : null;
    if (!targetContent || /export\s+\*\s+from/.test(targetContent)) {
      abstained++;
      continue;
    }
    for (const raw of m[1].split(",")) {
      const name = raw
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        .trim();
      if (!name) continue;
      checked++;
      if (!exportsName(targetContent, name)) {
        misses.push({ file, spec: m[2], target, name });
      }
    }
  }
}

console.log(`check-committed-imports (${REF})`);
console.log(`  files scanned:        ${files.length}`);
console.log(`  alias imports:        ${checked}`);
console.log(`  abstained (barrels):  ${abstained}`);
console.log(`  unambiguous misses:   ${misses.length}`);

if (misses.length > 0) {
  console.log("");
  for (const m of misses) {
    console.log(`  ${m.file}`);
    console.log(`     imports { ${m.name} } from "${m.spec}"`);
    console.log(`     -> ${m.target} does not export it at ${REF}`);
  }
  console.log("");
  console.log(
    "A commit importing a symbol no commit defines does not build, even when",
  );
  console.log(
    "your working tree does. Commit the missing export, or drop the import.",
  );
  process.exit(1);
}
