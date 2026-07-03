/**
 * E2E environment safety guard.
 *
 * The e2e suite creates auth users, submits bookings, and mutates artist
 * settings. It must NEVER run against the production Supabase project or the
 * production site. Local `.env.local` points at PRODUCTION Supabase (see
 * docs/testing.md), so the suite loads its target exclusively from `.env.e2e`
 * / explicit process env and hard-refuses known production hosts.
 *
 * There is deliberately no override flag. If you believe you need to run this
 * suite against production, you don't.
 */

const PROD_SUPABASE_REF = "llmzzsmppaqwecbrowlp";
const PROD_HOSTS = ["inklee.app", "inkl.ee"];

export class UnsafeE2ETargetError extends Error {}

/** Throws if the given URL points at a known production host or project. */
export function assertSafeTarget(name: string, value: string): void {
  if (value.includes(PROD_SUPABASE_REF)) {
    throw new UnsafeE2ETargetError(
      `${name} points at the PRODUCTION Supabase project (${PROD_SUPABASE_REF}). ` +
        `E2E tests refuse to run against production. Point ${name} at a local ` +
        `Supabase stack (supabase start) or a dedicated dev project via .env.e2e. ` +
        `See docs/testing.md.`,
    );
  }
  let host = "";
  try {
    host = new URL(value).hostname;
  } catch {
    return; // not a URL — nothing to check
  }
  for (const prod of PROD_HOSTS) {
    if (host === prod || host.endsWith(`.${prod}`)) {
      throw new UnsafeE2ETargetError(
        `${name} (${host}) points at the production site. E2E tests refuse ` +
          `to run against production. See docs/testing.md.`,
      );
    }
  }
}

export interface E2EEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  baseUrl: string;
}

/**
 * Resolves and validates the e2e environment. Throws with a setup hint when
 * required variables are missing, and refuses production targets.
 */
export function e2eEnv(): E2EEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error(
      "E2E environment not configured. Copy apps/web/.env.e2e.example to " +
        "apps/web/.env.e2e and point it at an ISOLATED Supabase (local stack " +
        "or dev project). Never reuse .env.local — it points at production. " +
        "See docs/testing.md.",
    );
  }

  assertSafeTarget("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
  assertSafeTarget("E2E_BASE_URL", baseUrl);

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey, baseUrl };
}
