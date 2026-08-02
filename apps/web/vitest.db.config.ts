import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import path from "path";

/**
 * Database regression suite (P5d).
 *
 * Separate from the unit config on purpose. These tests talk to a real
 * Postgres through a real anon-key client with a real JWT, which is the only
 * way to exercise RLS: a service-role client bypasses policies entirely and
 * would pass whether or not they exist. That is exactly how the P5d write
 * policies shipped missing.
 *
 * THE ENV IS LOADED HERE, and that is not incidental. The first version of
 * this config loaded nothing, so `LOCAL` was false, every test skipped, and
 * `test:db` exited 0 having executed no statement against any database. The
 * artifact meant to prove the repair was green by vacuity, which is the same
 * failure that let the missing policies ship in the first place. A gate that
 * cannot go red is not a gate.
 *
 * `override: true` is required, not tidiness: Vitest may already carry
 * `.env.local` in `process.env`, which points at PRODUCTION, and dotenv will
 * not overwrite an already-set variable. Without it this suite could quietly
 * keep skipping or, far worse, resolve to the live project. It creates and
 * deletes real auth users.
 */
loadEnv({ path: path.join(__dirname, ".env.e2e"), override: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@inklee/shared": path.resolve(__dirname, "../../packages/shared/src"),
      // Same alias vitest.config.ts (the unit config) already carries:
      // `server-only` / `client-only` throw when imported outside Next's
      // RSC/client build. A db test that imports a real `@/lib/server/*`
      // orchestration module (e.g. account-deletion.ts, so the retention
      // carve-out can be proven against a REAL delete rather than a mock)
      // needs the same no-op so the import does not throw before the test
      // body ever runs.
      "server-only": path.resolve(__dirname, "./vitest.empty-module.ts"),
      "client-only": path.resolve(__dirname, "./vitest.empty-module.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    // One worker: these create and delete real auth users, and parallel files
    // racing on the same local instance produce failures that look like RLS
    // bugs and are not.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
