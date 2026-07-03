import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "path";
import { e2eEnv } from "./tests/e2e/helpers/env";

// The e2e suite loads its environment EXCLUSIVELY from .env.e2e (or explicit
// process env in CI) — never .env.local, which points at production Supabase.
// global-setup hard-refuses production targets before any test runs; the same
// values are passed to the dev server below so the app under test cannot fall
// back to .env.local for the variables that matter.
loadEnv({ path: path.join(__dirname, ".env.e2e") });

// Playwright launches webServer BEFORE globalSetup, so validate here too:
// with a missing or unsafe e2e environment no dev server is started at all
// (globalSetup then fails the run with the actionable message).
let envReady = false;
try {
  e2eEnv();
  envReady = true;
} catch {
  // Reported by globalSetup.
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// Env handed to the dev server. Explicit process env beats .env.local in
// Next's env loading order, so listing a variable here pins it for the run.
const webServerEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? baseURL,
  // External providers stay inert in e2e runs: no Resend key (send skipped in
  // dev), no Stripe key (deposits degrade to the manual path), no Upstash
  // (dev rate limiter no-ops), no bio subdomain (path-mode public URLs).
  RESEND_API_KEY: process.env.E2E_RESEND_API_KEY ?? "",
  STRIPE_SECRET_KEY: process.env.E2E_STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  NEXT_PUBLIC_PUBLIC_BIO_DOMAIN: "",
};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile-smoke\.spec\.ts/,
    },
    {
      // Launch-critical mobile viewport smoke (docs/testing.md).
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile-smoke\.spec\.ts/,
    },
  ],
  // Start the dev server automatically when no external URL is provided.
  webServer:
    process.env.E2E_BASE_URL || !envReady
      ? undefined
      : {
          command: "pnpm dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: webServerEnv,
        },
});
