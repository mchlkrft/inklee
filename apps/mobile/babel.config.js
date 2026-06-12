const path = require("path");
const fs = require("fs");

// lucide-react-native bundle slimming (roadmap ME-3): the package's entry
// re-exports all 1,713 icons and Metro does no tree-shaking, so a barrel
// import ships ~1.3MB of dead icon code. This rewrites every member import
// (`import { X } from "lucide-react-native"`) to the per-icon module at
// build time — source files keep the barrel import style and TypeScript still
// type-checks against the barrel's types.
//
// Constraints baked in below:
// - Aliased icons have no file of their own (BarChart3 lives in
//   chart-column.mjs); extend LUCIDE_ALIASES when adding one — the existence
//   check fails the build with a pointer here otherwise.
// - `import type { LucideIcon }` from the bare package would be rewritten
//   into a broken VALUE import (the plugin is not type-aware). Types come
//   from "@/lib/icon-types" instead, which the plugin never sees.
// The package's exports map doesn't expose ./package.json, so locate the
// package root from its resolved entry file instead.
const LUCIDE_MARKER = `node_modules${path.sep}lucide-react-native${path.sep}`;
const LUCIDE_ENTRY = require.resolve("lucide-react-native");
const LUCIDE_ICONS_DIR = path.join(
  LUCIDE_ENTRY.slice(0, LUCIDE_ENTRY.indexOf(LUCIDE_MARKER) + LUCIDE_MARKER.length),
  "dist/esm/icons",
);
const LUCIDE_ALIASES = {
  BarChart3: "chart-column",
};

function lucideIconModule(member) {
  const kebab =
    LUCIDE_ALIASES[member] ??
    member
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/([A-Za-z])(\d)/g, "$1-$2")
      .toLowerCase();
  if (!fs.existsSync(path.join(LUCIDE_ICONS_DIR, `${kebab}.mjs`))) {
    throw new Error(
      `lucide-react-native has no icon module "${kebab}.mjs" for import ` +
        `"${member}". If it is an alias (like BarChart3 -> chart-column), add ` +
        `it to LUCIDE_ALIASES in babel.config.js. If it is a type, import it ` +
        `from "@/lib/icon-types" instead of the package.`,
    );
  }
  return `lucide-react-native/dist/esm/icons/${kebab}.mjs`;
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      [
        "transform-imports",
        {
          "lucide-react-native": {
            transform: lucideIconModule,
            preventFullImport: true,
          },
        },
      ],
    ],
  };
};
