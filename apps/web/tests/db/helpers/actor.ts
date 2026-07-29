import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dbEnv } from "./db-env";

/**
 * A real auth user with a real profile and a real anon-key client holding a
 * real JWT. Everything in `tests/db/` needs one, and the point is always the
 * same: a service-role client bypasses RLS and grants entirely, so it would
 * pass whether or not the policy under test exists.
 *
 * `collections-rls.test.ts` and `collection-items-rls.test.ts` each carry their
 * own copy of this, predating the helper. They are deliberately left alone: they
 * are green, and rewriting a green gate to save a duplication is how a gate
 * stops being trustworthy. New files use this.
 */

export type Actor = {
  id: string;
  email: string;
  client: SupabaseClient;
};

const PASSWORD = "Passw0rd!123";

export function adminClient(): SupabaseClient {
  const { url, serviceKey } = dbEnv();
  return createClient(url, serviceKey);
}

export function anonClient(): SupabaseClient {
  const { url, anonKey } = dbEnv();
  return createClient(url, anonKey);
}

export async function makeActor(
  admin: SupabaseClient,
  label: string,
): Promise<Actor> {
  const { url, anonKey } = dbEnv();
  const email = `p5d-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;

  // `profiles.slug` is NOT NULL and the upsert fails silently without it, which
  // then surfaces as an FK violation on a later insert and looks exactly like
  // an RLS problem.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
      id,
      slug: `p5d-${label}-${id.slice(0, 8)}`,
      display_name: `P5D ${label}`,
    });
  if (profileError) throw profileError;

  const client = createClient(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;

  return { id, email, client };
}

export async function destroyActor(
  admin: SupabaseClient,
  a: Actor | undefined,
): Promise<void> {
  if (!a) return;
  await admin.from("product_collection_items").delete().eq("artist_id", a.id);
  await admin.from("products").delete().eq("artist_id", a.id);
  await admin.from("product_collections").delete().eq("artist_id", a.id);
  await admin.from("profiles").delete().eq("id", a.id);
  await admin.auth.admin.deleteUser(a.id);
}
