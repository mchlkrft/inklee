// lucide-react-native bundle slimming (roadmap ME-3): the package's entry
// re-exports all 1,713 icons and Metro does no tree-shaking, so a barrel
// import ships ~1.3MB of dead icon code. This rewrites every member import
// (`import { X } from "lucide-react-native"`) to the per-icon module at
// build time — source files keep the barrel import style and TypeScript still
// type-checks against the barrel's types.
//
// Constraints (details + the alias map live in the shared resolver):
// - Aliased icons have no file of their own; scripts/check-lucide-icons.cjs
//   runs with `pnpm typecheck` so a miss fails BEFORE it can red-screen Expo
//   Go (TypeScript accepts every alias; only resolution catches it).
// - `import type { LucideIcon }` from the bare package would be rewritten
//   into a broken VALUE import (the plugin is not type-aware). Types come
//   from "@/lib/icon-types" instead, which the plugin never sees.
const { lucideIconModule } = require("./scripts/lucide-icon-resolver.cjs");

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
