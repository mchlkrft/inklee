/**
 * Test-data helpers for the e2e suite.
 *
 * Everything here talks to the ISOLATED e2e Supabase (local stack or dev
 * project) through the service-role key. tests/e2e/helpers/env.ts refuses
 * production targets before any of this runs.
 *
 * Data model notes (see docs/testing.md):
 * - "Onboarded artist" = an auth user plus a `profiles` row (slug NOT NULL
 *   UNIQUE). Books default to open, booking_mode defaults to preferred_date.
 * - A client request = a `booking_requests` row with status "pending" and a
 *   sha256(token) in customer_token_hash; the raw token drives the customer
 *   portal at /request/<token>.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { e2eEnv } from "./env";

export interface SeededArtist {
  id: string;
  email: string;
  password: string;
  slug: string;
  displayName: string;
}

export interface SeededBooking {
  id: string;
  /** Raw portal token — /request/<token>. Only its sha256 is stored. */
  token: string;
  artistId: string;
}

let adminClient: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (!adminClient) {
    const { supabaseUrl, serviceRoleKey } = e2eEnv();
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

/** Creates a confirmed auth user + onboarded profile. */
export async function createTestArtist(
  runId: string,
  name: string,
): Promise<SeededArtist> {
  const email = `e2e-${name}-${runId}@inklee-e2e.test`;
  const password = `E2e-test-${runId}-Aa1`;
  const slug = `e2e-${name}-${runId}`;
  const displayName = `E2E ${name} ${runId}`;

  const { data: created, error: userError } =
    await admin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (userError || !created.user) {
    throw new Error(`seed: createUser(${email}) failed: ${userError?.message}`);
  }

  const { error: profileError } = await admin().from("profiles").insert({
    id: created.user.id,
    slug,
    display_name: displayName,
    timezone: "Europe/Berlin",
    booking_mode: "preferred_date",
  });
  if (profileError) {
    throw new Error(`seed: profile insert failed: ${profileError.message}`);
  }

  return { id: created.user.id, email, password, slug, displayName };
}

/** Inserts a pending client request directly (bypasses the public form). */
export async function createTestBooking(
  artist: Pick<SeededArtist, "id">,
  opts?: {
    handle?: string;
    email?: string;
    preferredDate?: string;
    /** ISO timestamp override, e.g. to fabricate an expired portal link. */
    createdAt?: string;
  },
): Promise<SeededBooking> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const handle = opts?.handle ?? `e2e_client_${Date.now().toString(36)}`;
  const email = opts?.email ?? "e2e-client@inklee-e2e.test";
  const preferredDate = opts?.preferredDate ?? daysFromNow(7);

  const { data, error } = await admin()
    .from("booking_requests")
    .insert({
      artist_id: artist.id,
      status: "pending",
      origin: "public_form",
      customer_email: email,
      customer_handle: handle,
      customer_token_hash: tokenHash,
      preferred_date: preferredDate,
      form_data: {
        instagram_handle: handle,
        email,
        placement: "left forearm",
        size: "hand-sized",
        description: "automated e2e request - safe to ignore",
        preferred_date: preferredDate,
      },
      ...(opts?.createdAt ? { created_at: opts.createdAt } : {}),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seed: booking insert failed: ${error?.message}`);
  }
  return { id: data.id, token, artistId: artist.id };
}

export function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Deletes a seeded auth user; profiles + bookings cascade via FKs. */
export async function deleteTestArtist(id: string): Promise<void> {
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) {
    // Cleanup is best-effort on the isolated test DB.
    console.warn(`seed: deleteUser(${id}) failed: ${error.message}`);
  }
}
