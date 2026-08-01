import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase CLI scratch: `supabase start` / `migration up` generate this
    // gitignored directory locally, and a full `pnpm lint` then fails with
    // ~150 errors in files nobody wrote. Found 2026-08-01, the first session
    // with a local Postgres stack running; it would hit every future worker
    // who starts one before linting.
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
