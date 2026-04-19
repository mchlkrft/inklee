import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. Server-only.
// Never import this from a client component or expose to the browser.
// Used only for operations the anon/user role cannot perform by design
// (e.g. audit_log inserts from unauthenticated customer actions).
if (typeof window !== "undefined") {
  throw new Error("supabase/service must not be imported in client components");
}

export const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
