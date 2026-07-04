/**
 * Playwright global setup.
 *
 * 1. SAFETY: refuses to run against production (helpers/env.ts) — the suite
 *    creates users, submits bookings, and mutates artist settings.
 * 2. Seeds two onboarded artists (A drives most flows; B exists so
 *    cross-tenant checks have a victim) and exports their credentials to the
 *    spec processes via process.env + a JSON file for debugging.
 *
 * Legacy env compatibility: E2E_ARTIST_EMAIL/PASSWORD/SLUG are set from
 * artist A so the older slice smoke specs run against seeded data.
 */
import type { FullConfig } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { e2eEnv } from "./helpers/env";
import { createTestArtist } from "./helpers/seed";

export interface SeedFile {
  runId: string;
  artistA: { id: string; email: string; password: string; slug: string };
  artistB: { id: string; email: string; password: string; slug: string };
}

export const SEED_FILE = join(__dirname, ".seed.json");

export default async function globalSetup(_config: FullConfig) {
  e2eEnv(); // throws on missing config or a production target

  const runId = Date.now().toString(36);
  const artistA = await createTestArtist(runId, "a");
  const artistB = await createTestArtist(runId, "b");

  const seed: SeedFile = { runId, artistA, artistB };
  writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));

  // Warm the route patterns so the first real navigation in a test is not a
  // cold Turbopack compile (which can blow a per-test timeout under parallel
  // load on a slow CI runner). Best-effort: a GET compiles the route.
  const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
  const warmupRoutes = [
    "/login",
    "/signup",
    "/onboarding/welcome",
    "/onboarding/claim-slug",
    "/onboarding/booking",
    "/onboarding/availability",
    "/onboarding/form",
    "/onboarding/done",
    "/bookings/overview",
    "/bookings/calendar",
    "/bookings/settings",
    "/bookings/waitlist",
    "/request/submitted",
    "/request/warmup-token",
    `/${artistA.slug}`,
    `/${artistA.slug}/waitlist`,
    "/bookings/requests/00000000-0000-0000-0000-000000000000",
    "/admin",
  ];
  await Promise.allSettled(
    warmupRoutes.map((r) =>
      fetch(`${baseUrl}${r}`, { redirect: "manual" }).catch(() => undefined),
    ),
  );

  process.env.E2E_RUN_ID = runId;
  process.env.E2E_ARTIST_EMAIL = artistA.email;
  process.env.E2E_ARTIST_PASSWORD = artistA.password;
  process.env.E2E_ARTIST_SLUG = artistA.slug;
  process.env.E2E_ARTIST_ID = artistA.id;
  process.env.E2E_ARTIST_B_EMAIL = artistB.email;
  process.env.E2E_ARTIST_B_PASSWORD = artistB.password;
  process.env.E2E_ARTIST_B_SLUG = artistB.slug;
  process.env.E2E_ARTIST_B_ID = artistB.id;
}
