import type { APIRequestContext } from "@playwright/test";

/**
 * Creates a test booking directly via Supabase REST API using the service-role
 * key from the local test environment. Use this only when a test needs a
 * booking to exist without exercising the public form flow.
 */
export async function createTestBookingDirect(
  request: APIRequestContext,
  handle = "e2e_direct_test",
  options?: {
    preferredDate?: string;
    tripId?: string | null;
  },
): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const slug = process.env.E2E_ARTIST_SLUG;

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  if (!slug) throw new Error("E2E_ARTIST_SLUG not set");

  const profileRes = await request.get(
    `${supabaseUrl}/rest/v1/profiles?slug=eq.${slug}&select=id`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );

  const profiles = (await profileRes.json()) as Array<{ id: string }>;
  if (!profiles[0]?.id) throw new Error(`No artist found for slug "${slug}"`);
  const artistId = profiles[0].id;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const preferredDate =
    options?.preferredDate ?? tomorrow.toISOString().split("T")[0];

  const res = await request.post(`${supabaseUrl}/rest/v1/booking_requests`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: {
      artist_id: artistId,
      status: "pending",
      origin: "public_form",
      customer_email: "e2e-direct@inklee-test.invalid",
      customer_handle: handle,
      customer_token_hash: `e2e-test-token-hash-${Date.now()}`,
      form_data: {
        instagram_handle: handle,
        email: "e2e-direct@inklee-test.invalid",
        placement: "left forearm",
        size: "hand-sized",
        description: "automated smoke test - please ignore",
        preferred_date: preferredDate,
      },
      preferred_date: preferredDate,
      ...(options?.tripId ? { trip_id: options.tripId } : {}),
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
