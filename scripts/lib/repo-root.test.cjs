// Tests for scripts/lib/repo-root.cjs.
//
//   node scripts/lib/repo-root.test.cjs        (or: node --test scripts/lib/)
//
// Node builtins only, so it runs anywhere the governance scripts run and needs
// no install step, no vitest project and no credentials.
//
// These tests exist because the thing being replaced (a hard-coded absolute
// developer path) failed in a way no test could observe: it worked perfectly on
// one machine. The properties asserted here are exactly the ones that silently
// held before and would silently break again:
//   - the root does not depend on the working directory,
//   - a wrong-but-plausible root FAILS instead of being used,
//   - paths are composed with the platform separator,
//   - the credential extraction is byte-identical to the pre-refactor regex.

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const lib = require("./repo-root.cjs");

const SELF = path.join(__dirname, "repo-root.cjs");

// ---------------------------------------------------------------- discovery

test("repoRoot() returns this repository's root", () => {
  const root = lib.repoRoot();
  assert.ok(path.isAbsolute(root), `expected an absolute path, got ${root}`);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.strictEqual(pkg.name, lib.EXPECTED_PACKAGE_NAME);
  assert.ok(fs.existsSync(path.join(root, "apps", "web")));
  assert.ok(fs.existsSync(path.join(root, "scripts", "lib", "repo-root.cjs")));
});

test("repoRoot() agrees with git rev-parse --show-toplevel", () => {
  let gitRoot;
  try {
    gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: lib.repoRoot(),
      encoding: "utf8",
    }).trim();
  } catch {
    return; // not a git checkout (tarball export); the other assertions still hold
  }
  // Compare resolved, case-insensitively on Windows where git reports a
  // lowercase drive letter.
  const norm = (p) => {
    const r = path.resolve(p);
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  assert.strictEqual(norm(lib.repoRoot()), norm(gitRoot));
});

test("repoRoot() does not depend on the working directory", () => {
  // Run in child processes so the module-level cache cannot mask a cwd read.
  const print = `console.log(require(${JSON.stringify(SELF)}).repoRoot())`;
  const cwds = [lib.repoRoot(), __dirname, lib.repoPath("apps", "web"), os.tmpdir()];
  const results = cwds.map((cwd) =>
    execFileSync(process.execPath, ["-e", print], { cwd, encoding: "utf8" }).trim(),
  );
  for (let i = 0; i < results.length; i++) {
    assert.strictEqual(
      results[i],
      results[0],
      `root changed when run from ${cwds[i]}: ${results[i]} != ${results[0]}`,
    );
  }
  assert.strictEqual(path.resolve(results[0]), path.resolve(lib.repoRoot()));
});

// ------------------------------------------------- no silent wrong-root use

/** Copy the module into a throwaway tree at the same depth (x/scripts/lib/) so
 *  its `path.resolve(__dirname, "..", "..")` lands on `x`, then require it
 *  fresh in a child process. */
