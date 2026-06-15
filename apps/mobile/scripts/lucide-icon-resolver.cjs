// Resolves a lucide-react-native member import to its per-icon module file —
// the single source of truth shared by babel.config.js (the bundle-slimming
// rewrite) and scripts/check-lucide-icons.cjs (the typecheck-time guard).
//
// Aliased icons have no file of their own; TypeScript happily accepts them
// (the package types declare every alias) so ONLY bundling or the checker
// catches a miss. When the checker or a build throws, add the alias here —
// find the real file with:
//   grep "as <Name>," node_modules/lucide-react-native/dist/esm/lucide-react-native.mjs
const path = require("path");
const fs = require("fs");

const MARKER = `node_modules${path.sep}lucide-react-native${path.sep}`;
const ENTRY = require.resolve("lucide-react-native");
const ICONS_DIR = path.join(
  ENTRY.slice(0, ENTRY.indexOf(MARKER) + MARKER.length),
  "dist/esm/icons",
);

const LUCIDE_ALIASES = {
  BarChart3: "chart-column",
  CheckCircle2: "circle-check",
};

function lucideIconModule(member) {
  const kebab =
    LUCIDE_ALIASES[member] ??
    member
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/([A-Za-z])(\d)/g, "$1-$2")
      .toLowerCase();
  if (!fs.existsSync(path.join(ICONS_DIR, `${kebab}.mjs`))) {
    throw new Error(
      `lucide-react-native has no icon module "${kebab}.mjs" for import ` +
        `"${member}". If it is an alias (like BarChart3 -> chart-column), add ` +
        `it to LUCIDE_ALIASES in scripts/lucide-icon-resolver.cjs. If it is a ` +
        `type, import it from "@/lib/icon-types" instead of the package.`,
    );
  }
  return `lucide-react-native/dist/esm/icons/${kebab}.mjs`;
}

module.exports = { lucideIconModule };
