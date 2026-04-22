import type { APIRequestContext } from "@playwright/test";

/**
 * Creates a test booking directly via Supabase REST API, bypassing the public
 * form and its rate limit. Use this when the test only needs a booking to exist
 * (e.g. to test deposit flow), not when testing the form submission itself.
 */
export async function createTestBookingDirect(
  request: APIRequestContext,
  handle = "e2e_direct_test",
): Promise<string> {
  const supabaseUrl = "https://llmzzsmppaqwecbrowlp.supabase.co";
  const anonKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsbXp6c21wcGFxd2VjYnJvd2xwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTUyNjYsImV4cCI6MjA5MjEzMTI2Nn0.B-K2VFG12wI89aHUKxwqstivYnPaRtx9-8In3hfmo4s";
  const slug = process.env.E2E_ARTIST_SLUG!;

  // Resolve artist_id from slug
  const profileRes = await request.get(
    `${supabaseUrl}/rest/v1/profiles?slug=eq.${slug}&select=id`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
  );
  const profiles = (await profileRes.json()) as Array<{ id: string }>;
  if (!profiles[0]?.id) throw new Error(`No artist found for slug "${slug}"`);
  const artistId = profiles[0].id;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const res = await request.post(`${supabaseUrl}/rest/v1/booking_requests`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: {
      artist_id: artistId,
      status: "pending",
      origin: "public_form",
      customer_email: "e2e-direct@inklee-test.invalid",
      customer_handle: handle,
      customer_token_hash: "e2e-test-token-hash-" + Date.now(),
      form_data: {
        instagram_handle: handle,
        email: "e2e-direct@inklee-test.invalid",
        placement: "left forearm",
        size: "hand-sized",
        description: "automated smoke test — please ignore",
        preferred_date: tomorrow.toISOString().split("T")[0],
      },
      preferred_date: tomorrow.toISOString().split("T")[0],
    },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Failed to create test booking: ${res.status()} ${body}`);
  }

  const rows = (await res.json()) as Array<{ id: string }>;
  if (!rows[0]?.id) throw new Error("Booking insert returned no ID");
  return rows[0].id;
}
