// Validates every lucide-react-native member import in the app against the
// babel transform's resolver, so an aliased icon (which TypeScript accepts but
// Metro cannot resolve to a per-icon file) fails at typecheck time instead of
// red-screening Expo Go. Runs as part of `pnpm typecheck` (and therefore the
// pre-commit hook and CI).
//
//   node scripts/check-lucide-icons.cjs   (run from apps/mobile)
const path = require("path");
const fs = require("fs");
const { lucideIconModule } = require("./lucide-icon-resolver.cjs");

const ROOTS = [path.join(__dirname, "../app"), path.join(__dirname, "../src")];
const IMPORT_RE = /import\s*(type\s*)?\{([^}]*)\}\s*from\s*["']lucide-react-native["']/g;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

let failures = 0;
let checked = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, "utf8");
    for (const match of src.matchAll(IMPORT_RE)) {
      const typeOnly = !!match[1];
      const members = match[2]
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
      for (const raw of members) {
        const rel = path.relative(path.join(__dirname, ".."), file);
        // `type X` inline specifiers and whole type-only imports would be
        // rewritten into broken VALUE imports by the babel transform.
        if (typeOnly || raw.startsWith("type ")) {
          console.error(
            `${rel}: type import "${raw.replace(/^type\s+/, "")}" from ` +
              `"lucide-react-native" — import types from "@/lib/icon-types" ` +
              `instead (the babel rewrite is not type-aware).`,
          );
          failures++;
          continue;
        }
        const member = raw.split(/\s+as\s+/)[0].trim();
        checked++;
        try {
          lucideIconModule(member);
        } catch (e) {
          console.error(`${rel}: ${e.message}`);
          failures++;
        }
      }
    }
  }
}

if (failures > 0) {
  console.error(`\ncheck-lucide-icons: ${failures} problem(s).`);
  process.exit(1);
}
console.log(`check-lucide-icons: ${checked} icon imports OK.`);