function inFakeTree(build) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "inklee-root-test-"));
  const libDir = path.join(base, "scripts", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  const copy = path.join(libDir, "repo-root.cjs");
  fs.copyFileSync(SELF, copy);
  try {
    build(base);
    const script = `try { require(${JSON.stringify(copy)}).repoRoot(); console.log("NO_THROW"); }
      catch (e) { console.log("THREW"); console.log(e.message); }`;
    return execFileSync(process.execPath, ["-e", script], {
      cwd: os.tmpdir(),
      encoding: "utf8",
    });
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

test("an unmarked directory is rejected, not silently used", () => {
  const out = inFakeTree(() => {}); // no package.json at all
  assert.ok(out.startsWith("THREW"), `expected a throw, got: ${out}`);
  assert.match(out, /Could not confirm the Inklee repository root/);
  assert.match(out, /no package\.json at/);
});

test("a plausible-but-wrong root (different package name) is rejected", () => {
  const out = inFakeTree((base) => {
    fs.writeFileSync(
      path.join(base, "package.json"),
      JSON.stringify({ name: "some-other-monorepo", private: true }),
    );
    fs.mkdirSync(path.join(base, "apps", "web"), { recursive: true });
  });
  assert.ok(out.startsWith("THREW"), `expected a throw, got: ${out}`);
  assert.match(out, /names "some-other-monorepo", expected "inklee-monorepo"/);
});

test("the right markers in a temp tree ARE accepted (the rejection tests can fail)", () => {
  // Positive control. Without it, the two tests above would still pass if
  // repoRoot() threw for some unrelated reason on every input.
  const out = inFakeTree((base) => {
    fs.writeFileSync(
      path.join(base, "package.json"),
      JSON.stringify({ name: "inklee-monorepo", private: true }),
    );
    fs.mkdirSync(path.join(base, "apps", "web"), { recursive: true });
  });
  assert.strictEqual(out.trim(), "NO_THROW", `expected acceptance, got: ${out}`);
});

test("no environment variable can redirect the root", () => {
  const print = `console.log(require(${JSON.stringify(SELF)}).repoRoot())`;
  const poisoned = {
    ...process.env,
    INKLEE_REPO_ROOT: os.tmpdir(),
    REPO_ROOT: os.tmpdir(),
    ROOT: os.tmpdir(),
    PROJECT_ROOT: os.tmpdir(),
    INIT_CWD: os.tmpdir(),
  };
  const out = execFileSync(process.execPath, ["-e", print], {
    cwd: os.tmpdir(),
    env: poisoned,
    encoding: "utf8",
  }).trim();
  assert.strictEqual(path.resolve(out), path.resolve(lib.repoRoot()));
});

// ------------------------------------------------------------ path building

test("repoPath composes with the platform separator, never string concat", () => {
  const built = lib.repoPath("apps", "web", ".env.local");
  assert.strictEqual(built, path.join(lib.repoRoot(), "apps", "web", ".env.local"));
  assert.ok(built.includes(path.sep), `expected ${path.sep} in ${built}`);
  if (process.platform === "win32") {
    // A "/" here would mean someone concatenated instead of joining.
    assert.ok(!built.slice(2).includes("/"), `forward slash leaked into ${built}`);
  }
  assert.strictEqual(lib.repoPath(), lib.repoRoot());
});

test("envFilePath points at apps/web/.env.local inside the repo", () => {
  assert.strictEqual(lib.envFilePath(), lib.repoPath("apps", "web", ".env.local"));
  assert.strictEqual(lib.envFileLabel(), "apps/web/.env.local");
});

test("requireFromRepo resolves a workspace dependency and explains a miss", () => {
  const yaml = lib.requireFromRepo("yaml"); // root devDependency
  assert.strictEqual(typeof yaml.parse, "function");
  assert.throws(
    () => lib.requireFromRepo("this-package-does-not-exist-xyz"),
    (e) =>
      /Cannot resolve the 'this-package-does-not-exist-xyz' package/.test(e.message) &&
      /pnpm install/.test(e.message),
  );
});

// -------------------------------------- credential extraction: no behaviour change

test("parseEnvVar is byte-identical to the pre-refactor inline regex", () => {
  // The exact expression the ten scripts used inline before this refactor.
  const legacy = (raw) => {
    const m = raw.match(/^DATABASE_URL="?([^"\r\n]+)/m);
    return m ? m[1] : null;
  };
  const cases = [
    'DATABASE_URL=postgres://u:p@h:5432/db\n',
    'DATABASE_URL="postgres://u:p@h:5432/db"\n',
    'FOO=1\r\nDATABASE_URL=postgres://h/db\r\nBAR=2\r\n',
    'SHADOW_DATABASE_URL=postgres://other/db\n', // must NOT match
    'NEXT_PUBLIC_X=1\n', // absent
    '',
    'DATABASE_URL=\n', // present but empty
    'DATABASE_URL="postgres://h/db" # trailing comment\n',
    '  DATABASE_URL=indented\n', // not line-anchored -> no match
    'DATABASE_URL=first\nDATABASE_URL=second\n', // first wins
  ];
  for (const raw of cases) {
    assert.strictEqual(
      lib.parseEnvVar(raw, "DATABASE_URL"),
      legacy(raw),
      `divergence on ${JSON.stringify(raw)}`,
    );
  }
});

test("parseEnvVar escapes the variable name (no regex injection via the name)", () => {
  assert.strictEqual(lib.parseEnvVar("A.C=x\n", "A.C"), "x");
  assert.strictEqual(lib.parseEnvVar("ABC=x\n", "A.C"), null);
});

