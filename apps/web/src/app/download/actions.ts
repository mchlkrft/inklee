"use server";

import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { checkMobileWaitlistRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/get-client-ip";
import { recordPublicServerEvent } from "@/lib/public-analytics/record-server";
import {
  MOBILE_WAITLIST_SOURCE_DOWNLOAD,
  parseMobileWaitlistEmail,
  type MobileWaitlistFormResult,
} from "@/lib/mobile-waitlist";

/** Join the mobile-app launch waitlist from the /download page.
 *
 *  - Rate-limited by IP (3/hour) to prevent spam.
 *  - Duplicate emails return success (`alreadyOnList: true`) so the form
 *    feedback is identical to a first-time signup. Avoids leaking whether
 *    an email is on the list, and avoids spammy "you're already on the
 *    list" error states.
 *  - Insert goes through the service-role client; the table has RLS on
 *    with no anon policies.
 */
export async function joinMobileWaitlistAction(
  _prev: MobileWaitlistFormResult | null,
  formData: FormData,
): Promise<MobileWaitlistFormResult> {
  const parsed = parseMobileWaitlistEmail(formData.get("email"));
  if ("error" in parsed) return { error: parsed.error };

  const headerStore = await headers();
  const ip = getClientIp(headerStore);
  const { allowed } = await checkMobileWaitlistRateLimit(ip);
  if (!allowed) {
    return {
      error: "Too many submissions from this network. Try again later.",
    };
  }

  const { error } = await serviceClient.from("mobile_waitlist").insert({
    email: parsed.email,
    source: MOBILE_WAITLIST_SOURCE_DOWNLOAD,
  });

  if (error) {
    // Postgres unique_violation: row already exists. Treat as success.
    if (error.code === "23505") {
      return { success: true, alreadyOnList: true };
    }
    Sentry.captureException(error, {
      tags: { action: "mobile_waitlist_join" },
    });
    return { error: "Could not save your email. Try again." };
  }

  // Public conversion (first-time joins only; the email itself never enters
  // analytics). Awaited: a once-per-join conversion must not be lost to
  // serverless teardown, and the recorder never throws.
  await recordPublicServerEvent("beta_invite_requested", {
    headers: headerStore,
    pathname: "/download",
  });

  return { success: true, alreadyOnList: false };
}
