import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { serviceClient } from "@/lib/supabase/service";
import { resolveConnectNext } from "@/lib/mobile-settings";
import { checkConnectKycRateLimit } from "@/lib/ratelimit";
import type { MobileConnectLink } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/settings/connect-link { next? } — mint a single-use Supabase
// magic link that signs the artist into a WEB session inside an in-app browser,
// landing on an artist settings page (Stripe Connect KYC by default). KYC PII is
// typed into the existing web form and goes straight to Stripe — it never passes
// through a native JSON body (plan risk register: "in-app browser, never a native
// PII form").
//
// Safety: the link is minted only for the ALREADY-authenticated mobile user
// (email comes from the validated Bearer token, never the client); it routes
// through the app's own /auth/confirm (verifyOtp → cookie session → redirect),
// is single-use + short-lived, and `next` is allowlisted so it can't become an
// open redirect.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  // Throttle link minting (same ceiling as the web KYC submit).
  const { allowed } = await checkConnectKycRateLimit(userId);
  if (!allowed) {
    return mobileError(
      429,
      "Too many attempts. Please try again in a little while.",
      "rate_limited",
    );
  }

  let parsedBody: { next?: unknown } = {};
  try {
    parsedBody = (await req.json()) ?? {};
  } catch {
    // Body is optional — default to the payouts page.
  }
  const next = resolveConnectNext(parsedBody.next);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email;
  if (!email) {
    return mobileError(
      400,
      "Your account needs an email to set up payouts.",
      "no_email",
    );
  }

  const origin = new URL(req.url).origin;
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${origin}${next}` },
  });
  if (error || !data?.properties?.hashed_token) {
    return mobileError(
      502,
      "Could not start payout setup. Try again.",
      "link_failed",
    );
  }

  // Build the confirm URL ourselves (we control /auth/confirm) rather than using
  // the Supabase-hosted action_link, so the cookie session lands on our origin.
  const url = `${origin}/auth/confirm?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=magiclink&next=${encodeURIComponent(next)}`;

  const body: MobileConnectLink = { url };
  return mobileOk(body);
}
