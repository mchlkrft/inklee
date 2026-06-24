import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. Server-only.
// HARDEN-01: the `server-only` import above fails the BUILD if this module is
// ever pulled into a client bundle (compile-time fence); the runtime window
// check below stays as defense in depth.
// Never import this from a client component or expose to the browser.
// Used only for operations the anon/user role cannot perform by design
// (e.g. audit_log inserts from unauthenticated customer actions).
if (typeof window !== "undefined") {
  throw new Error("supabase/service must not be imported in client components");
}

// Build-safe: page-data collection during `next build` evaluates server
// modules even when env vars are not provided (e.g. preview deployments
// without env scoping). Use placeholders so module evaluation succeeds;
// real values are picked up at runtime where they are always defined.
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-service-role-key";

export const serviceClient = createClient(url, key, {
  auth: { persistSession: false },
});
