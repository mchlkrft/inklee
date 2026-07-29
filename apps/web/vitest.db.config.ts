import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Database regression suite (P5d, Gate A).
 *
 * Separate from the unit config on purpose. These tests talk to a real
 * Postgres through a real anon-key client with a real JWT, which is the only
 * way to exercise RLS: a service-role client bypasses policies entirely and
 * would pass whether or not they exist. That is exactly how the P5d write
 * policies shipped missing.
 *
 * Kept out of `npm test` so the default run stays hermetic and fast. Run with
 * `npm run test:db` after `supabase start`; the tests skip themselves when no
 * LOCAL Supabase is configured, and the config refuses to point anywhere else.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@inklee/shared": path.resolve(__dirname, "../../packages/shared/src"),
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
