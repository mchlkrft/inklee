// The ONE allowed type-level reference to the lucide barrel. babel.config.js
// rewrites every member IMPORT of "lucide-react-native" to a per-icon module
// (bundle slimming) and has no notion of `import type` — a type imported from
// the bare package would be rewritten into a broken value import. A type-only
// RE-EXPORT is invisible to that plugin (it only visits ImportDeclaration) and
// is erased by the TypeScript preset, so this file ships zero bytes.
//
// Components: `import type { LucideIcon } from "@/lib/icon-types"` — never
// from "lucide-react-native" directly.
export type { LucideIcon } from "lucide-react-native";