test("resolveEnvValue prefers process.env and reports its source", () => {
  const name = "INKLEE_REPO_ROOT_TEST_VAR";
  const before = process.env[name];
  try {
    process.env[name] = "  from-env  ";
    const r = lib.resolveEnvValue(name);
    assert.deepStrictEqual(r, { value: "from-env", source: "process.env" });
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
});

test("resolveEnvValue falls back to the env file, or reports it absent", () => {
  const name = "INKLEE_REPO_ROOT_TEST_ABSENT";
  delete process.env[name];
  if (!fs.existsSync(lib.envFilePath())) {
    // Missing FILE must throw; that is not the same as "value absent".
    assert.throws(() => lib.resolveEnvValue(name), /does not exist/);
    return;
  }
  const r = lib.resolveEnvValue(name);
  assert.strictEqual(r.value, null);
  assert.strictEqual(r.source, null);
});

/** Same throwaway tree as inFakeTree, but runs an arbitrary expression against
 *  the copied module so the credential branches can be exercised without
 *  depending on whether THIS machine happens to have apps/web/.env.local. */
function inFakeTreeEval(build, expression, env) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "inklee-env-test-"));
  const libDir = path.join(base, "scripts", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  const copy = path.join(libDir, "repo-root.cjs");
  fs.copyFileSync(SELF, copy);
  fs.writeFileSync(
    path.join(base, "package.json"),
    JSON.stringify({ name: "inklee-monorepo", private: true }),
  );
  fs.mkdirSync(path.join(base, "apps", "web"), { recursive: true });
  try {
    build(base);
    const script = `const lib = require(${JSON.stringify(copy)});
      try { console.log("OK " + JSON.stringify(${expression})); }
      catch (e) { console.log("THREW " + JSON.stringify(e.message)); }`;
    return execFileSync(process.execPath, ["-e", script], {
      cwd: os.tmpdir(),
      env: { ...process.env, ...env },
      encoding: "utf8",
    }).trim();
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

test("a missing env file is a loud setup error, not an absent value", () => {
  // The CI-relevant case, and the dangerous one: if this returned "absent",
  // verify-legal-artifacts.cjs would SKIP its database half and exit 0.
  const out = inFakeTreeEval(() => {}, 'lib.resolveEnvValue("DATABASE_URL")', {
    DATABASE_URL: "",
  });
  assert.ok(out.startsWith("THREW"), `expected a throw, got: ${out}`);
  assert.match(out, /DATABASE_URL is not set and apps\/web\/\.env\.local does not exist/);
});

test("a present env file supplies the value and is named as the source", () => {
  const out = inFakeTreeEval(
    (base) =>
      fs.writeFileSync(
        path.join(base, "apps", "web", ".env.local"),
        'FOO=1\nDATABASE_URL="postgresql://u:p@fake.invalid:5432/db"\n',
      ),
    'lib.resolveEnvValue("DATABASE_URL")',
    { DATABASE_URL: "" },
  );
  assert.strictEqual(
    out,
    'OK {"value":"postgresql://u:p@fake.invalid:5432/db","source":"apps/web/.env.local"}',
  );
});

test("a present env file WITHOUT the key reports absence (no throw)", () => {
  const out = inFakeTreeEval(
    (base) => fs.writeFileSync(path.join(base, "apps", "web", ".env.local"), "FOO=1\n"),
    'lib.resolveEnvValue("DATABASE_URL")',
    { DATABASE_URL: "" },
  );
  assert.strictEqual(out, 'OK {"value":null,"source":null}');
});

test("process.env wins over the file, even when the file has a value", () => {
  const out = inFakeTreeEval(
    (base) =>
      fs.writeFileSync(
        path.join(base, "apps", "web", ".env.local"),
        "DATABASE_URL=postgresql://from-file.invalid/db\n",
      ),
    'lib.resolveEnvValue("DATABASE_URL")',
    { DATABASE_URL: "postgresql://from-env.invalid/db" },
  );
  assert.strictEqual(
    out,
    'OK {"value":"postgresql://from-env.invalid/db","source":"process.env"}',
  );
});

test("connectionTarget exposes the host and never the credentials", () => {
  const url = "postgresql://someuser:s3cr3t@db.example.internal:5432/postgres";
  const target = lib.connectionTarget(url);
  assert.strictEqual(target, "db.example.internal:5432");
  assert.ok(!target.includes("s3cr3t"));
  assert.ok(!target.includes("someuser"));
  assert.strictEqual(lib.connectionTarget("not a url"), "(unparseable connection string)");
});

// -------------------------------------- the refactored scripts stay portable

test("no script under scripts/ hard-codes a machine-absolute path", () => {
  // Guards the regression directly: this is finding OPS-TOOL-001's shape.
  const offenders = [];
  const drive = /(^|[^A-Za-z0-9_])[A-Za-z]:[\\/](?:WORK|Users|home|Program)/;
  const posixHome = /(^|[^A-Za-z0-9_])\/(?:home|Users)\/[A-Za-z0-9._-]+\//;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.(cjs|mjs|js|ts|sh|ps1)$/.test(entry.name)) continue;
      const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        const code = line.replace(/^\s*(\/\/|#).*$/, ""); // comments may cite the old path
        if (drive.test(code) || posixHome.test(code)) {
          offenders.push(`${path.relative(lib.repoRoot(), full)}:${i + 1}`);
        }
      });
    }
  };
  walk(lib.repoPath("scripts"));
  assert.deepStrictEqual(offenders, [], `machine-absolute paths found: ${offenders.join(", ")}`);
});
